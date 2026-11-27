import { type ClientInvoiceMatch } from './job-pnl';
import type { QboCustomer, QboEstimate, QboInvoice } from './qbo';
import type { AgentBatchRunResult, AgentJobVerdict } from './qbo-invoice-agent';
import {
  boundedMatrixInText,
  buildJobDossier,
  daysAgo,
  type JobDossier,
  type JobLike,
  type QboCrawlContext,
} from './qbo-invoice-tools';

export const RESOLVER_MODEL_ID = 'qbo-graph-resolver';

const MAX_GENERAL_AGE_DAYS = 195; // ~6.5 months
const MAX_MATRIX_AGE_DAYS = 275;  // ~9 months for exact bounded matrix match
const MAX_INVOICES_PER_JOB = 2;

const GENERIC_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'into', 'over', 'under',
  'vinyl', 'record', 'records', 'pressing', 'press', 'repress', 'variants', 'variant',
  'sets', 'set', 'standard', 'special', 'edition', 'color', 'colors', 'black', 'clear',
  'trans', 'translucent', 'splatter', 'smoke', 'marble', 'coke', 'bottle', 'yellow',
  'green', 'blue', 'red', 'white', 'pink', 'purple', 'orange', 'gold', 'silver',
  'lp', '2lp', '2xlp', 'ep', 'tbc', 'tbd', 'due', 'use', 'labels', 'label', 'paper',
  'hole', 'large', 'pic', 'take', 'being', 'live', 'vol', 'music', 'sound', 'songs',
  'single', 'singles', 'album', 'project', 'band', 'trio', 'estate', 'club', 'sessions',
  'session', 'new', 'orleans', 'deposit', 'balance', 'final', 'invoice', 'order',
  'shipping', 'freight', 'test', 'tests', 'jacket', 'jackets', 'sleeve', 'sleeves',
  'insert', 'inserts', 'shrink', 'wrap', 'assembly', 'packing', 'only', 'misc',
  'partial', 'style', 'side', 'blank', 'confirm', 'rush', 'done', 'waiting',
]);

const NON_PRESSING_ONLY_PATTERN = /\b(shipping|freight|ups|fedex|postage|delivery|post\s*office|box\s*fee|storage|consulting|misc\s*fee)\b/i;
const PRESSING_LINE_PATTERN = /\b(vinyl|press|pressing|12["']|7["']|10["']|lp\b|2lp|jacket|sleeve|center\s*label|stamper|lacquer|plate|plating|test\s*press|record|deposit|balance|production|repress|assembly|shrink|download\s*card|obi|gatefold|insert|mailer)\b/i;

type EnrichedInvoice = {
  invoice: QboInvoice;
  ageDays: number;
  ownText: string;          // docNumber + customFields + memo + privateNote + lines
  customerText: string;     // customerName + company + email + notes + billEmail + shipTo + parent
  estimateText: string;     // linked / matched estimate texts
  fullText: string;         // ownText + customerText + estimateText
  normalizedFull: string;
  normalizedOwn: string;
  normalizedCustomer: string;
  fullTokens: Set<string>;
  ownTokens: Set<string>;
  customerTokens: Set<string>;
  linkedEstimateIds: Set<string>;
  lineQuantities: number[];
  isPressingInvoice: boolean;
  isDepositOrBalance: boolean;
};

type QboKnowledgeGraph = {
  enrichedInvoices: EnrichedInvoice[];
  enrichedById: Map<string, EnrichedInvoice>;
  prefixToCustomerIds: Map<string, Set<string>>;
  acronymToCustomerIds: Map<string, Set<string>>;
};

type CandidateEdge = {
  jobKey: string;
  invoiceId: string;
  tier: number;     // 5 = exact matrix, 4 = artist+album, 3 = contact/label+album or artist, 2 = single-entity pressing, 1 = unique artist + qty/price pressing
  score: number;
  reason: string;
  evidence: string[];
  hasExactMatrix: boolean;
  matchedAlbum: boolean;
  matchedArtist: boolean;
  matchedContact: boolean;
  matchedLabelCustomer: boolean;
  matchedQuantity: boolean;
  matchedPrice: boolean;
};

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/gi, 'ae')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function tokenize(value: string, minLen = 3): string[] {
  const norm = normalizeText(value);
  if (!norm) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of norm.split(' ')) {
    if (token.length < minLen || GENERIC_WORDS.has(token) || /^\d+$/.test(token)) continue;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function allTokensSet(value: string): Set<string> {
  const norm = normalizeText(value);
  if (!norm) return new Set();
  return new Set(norm.split(' ').filter(t => t.length >= 2));
}

function levenshteinAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 6 || b.length < 6) return false;
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else {
      diffs += 1;
      if (diffs > 1) return false;
      if (a.length > b.length) i += 1;
      else if (b.length > a.length) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
  }
  return diffs + (a.length - i) + (b.length - j) <= 1;
}

function tokenPresent(token: string, tokenSet: Set<string>): boolean {
  if (tokenSet.has(token)) return true;
  if (token.length >= 6) {
    for (const candidate of tokenSet) {
      if (candidate.length >= 6 && levenshteinAtMost1(token, candidate)) return true;
    }
  }
  return false;
}

function phraseMatches(phrase: string, normalizedTarget: string, targetTokens: Set<string>, options?: { allowSingleDistinctive?: boolean }): boolean {
  const normPhrase = normalizeText(phrase);
  if (!normPhrase || normPhrase.length < 3) return false;

  // 1. Direct bounded phrase match
  if (normPhrase.length >= 4) {
    const escaped = normPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(normalizedTarget)) {
      return true;
    }
  }

  // 2. Compact match for multi-word names joined in emails/handles (e.g. "califiafarms", "royalpotatofamily")
  const compactPhrase = compactText(phrase);
  if (compactPhrase.length >= 7 && compactText(normalizedTarget).includes(compactPhrase)) {
    return true;
  }

  // 3. Token-level match
  const tokens = tokenize(phrase, 3);
  if (!tokens.length) return false;

  if (tokens.length === 1) {
    const only = tokens[0];
    if (only.length >= 5 && (options?.allowSingleDistinctive ?? true)) {
      return tokenPresent(only, targetTokens);
    }
    return false;
  }

  const hits = tokens.filter(tok => tokenPresent(tok, targetTokens));
  if (tokens.length === 2) {
    return hits.length === 2;
  }
  // 3+ meaningful tokens: require at least 2/3 (min 2) to match
  return hits.length >= Math.max(2, Math.ceil(tokens.length * 0.67));
}

function isDateLikeNumericMatrix(rawMatrix: string): boolean {
  const digits = rawMatrix.replace(/[^a-z0-9]/gi, '');
  if (!/^\d{6,8}$/.test(digits)) return false;
  // e.g. 20261110 or 02242026
  return /^(20\d{6}|[01]\d[0-3]\d20\d\d)$/.test(digits);
}

function extractPrefixesFromText(text: string): string[] {
  const found = new Set<string>();
  const matches = text.matchAll(/\b([A-Za-z]{2,8})[\s\-_]?(\d{2,5})(?:[A-Za-z]{0,2})\b/g);
  for (const match of matches) {
    const prefix = match[1].toUpperCase();
    if (
      prefix.length >= 2 &&
      !['INV', 'EST', 'PO', 'NO', 'NUM', 'QTY', 'USD', 'LP', 'EP', 'RPM', 'NORP', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'BOX', 'LOT', 'SKU', 'REF', 'TAX', 'NET', 'DUE', 'PAY', 'FEE', 'UPS', 'ZIP', 'APT', 'STE'].includes(prefix)
    ) {
      found.add(prefix);
    }
  }
  return [...found];
}

function customerAcronyms(customer: QboCustomer, parent?: QboCustomer): string[] {
  const acronyms = new Set<string>();
  const sources = [
    customer.displayName,
    customer.companyName,
    parent?.displayName || '',
    parent?.companyName || '',
  ].filter(Boolean);

  for (const source of sources) {
    const words = source.replace(/['’]/g, '').match(/[A-Za-z0-9]+/g) || [];
    if (words.length >= 2 && words.length <= 6) {
      const fullInitials = words.map(w => w[0]).join('').toUpperCase();
      if (fullInitials.length >= 2) acronyms.add(fullInitials);
      // Also initials dropping trailing "Records" / "LLC" / "Inc" / "Co" / "Music"
      const trimmed = words.filter(w => !/^(llc|inc|ltd|co|corp|company|records|record|recording|recordings|music|group|entertainment|productions)$/i.test(w));
      if (trimmed.length >= 2) {
        acronyms.add(trimmed.map(w => w[0]).join('').toUpperCase());
      }
      // First word + "R" / "RC" (e.g., "Valcour Records" -> "VAL", "VR")
      const firstWord = words[0] || '';
      if (firstWord.length >= 4) {
        acronyms.add(firstWord.slice(0, 3).toUpperCase());
        acronyms.add(firstWord.slice(0, 4).toUpperCase());
      }
    } else if (words.length === 1 && (words[0]?.length ?? 0) >= 4) {
      const single = words[0]!;
      acronyms.add(single.slice(0, 3).toUpperCase());
      acronyms.add(single.toUpperCase());
    }
  }
  return [...acronyms];
}

function buildKnowledgeGraph(ctx: QboCrawlContext): QboKnowledgeGraph {
  const customersById = new Map(ctx.customers.map(c => [c.id, c]));
  const estimatesById = new Map(ctx.estimates.map(e => [e.id, e]));

  // Bidirectional invoice -> linked estimate IDs
  const estimateIdsByInvoiceId = new Map<string, Set<string>>();
  const addEstLink = (invoiceId: string, estimateId: string) => {
    if (!invoiceId || !estimateId) return;
    if (!estimateIdsByInvoiceId.has(invoiceId)) estimateIdsByInvoiceId.set(invoiceId, new Set());
    estimateIdsByInvoiceId.get(invoiceId)!.add(estimateId);
  };

  for (const inv of ctx.invoices) {
    for (const link of inv.linkedTxnIds || []) {
      if (link.txnType.toLowerCase() === 'estimate' && estimatesById.has(link.txnId)) {
        addEstLink(inv.id, link.txnId);
      }
    }
  }
  for (const est of ctx.estimates) {
    for (const link of est.linkedTxnIds || []) {
      if (link.txnType.toLowerCase() === 'invoice') {
        addEstLink(link.txnId, est.id);
      }
    }
  }

  // Group estimates by customerId for amount-based deposit/full estimate pairing
  const estimatesByCustomer = new Map<string, QboEstimate[]>();
  for (const est of ctx.estimates) {
    if (!est.customerId) continue;
    if (!estimatesByCustomer.has(est.customerId)) estimatesByCustomer.set(est.customerId, []);
    estimatesByCustomer.get(est.customerId)!.push(est);
  }

  // Auto-learn matrix prefixes -> customerIds from ALL historical QBO invoices & estimates
  const prefixToCustomerIds = new Map<string, Set<string>>();
  const recordPrefix = (prefix: string, customerId: string) => {
    if (!prefix || !customerId) return;
    if (!prefixToCustomerIds.has(prefix)) prefixToCustomerIds.set(prefix, new Set());
    prefixToCustomerIds.get(prefix)!.add(customerId);
  };

  for (const inv of ctx.invoices) {
    if (!inv.customerId) continue;
    const text = [
      inv.privateNote,
      inv.memo,
      ...(inv.customFields || []).map(f => `${f.name} ${f.value}`),
      ...(inv.lines || []).map(l => `${l.itemName} ${l.description}`),
    ].join(' ');
    for (const prefix of extractPrefixesFromText(text)) {
      recordPrefix(prefix, inv.customerId);
    }
  }
  for (const est of ctx.estimates) {
    if (!est.customerId) continue;
    for (const prefix of extractPrefixesFromText(est.searchText)) {
      recordPrefix(prefix, est.customerId);
    }
  }

  // Build customer acronym map (e.g. "Royal Potato Family" -> "RPF", "Tipitina's Record Club" -> "TRC")
  const acronymToCustomerIds = new Map<string, Set<string>>();
  for (const customer of ctx.customers) {
    const parent = customer.parentId ? customersById.get(customer.parentId) : undefined;
    for (const code of customerAcronyms(customer, parent)) {
      if (!acronymToCustomerIds.has(code)) acronymToCustomerIds.set(code, new Set());
      acronymToCustomerIds.get(code)!.add(customer.id);
    }
  }

  // Enrich all recent invoices (within MAX_MATRIX_AGE_DAYS)
  const enrichedInvoices: EnrichedInvoice[] = [];
  const enrichedById = new Map<string, EnrichedInvoice>();

  for (const invoice of ctx.invoices) {
    const ageDays = daysAgo(invoice.txnDate, ctx.now);
    if (!Number.isFinite(ageDays) || ageDays > MAX_MATRIX_AGE_DAYS || ageDays < -14) continue;

    const customer = invoice.customerId ? customersById.get(invoice.customerId) : undefined;
    const parentCustomer = customer?.parentId ? customersById.get(customer.parentId) : undefined;

    const linkedEstimateIds = new Set<string>(estimateIdsByInvoiceId.get(invoice.id) || []);

    // Also associate same-customer estimate when total matches 100% or ~50% deposit within 120 days
    if (invoice.customerId && invoice.totalAmt >= 250) {
      const custEstimates = estimatesByCustomer.get(invoice.customerId) || [];
      for (const est of custEstimates) {
        if (linkedEstimateIds.has(est.id) || est.totalAmt <= 0) continue;
        const estAge = daysAgo(est.txnDate, ctx.now);
        if (!Number.isFinite(estAge)) continue;
        const gapDays = estAge - ageDays; // estimate usually created on or before invoice
        if (gapDays < -14 || gapDays > 150) continue;
        const ratio = invoice.totalAmt / est.totalAmt;
        if ((ratio >= 0.96 && ratio <= 1.04) || (ratio >= 0.47 && ratio <= 0.53)) {
          linkedEstimateIds.add(est.id);
        }
      }
    }

    const ownText = [
      invoice.docNumber,
      invoice.privateNote,
      invoice.memo,
      ...(invoice.customFields || []).map(f => `${f.name} ${f.value}`),
      ...(invoice.lines || []).map(l => `${l.itemName} ${l.description} ${l.qty ? `qty ${l.qty}` : ''}`),
    ].filter(Boolean).join(' ');

    const customerText = [
      invoice.customerName,
      invoice.customerCompany,
      invoice.customerEmail,
      invoice.customerNotes,
      invoice.billEmail,
      invoice.shipTo,
      customer?.givenName && customer?.familyName ? `${customer.givenName} ${customer.familyName}` : '',
      parentCustomer?.displayName || '',
      parentCustomer?.companyName || '',
      parentCustomer?.email || '',
      parentCustomer?.notes || '',
    ].filter(Boolean).join(' ');

    const estimateText = [...linkedEstimateIds]
      .map(id => estimatesById.get(id)?.searchText || '')
      .filter(Boolean)
      .join(' ');

    const fullText = [ownText, customerText, estimateText, invoice.searchText].filter(Boolean).join(' ');
    const normalizedOwn = normalizeText(ownText);
    const normalizedCustomer = normalizeText(customerText);
    const normalizedFull = normalizeText(fullText);

    const lineQuantities = (invoice.lines || [])
      .map(l => Math.round(Number(l.qty || 0)))
      .filter(qty => Number.isFinite(qty) && qty >= 25);

    const hasPressingLine = PRESSING_LINE_PATTERN.test(ownText) || PRESSING_LINE_PATTERN.test(estimateText);
    const onlyShippingOrMisc = NON_PRESSING_ONLY_PATTERN.test(ownText) && !hasPressingLine && invoice.totalAmt < 600;
    const isPressingInvoice = !onlyShippingOrMisc && (hasPressingLine || invoice.totalAmt >= 450 || lineQuantities.some(q => q >= 50));
    const isDepositOrBalance = /\b(deposit|balance|final|50%|remaining|installment|payment\s*[12])\b/i.test(ownText);

    const enriched: EnrichedInvoice = {
      invoice,
      ageDays,
      ownText,
      customerText,
      estimateText,
      fullText,
      normalizedFull,
      normalizedOwn,
      normalizedCustomer,
      fullTokens: allTokensSet(fullText),
      ownTokens: allTokensSet(`${ownText} ${estimateText}`),
      customerTokens: allTokensSet(customerText),
      linkedEstimateIds,
      lineQuantities,
      isPressingInvoice,
      isDepositOrBalance,
    };

    enrichedInvoices.push(enriched);
    enrichedById.set(invoice.id, enriched);
  }

  return {
    enrichedInvoices,
    enrichedById,
    prefixToCustomerIds,
    acronymToCustomerIds,
  };
}

function quantityMatchesDossier(dossier: JobDossier, enriched: EnrichedInvoice): number | null {
  const targets = [dossier.quantity, dossier.setsCount].filter(q => q >= 50);
  if (!targets.length) return null;
  for (const target of targets) {
    for (const qty of enriched.lineQuantities) {
      if (qty === target || (target >= 200 && qty === target / 2) || (qty >= 200 && qty / 2 === target)) {
        return qty;
      }
    }
    // Also check "500 pcs" / "500 units" / "500 copies" / "300 sets" in line text
    if (new RegExp(`\\b${target}\\s*(pcs|pieces|units|copies|records|lps|sets|x\\b|vinyl)\\b`, 'i').test(enriched.ownText)) {
      return target;
    }
  }
  return null;
}

function priceMatchesDossier(dossier: JobDossier, invoice: QboInvoice): boolean {
  const expected = dossier.airtableInvoiceTotal;
  if (!expected || expected < 100 || invoice.totalAmt < 100) return false;
  const fullDiff = Math.abs(invoice.totalAmt - expected) / expected;
  if (fullDiff <= 0.03) return true;
  const halfDiff = Math.abs(invoice.totalAmt - expected / 2) / (expected / 2);
  return halfDiff <= 0.04;
}

function matchedMatrixForDossier(dossier: JobDossier, enriched: EnrichedInvoice): string | null {
  // Search invoice ownText + estimateText (and fullText for non-date matrices)
  const searchSurface = `${enriched.ownText} ${enriched.estimateText}`;
  for (const matrix of dossier.matrixValues) {
    if (isDateLikeNumericMatrix(matrix)) {
      // Only accept date-like numeric matrix if it explicitly appears in lines/customFields/memo/estimate (not txnDate)
      if (boundedMatrixInText(searchSurface, matrix)) return matrix;
    } else if (boundedMatrixInText(enriched.fullText, matrix)) {
      return matrix;
    }
  }
  return null;
}

function contactMatchForDossier(dossier: JobDossier, enriched: EnrichedInvoice): string | null {
  for (const contact of dossier.contacts) {
    const tokens = tokenize(contact, 3);
    // Avoid matching a bare single first name like "(Dan)" against random invoice body text;
    // require either 2+ tokens OR a single distinctive >=5-char token in customerText
    if (tokens.length >= 2) {
      if (phraseMatches(contact, enriched.normalizedFull, enriched.fullTokens, { allowSingleDistinctive: false })) {
        return contact;
      }
    } else if (tokens.length === 1 && tokens[0].length >= 5) {
      if (phraseMatches(contact, enriched.normalizedCustomer, enriched.customerTokens, { allowSingleDistinctive: true })) {
        return contact;
      }
    }
  }
  return null;
}

function labelCustomerMatchForDossier(
  dossier: JobDossier,
  enriched: EnrichedInvoice,
  graph: QboKnowledgeGraph,
): string | null {
  const customerId = enriched.invoice.customerId;
  if (!customerId) return null;
  for (const prefix of dossier.matrixPrefixes) {
    if (graph.prefixToCustomerIds.get(prefix)?.has(customerId)) {
      return `${prefix} -> ${enriched.invoice.customerName || enriched.invoice.customerCompany}`;
    }
    if (graph.acronymToCustomerIds.get(prefix)?.has(customerId)) {
      return `${prefix} -> ${enriched.invoice.customerCompany || enriched.invoice.customerName}`;
    }
  }
  return null;
}

function scorePair(
  dossier: JobDossier,
  enriched: EnrichedInvoice,
  graph: QboKnowledgeGraph,
  allDossiers: JobDossier[],
  artistJobCounts: Map<string, number>,
): CandidateEdge | null {
  const inv = enriched.invoice;
  const exactMatrix = matchedMatrixForDossier(dossier, enriched);

  // Recency gate: 275d for exact matrix, 195d otherwise
  if (!exactMatrix && enriched.ageDays > MAX_GENERAL_AGE_DAYS) {
    return null;
  }

  // Hard cross-job matrix conflict: if invoice explicitly contains another active job's bounded matrix, reject
  if (!exactMatrix) {
    for (const other of allDossiers) {
      if (other.jobKey === dossier.jobKey) continue;
      if (matchedMatrixForDossier(other, enriched)) {
        return null;
      }
    }
  }

  const artistNorm = normalizeText(dossier.artist);
  const artistTokens = tokenize(dossier.artist, 3);
  const hasStrongArtist = artistTokens.length >= 2 || (artistTokens.length === 1 && artistTokens[0].length >= 5);

  const albumTokens = tokenize(dossier.album, 3);
  const hasRealAlbum = albumTokens.length >= 2 || (albumTokens.length === 1 && albumTokens[0].length >= 5);

  const matchedArtist = hasStrongArtist
    ? phraseMatches(dossier.artist, enriched.normalizedFull, enriched.fullTokens, { allowSingleDistinctive: true })
    : false;

  // Album should appear in invoice ownText/estimateText OR fullText (not just customer name unless identical)
  const matchedAlbum = hasRealAlbum
    ? phraseMatches(dossier.album, `${enriched.normalizedOwn} ${normalizeText(enriched.estimateText)}`, new Set([...enriched.ownTokens, ...allTokensSet(enriched.estimateText)]), { allowSingleDistinctive: true })
      || (albumTokens.length >= 2 && phraseMatches(dossier.album, enriched.normalizedFull, enriched.fullTokens, { allowSingleDistinctive: false }))
    : false;

  const matchedContactName = contactMatchForDossier(dossier, enriched);
  const matchedLabel = labelCustomerMatchForDossier(dossier, enriched, graph);
  const matchedQty = quantityMatchesDossier(dossier, enriched);
  const matchedPrice = priceMatchesDossier(dossier, inv);

  // Hard sibling-album conflict: if another board job by the same artist (or same contact/prefix)
  // has its album explicitly on this invoice and THIS job's album is NOT on this invoice -> reject!
  if (!exactMatrix && !matchedAlbum) {
    for (const other of allDossiers) {
      if (other.jobKey === dossier.jobKey) continue;
      const sameArtist = artistNorm && normalizeText(other.artist) === artistNorm;
      const samePrefix = dossier.matrixPrefixes.some(p => other.matrixPrefixes.includes(p));
      const sameContact = dossier.contacts.some(c => other.contacts.some(oc => normalizeText(c) === normalizeText(oc)));
      if (!sameArtist && !samePrefix && !sameContact) continue;

      const otherAlbumTokens = tokenize(other.album, 3);
      const otherHasAlbum = otherAlbumTokens.length >= 2 || (otherAlbumTokens.length === 1 && otherAlbumTokens[0].length >= 5);
      if (!otherHasAlbum) continue;
      if (normalizeText(other.album) === normalizeText(dossier.album)) continue;

      if (phraseMatches(other.album, enriched.normalizedFull, enriched.fullTokens, { allowSingleDistinctive: true })) {
        return null;
      }
    }
  }

  const artistCount = artistNorm ? (artistJobCounts.get(artistNorm) || 1) : 1;
  const isUniqueArtistJob = artistCount === 1;

  // Determine qualifying tier
  let tier = 0;
  let score = 0;
  const reasons: string[] = [];
  const evidence: string[] = [];

  if (exactMatrix) {
    tier = 5;
    score = 150;
    reasons.push(`Matrix ${exactMatrix}`);
    evidence.push(exactMatrix);
  } else if (matchedArtist && matchedAlbum) {
    tier = 4;
    score = 115;
    reasons.push(`Artist + Album (${dossier.artist} / ${dossier.album})`);
    evidence.push(dossier.artist, dossier.album);
  } else if ((matchedContactName || matchedLabel) && matchedAlbum) {
    tier = 3;
    score = 105;
    if (matchedContactName) {
      reasons.push(`Contact ${matchedContactName}`);
      evidence.push(matchedContactName);
    }
    if (matchedLabel) {
      reasons.push(`Label ${matchedLabel}`);
      evidence.push(matchedLabel);
    }
    reasons.push(`Album ${dossier.album}`);
    evidence.push(dossier.album);
  } else if ((matchedContactName || matchedLabel) && matchedArtist && (isUniqueArtistJob || matchedQty !== null || matchedPrice)) {
    tier = 3;
    score = 95;
    if (matchedContactName) {
      reasons.push(`Contact ${matchedContactName}`);
      evidence.push(matchedContactName);
    }
    if (matchedLabel) {
      reasons.push(`Label ${matchedLabel}`);
      evidence.push(matchedLabel);
    }
    reasons.push(`Artist ${dossier.artist}`);
    evidence.push(dossier.artist);
  } else if (!hasRealAlbum && isUniqueArtistJob && (matchedArtist || matchedContactName) && enriched.isPressingInvoice) {
    // Single-entity job (e.g., "Califia Farms", "Hans Williams", "Scott Satterwhite", "Les Paul Estate (Tom Camuso)")
    tier = 2;
    score = 82;
    if (matchedArtist) {
      reasons.push(`Customer/Artist ${dossier.artist}`);
      evidence.push(dossier.artist);
    }
    if (matchedContactName) {
      reasons.push(`Contact ${matchedContactName}`);
      evidence.push(matchedContactName);
    }
  } else if (
    hasRealAlbum &&
    isUniqueArtistJob &&
    matchedArtist &&
    enriched.isPressingInvoice &&
    (matchedQty !== null || matchedPrice || Boolean(matchedLabel) || Boolean(matchedContactName))
  ) {
    // Unique active job for this artist, billed directly to artist on a pressing invoice with corroborating qty/price/label
    tier = 1;
    score = 74;
    reasons.push(`Artist ${dossier.artist}`);
    evidence.push(dossier.artist);
  } else {
    return null;
  }

  // Secondary corroboration bonuses (help break ties cleanly during global assignment)
  if (matchedArtist && tier !== 4 && !reasons.some(r => r.includes(dossier.artist))) {
    score += 12;
    evidence.push(dossier.artist);
  }
  if (matchedAlbum && tier !== 4 && !reasons.some(r => r.includes(dossier.album))) {
    score += 14;
    evidence.push(dossier.album);
  }
  if (matchedContactName && !reasons.some(r => r.includes(matchedContactName))) {
    score += 10;
    reasons.push(`Contact ${matchedContactName}`);
    evidence.push(matchedContactName);
  }
  if (matchedLabel && !reasons.some(r => r.includes(matchedLabel))) {
    score += 8;
    reasons.push(`Label ${matchedLabel}`);
  }
  if (matchedQty !== null) {
    score += 10;
    reasons.push(`Qty ${matchedQty}`);
    evidence.push(`qty ${matchedQty}`);
  }
  if (matchedPrice) {
    score += 14;
    reasons.push('Amount match');
  }
  if (enriched.isPressingInvoice) {
    score += 6;
  }
  if (enriched.estimateText && (exactMatrix || matchedAlbum || matchedArtist)) {
    score += 4;
  }
  // Slight preference for newer invoices among equal scores
  score += Math.max(0, 10 - Math.floor(enriched.ageDays / 25));

  return {
    jobKey: dossier.jobKey,
    invoiceId: inv.id,
    tier,
    score,
    reason: reasons.slice(0, 3).join(' · '),
    evidence: [...new Set(evidence)].slice(0, 5),
    hasExactMatrix: Boolean(exactMatrix),
    matchedAlbum,
    matchedArtist,
    matchedContact: Boolean(matchedContactName),
    matchedLabelCustomer: Boolean(matchedLabel),
    matchedQuantity: matchedQty !== null,
    matchedPrice,
  };
}

function toClientInvoiceMatch(invoice: QboInvoice, reason: string): ClientInvoiceMatch {
  return {
    id: invoice.id,
    docNumber: invoice.docNumber,
    customerName: invoice.customerName,
    totalAmt: invoice.totalAmt,
    balance: invoice.balance,
    amountPaid: invoice.amountPaid,
    txnDate: invoice.txnDate,
    source: 'quickbooks',
    matchReason: reason,
  };
}

function findDepositBalancePartner(
  dossier: JobDossier,
  primary: EnrichedInvoice,
  graph: QboKnowledgeGraph,
  claimedInvoiceIds: Set<string>,
  allDossiers: JobDossier[],
): { invoice: QboInvoice; reason: string } | null {
  const primaryInv = primary.invoice;
  if (!primaryInv.customerId) return null;

  const candidates: Array<{ enriched: EnrichedInvoice; priority: number; reason: string }> = [];

  for (const enriched of graph.enrichedInvoices) {
    const inv = enriched.invoice;
    if (inv.id === primaryInv.id || claimedInvoiceIds.has(inv.id)) continue;
    if (inv.customerId !== primaryInv.customerId) continue;
    if (enriched.ageDays > MAX_GENERAL_AGE_DAYS) continue;
    if (!enriched.isPressingInvoice) continue;

    // Gap between deposit and final balance should be <= 135 days
    if (Math.abs(enriched.ageDays - primary.ageDays) > 135) continue;

    // Never grab an invoice with another job's exact matrix or another job's album
    const conflictsOtherJob = allDossiers.some(other => {
      if (other.jobKey === dossier.jobKey) return false;
      if (matchedMatrixForDossier(other, enriched)) return true;
      const otherAlbumTokens = tokenize(other.album, 3);
      if (otherAlbumTokens.length >= 2 && normalizeText(other.album) !== normalizeText(dossier.album)) {
        if (phraseMatches(other.album, enriched.normalizedFull, enriched.fullTokens, { allowSingleDistinctive: false })) {
          return true;
        }
      }
      return false;
    });
    if (conflictsOtherJob) continue;

    // 1. Shared linked estimate
    const sharedEstimate = [...primary.linkedEstimateIds].some(estId => enriched.linkedEstimateIds.has(estId));
    if (sharedEstimate) {
      candidates.push({ enriched, priority: 3, reason: 'Paired deposit/balance (shared Estimate)' });
      continue;
    }

    // 2. Deposit + final balance pair with close dollar amounts (within 30%) and at least one marked deposit/balance
    if (primaryInv.totalAmt >= 400 && inv.totalAmt >= 400) {
      const ratio = inv.totalAmt / primaryInv.totalAmt;
      const similarAmount = ratio >= 0.72 && ratio <= 1.38;
      const bothOrOneSplit = primary.isDepositOrBalance || enriched.isDepositOrBalance;
      const sameQty = quantityMatchesDossier(dossier, enriched) !== null;
      if (similarAmount && (bothOrOneSplit || sameQty)) {
        candidates.push({
          enriched,
          priority: bothOrOneSplit ? 2 : 1,
          reason: `Paired deposit/balance with Invoice ${primaryInv.docNumber || primaryInv.id}`,
        });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || a.enriched.ageDays - b.enriched.ageDays);
  const best = candidates[0];
  return best ? { invoice: best.enriched.invoice, reason: best.reason } : null;
}

export function resolveInvoicesWithQboGraph(
  targetJobs: JobLike[],
  allBoardJobs: JobLike[],
  ctx: QboCrawlContext,
  options?: { preClaimedInvoiceIds?: Set<string> },
): AgentBatchRunResult {
  if (!targetJobs.length) {
    return { ok: true, model: RESOLVER_MODEL_ID, provider: 'local-qbo-graph', turns: 1, toolCalls: 0, verdicts: [] };
  }

  const graph = buildKnowledgeGraph(ctx);
  const fullBoardList = allBoardJobs.length ? allBoardJobs : targetJobs;
  const allDossiers = fullBoardList.map(buildJobDossier).filter(d => Boolean(d.jobKey));
  const dossierByKey = new Map(allDossiers.map(d => [d.jobKey, d]));

  // Ensure every target job is represented in allDossiers
  const targetKeys = new Set<string>();
  for (const job of targetJobs) {
    const dossier = buildJobDossier(job);
    if (!dossier.jobKey) continue;
    targetKeys.add(dossier.jobKey);
    if (!dossierByKey.has(dossier.jobKey)) {
      dossierByKey.set(dossier.jobKey, dossier);
      allDossiers.push(dossier);
    }
  }

  // Count how many active board jobs share each normalized artist core
  const artistJobCounts = new Map<string, number>();
  for (const dossier of allDossiers) {
    const artistNorm = normalizeText(dossier.artist);
    if (artistNorm) {
      artistJobCounts.set(artistNorm, (artistJobCounts.get(artistNorm) || 0) + 1);
    }
  }

  // Score all (job, invoice) edges across the ENTIRE board so sibling jobs compete fairly
  const allEdges: CandidateEdge[] = [];
  for (const dossier of allDossiers) {
    for (const enriched of graph.enrichedInvoices) {
      const edge = scorePair(dossier, enriched, graph, allDossiers, artistJobCounts);
      if (edge) allEdges.push(edge);
    }
  }

  // Global optimal greedy bipartite assignment: highest tier -> highest score -> newest invoice
  allEdges.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.score !== a.score) return b.score - a.score;
    const invA = graph.enrichedById.get(a.invoiceId)?.invoice.txnDate || '';
    const invB = graph.enrichedById.get(b.invoiceId)?.invoice.txnDate || '';
    return invB.localeCompare(invA);
  });

  const claimedInvoiceIds = new Set<string>(options?.preClaimedInvoiceIds || []);
  const assignedByJob = new Map<string, CandidateEdge[]>();

  for (const edge of allEdges) {
    if (claimedInvoiceIds.has(edge.invoiceId)) continue;
    const current = assignedByJob.get(edge.jobKey) || [];
    if (current.length >= MAX_INVOICES_PER_JOB) continue;

    // For a 2nd invoice on the same job, require either same customer as invoice #1 OR exact matrix match
    if (current.length === 1) {
      const firstInv = graph.enrichedById.get(current[0].invoiceId)?.invoice;
      const nextInv = graph.enrichedById.get(edge.invoiceId)?.invoice;
      if (firstInv && nextInv && !edge.hasExactMatrix && firstInv.customerId && nextInv.customerId && firstInv.customerId !== nextInv.customerId) {
        continue;
      }
    }

    current.push(edge);
    assignedByJob.set(edge.jobKey, current);
    claimedInvoiceIds.add(edge.invoiceId);
  }

  // Second pass: pair deposit/balance partner invoices for matched jobs that currently have 1 invoice
  const pairedPartnerByJob = new Map<string, { invoice: QboInvoice; reason: string }>();
  for (const [jobKey, edges] of assignedByJob.entries()) {
    if (edges.length !== 1) continue;
    const dossier = dossierByKey.get(jobKey);
    const primary = graph.enrichedById.get(edges[0].invoiceId);
    if (!dossier || !primary) continue;
    const partner = findDepositBalancePartner(dossier, primary, graph, claimedInvoiceIds, allDossiers);
    if (partner) {
      pairedPartnerByJob.set(jobKey, partner);
      claimedInvoiceIds.add(partner.invoice.id);
    }
  }

  // Emit verdicts ONLY for the requested targetJobs (preserving order)
  const verdicts: AgentJobVerdict[] = targetJobs.map(job => {
    const dossier = buildJobDossier(job);
    const key = dossier.jobKey;
    const edges = assignedByJob.get(key) || [];
    const partner = pairedPartnerByJob.get(key);

    const matchedInvoices: ClientInvoiceMatch[] = [];
    const allEvidence: string[] = [];
    const reasons: string[] = [];

    for (const edge of edges) {
      const inv = graph.enrichedById.get(edge.invoiceId)?.invoice;
      if (!inv) continue;
      matchedInvoices.push(toClientInvoiceMatch(inv, edge.reason));
      reasons.push(edge.reason);
      allEvidence.push(...edge.evidence);
    }
    if (partner && matchedInvoices.length < MAX_INVOICES_PER_JOB) {
      matchedInvoices.push(toClientInvoiceMatch(partner.invoice, partner.reason));
      reasons.push(partner.reason);
    }

    matchedInvoices.sort((a, b) => String(b.txnDate).localeCompare(String(a.txnDate)));

    if (matchedInvoices.length > 0) {
      return {
        jobKey: key,
        status: 'matched',
        confidence: 'high',
        invoices: matchedInvoices,
        reason: reasons[0] || 'Matched via QuickBooks invoice graph',
        evidence: [...new Set(allEvidence)].slice(0, 6),
        model: RESOLVER_MODEL_ID,
      };
    }

    return {
      jobKey: key,
      status: 'unmatched',
      confidence: 'none',
      invoices: [],
      reason: 'No recent QuickBooks invoice matched this job',
      evidence: [],
      model: RESOLVER_MODEL_ID,
    };
  });

  return {
    ok: true,
    model: RESOLVER_MODEL_ID,
    provider: 'local-qbo-graph',
    turns: 1,
    toolCalls: graph.enrichedInvoices.length,
    verdicts,
  };
}
