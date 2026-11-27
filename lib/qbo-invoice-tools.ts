import {
  artistCoreFromCustomer,
  jobCustomerName,
  jobMatchProfile,
  titleCoreFromCustomer,
} from './job-pnl';
import type { QboCustomer, QboEstimate, QboInvoice } from './qbo';

export type JobLike = Record<string, unknown>;

export type JobDossier = {
  jobKey: string;
  title: string;
  artist: string;
  album: string;
  contacts: string[];
  matrixValues: string[];
  matrixPrefixes: string[];
  orderNumber: string;
  quantity: number;
  colors: string;
  weight: string;
  stage: string;
  notes: string;
  dashNotes: string;
  dueNote: string;
  airtableInvoiceTotal: number;
  variantSummary: string[];
};

export type QboCrawlContext = {
  invoices: QboInvoice[];
  customers: QboCustomer[];
  estimates: QboEstimate[];
  now: Date;
};

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'vinyl', 'record', 'records',
  'pressing', 'press', 'repress', 'variants', 'variant', 'sets', 'set', 'standard',
  'special', 'edition', 'color', 'colors', 'black', 'clear', 'trans', 'translucent',
  'splatter', 'smoke', 'marble', 'lp', '2lp', 'ep', 'tbc', 'tbd', 'due', 'use', 'labels',
  'paper', 'hole', 'large', 'pic', 'take', 'being', 'live', 'vol', 'no', 'music',
]);

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(str).filter(Boolean).join(', ');
  return '';
}

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = str(value).replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function jobKeyOf(job: JobLike): string {
  return str(job.detail_key || job.airtable_record_id || job.job_id || job.matrix || job.MATRIX);
}

export function jobSignature(job: JobLike): string {
  const profile = jobMatchProfile(job);
  return [
    jobCustomerName(job).toLowerCase().replace(/\s+/g, ' '),
    profile.matrixValues.join('|').toLowerCase(),
    str(job.order_number || job['Order Number']).toLowerCase(),
  ].join('::');
}

function extractParentheticalContacts(title: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const matches = title.matchAll(/\(([^()]{2,50})\)|\[([^\[\]]{2,50})\]/g);
  for (const match of matches) {
    const raw = String(match[1] || match[2] || '').trim();
    if (!raw) continue;
    // Ignore pure format / pressing tags like "(20th Anniversary)", "(500 paper)", "(standard)"
    if (/^\d+\s*(paper|sets|lp|x|copies|gr|g|oz|anniversary)/i.test(raw)) continue;
    if (/^(standard|repress|deluxe|special|redux|2lp|12"|7"|tbc|tbd|side [a-d])$/i.test(raw)) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(raw);
    }
  }
  return out;
}

function extractMatrixPrefixes(matrixValues: string[]): string[] {
  const prefixes = new Set<string>();
  for (const raw of matrixValues) {
    const match = raw.match(/^[A-Za-z]{2,6}(?=[\s\-_]?\d)/);
    if (match) {
      const code = match[0].toUpperCase();
      if (code !== 'NORP' && code !== 'TBC' && code !== 'TBD') {
        prefixes.add(code);
      }
    }
  }
  return [...prefixes];
}

export function buildJobDossier(job: JobLike): JobDossier {
  const title = jobCustomerName(job);
  const profile = jobMatchProfile(job);
  const variants = Array.isArray(job.variants)
    ? job.variants.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const variantSummary = variants.slice(0, 6).map(variant =>
    [str(variant.matrix || variant.job_id), str(variant.colors || variant.color), num(variant.quantity) ? `${num(variant.quantity)} qty` : '']
      .filter(Boolean)
      .join(' · '),
  ).filter(Boolean);

  return {
    jobKey: jobKeyOf(job),
    title,
    artist: artistCoreFromCustomer(title),
    album: titleCoreFromCustomer(title),
    contacts: extractParentheticalContacts(title),
    matrixValues: profile.matrixValues.slice(0, 8),
    matrixPrefixes: extractMatrixPrefixes(profile.matrixValues),
    orderNumber: str(job.order_number || job['Order Number'] || job['ORDER NUMBER']),
    quantity: num(job.quantity || job.Quantity),
    colors: str(job.colors || job.Color || job.Colors),
    weight: str(job.weight || job.Weight),
    stage: str(job.stage || job.Stage),
    notes: str(job.notes || job.Notes).slice(0, 240),
    dashNotes: str(job.dash_notes || job['Dash Notes']).slice(0, 240),
    dueNote: str(job.due_note || job['Due Note']).slice(0, 120),
    airtableInvoiceTotal: num(job.invoice_total || job['Invoice Total'] || job.client_invoice_total),
    variantSummary,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function meaningfulTokens(value: string): string[] {
  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/&/g, ' ')
      .split(/[^a-z0-9]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 3 && !STOPWORDS.has(token)),
  ));
}

export function daysAgo(txnDate: string, now: Date): number {
  const raw = String(txnDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Number.POSITIVE_INFINITY;
  const [year, month, day] = raw.split('-').map(Number);
  const txnMs = Date.UTC(year, month - 1, day);
  const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((nowMs - txnMs) / (24 * 60 * 60 * 1000));
}

export function invoiceWithinMonths(txnDate: string, months: number, now: Date): boolean {
  const ageDays = daysAgo(txnDate, now);
  if (!Number.isFinite(ageDays)) return false;
  return ageDays <= Math.ceil(months * 31.5) && ageDays >= -14;
}

export function boundedMatrixInText(text: string, rawMatrix: string): boolean {
  const parts = rawMatrix.toLowerCase().match(/[a-z0-9]+/g) || [];
  if (parts.join('').length < 5) return false;
  const pattern = parts.map(part => escapeRegExp(part)).join('[^a-z0-9]{0,2}');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`, 'i').test(text);
}

function initialsOf(phrase: string): string {
  const words = phrase.match(/[A-Za-z0-9]+/g) || [];
  return words.map(word => word[0]).join('').toLowerCase();
}

export function fullInvoiceText(invoice: QboInvoice, estimatesById?: Map<string, QboEstimate>): string {
  const estimateTexts = (invoice.linkedTxnIds || [])
    .filter(link => link.txnType.toLowerCase() === 'estimate')
    .map(link => estimatesById?.get(link.txnId)?.searchText || '')
    .filter(Boolean);
  return [
    invoice.docNumber,
    invoice.customerName,
    invoice.customerCompany,
    invoice.customerEmail,
    invoice.customerNotes,
    invoice.billEmail,
    invoice.shipTo,
    invoice.privateNote,
    invoice.memo,
    ...(invoice.customFields || []).map(field => `${field.name} ${field.value}`),
    ...(invoice.lines || []).map(line => `${line.itemName} ${line.description} ${line.qty ? `qty ${line.qty}` : ''}`),
    invoice.searchText,
    ...estimateTexts,
  ].filter(Boolean).join(' ');
}

function summarizeInvoice(invoice: QboInvoice, query?: string) {
  const lines = (invoice.lines || []).slice(0, 4).map(line => {
    const desc = [line.itemName, line.description].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
    return line.qty ? `${desc.slice(0, 140)} (qty ${line.qty})` : desc.slice(0, 140);
  });
  let snippet = lines.join(' | ');
  if (!snippet && invoice.searchText) {
    const clean = invoice.searchText.replace(/\s+/g, ' ').trim();
    if (query) {
      const idx = clean.toLowerCase().indexOf(query.toLowerCase().trim());
      snippet = idx >= 0 ? clean.slice(Math.max(0, idx - 60), idx + 180) : clean.slice(0, 220);
    } else {
      snippet = clean.slice(0, 220);
    }
  }
  return {
    id: invoice.id,
    docNumber: invoice.docNumber,
    txnDate: invoice.txnDate,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerCompany: invoice.customerCompany || undefined,
    billEmail: invoice.billEmail || invoice.customerEmail || undefined,
    totalAmt: invoice.totalAmt,
    balance: invoice.balance,
    memo: invoice.memo ? invoice.memo.slice(0, 120) : undefined,
    snippet: snippet.slice(0, 320),
  };
}

export function searchInvoicesInContext(
  ctx: QboCrawlContext,
  params: {
    query: string;
    customer_name?: string;
    max_age_months?: number;
    limit?: number;
  },
) {
  const query = String(params.query || '').trim();
  const customerFilter = String(params.customer_name || '').trim().toLowerCase();
  const maxMonths = Math.min(12, Math.max(1, Number(params.max_age_months || 7) || 7));
  const limit = Math.min(20, Math.max(1, Number(params.limit || 10) || 10));
  const estimatesById = new Map(ctx.estimates.map(estimate => [estimate.id, estimate]));

  const queryCompact = compact(query);
  const tokens = meaningfulTokens(query);

  const scored: Array<{ invoice: QboInvoice; score: number }> = [];
  for (const invoice of ctx.invoices) {
    if (!invoice.id || !(invoice.totalAmt > 0)) continue;
    if (!invoiceWithinMonths(invoice.txnDate, maxMonths, ctx.now)) continue;
    if (customerFilter) {
      const who = `${invoice.customerName} ${invoice.customerCompany} ${invoice.billEmail} ${invoice.customerEmail}`.toLowerCase();
      if (!who.includes(customerFilter)) continue;
    }

    const hay = fullInvoiceText(invoice, estimatesById);
    const hayLower = hay.toLowerCase();
    let score = 0;

    if (query) {
      if (queryCompact.length >= 5 && boundedMatrixInText(hay, query)) score += 90;
      else if (hayLower.includes(query.toLowerCase())) score += 60;
      else if (queryCompact.length >= 5 && compact(hay).includes(queryCompact)) score += 35;

      let tokenHits = 0;
      for (const token of tokens) {
        if (new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`, 'i').test(hayLower)) {
          score += token.length >= 5 ? 18 : 10;
          tokenHits += 1;
        } else if (token.length >= 5 && hayLower.includes(token)) {
          score += 8;
        }
      }
      if (tokens.length >= 2 && tokenHits === tokens.length) score += 25;

      // Acronym hit against customer company name (e.g. "RPF" -> "Royal Potato Family")
      if (/^[a-z]{2,5}$/i.test(query) && invoice.customerCompany) {
        if (initialsOf(invoice.customerCompany).includes(query.toLowerCase())) score += 22;
      }
    } else if (customerFilter) {
      score = 20;
    }

    if (score > 0) {
      scored.push({ invoice, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || String(b.invoice.txnDate).localeCompare(String(a.invoice.txnDate)));
  return {
    total_hits: scored.length,
    invoices: scored.slice(0, limit).map(entry => summarizeInvoice(entry.invoice, query)),
  };
}

export function searchCustomersInContext(
  ctx: QboCrawlContext,
  params: { query: string; limit?: number },
) {
  const query = String(params.query || '').trim();
  const limit = Math.min(15, Math.max(1, Number(params.limit || 10) || 10));
  if (!query) return { total_hits: 0, customers: [] };

  const lower = query.toLowerCase();
  const tokens = meaningfulTokens(query);
  const scored: Array<{ customer: QboCustomer; score: number }> = [];

  for (const customer of ctx.customers) {
    const text = [
      customer.displayName,
      customer.companyName,
      customer.givenName,
      customer.familyName,
      customer.email,
      customer.notes,
    ].filter(Boolean).join(' ');
    const textLower = text.toLowerCase();
    let score = 0;

    if (textLower.includes(lower)) score += 60;
    for (const token of tokens) {
      if (textLower.includes(token)) score += 20;
    }
    if (/^[a-z]{2,5}$/i.test(query)) {
      if (initialsOf(customer.companyName).includes(lower) || initialsOf(customer.displayName).includes(lower)) {
        score += 45;
      }
    }
    if (score > 0) scored.push({ customer, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    total_hits: scored.length,
    customers: scored.slice(0, limit).map(({ customer }) => ({
      id: customer.id,
      displayName: customer.displayName,
      companyName: customer.companyName || undefined,
      email: customer.email || undefined,
      notes: customer.notes ? customer.notes.slice(0, 160) : undefined,
    })),
  };
}

export function listCustomerInvoicesInContext(
  ctx: QboCrawlContext,
  params: { customer_id?: string; customer_name?: string; max_age_months?: number },
) {
  const customerId = String(params.customer_id || '').trim();
  const customerName = String(params.customer_name || '').trim().toLowerCase();
  const maxMonths = Math.min(12, Math.max(1, Number(params.max_age_months || 9) || 9));

  const matches = ctx.invoices
    .filter(invoice => {
      if (!invoice.id || !(invoice.totalAmt > 0)) return false;
      if (!invoiceWithinMonths(invoice.txnDate, maxMonths, ctx.now)) return false;
      if (customerId && invoice.customerId === customerId) return true;
      if (customerName) {
        const who = `${invoice.customerName} ${invoice.customerCompany} ${invoice.billEmail} ${invoice.customerEmail}`.toLowerCase();
        return who.includes(customerName);
      }
      return false;
    })
    .sort((a, b) => String(b.txnDate).localeCompare(String(a.txnDate)))
    .slice(0, 20);

  return {
    count: matches.length,
    invoices: matches.map(invoice => summarizeInvoice(invoice)),
  };
}

export function getInvoiceDetailsInContext(ctx: QboCrawlContext, params: { invoice_id: string }) {
  const id = String(params.invoice_id || '').trim();
  const invoice = ctx.invoices.find(item => item.id === id);
  if (!invoice) return { error: `Invoice ${id} not found` };

  const estimatesById = new Map(ctx.estimates.map(estimate => [estimate.id, estimate]));
  const linkedEstimates = (invoice.linkedTxnIds || [])
    .filter(link => link.txnType.toLowerCase() === 'estimate')
    .map(link => estimatesById.get(link.txnId))
    .filter((est): est is QboEstimate => Boolean(est))
    .map(est => ({
      id: est.id,
      docNumber: est.docNumber,
      txnDate: est.txnDate,
      totalAmt: est.totalAmt,
      memo: est.memo,
      lines: est.lines.slice(0, 12),
    }));

  return {
    id: invoice.id,
    docNumber: invoice.docNumber,
    txnDate: invoice.txnDate,
    ageDays: daysAgo(invoice.txnDate, ctx.now),
    dueDate: invoice.dueDate,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerCompany: invoice.customerCompany,
    customerEmail: invoice.customerEmail,
    customerNotes: invoice.customerNotes,
    billEmail: invoice.billEmail,
    shipTo: invoice.shipTo,
    totalAmt: invoice.totalAmt,
    balance: invoice.balance,
    amountPaid: invoice.amountPaid,
    memo: invoice.memo,
    privateNote: invoice.privateNote,
    customFields: invoice.customFields,
    lines: (invoice.lines || []).slice(0, 25),
    linkedEstimates,
  };
}

export function searchEstimatesInContext(
  ctx: QboCrawlContext,
  params: { query: string; max_age_months?: number; limit?: number },
) {
  const query = String(params.query || '').trim();
  const maxMonths = Math.min(12, Math.max(1, Number(params.max_age_months || 9) || 9));
  const limit = Math.min(10, Math.max(1, Number(params.limit || 8) || 8));
  if (!query) return { total_hits: 0, estimates: [] };

  const tokens = meaningfulTokens(query);
  const scored: Array<{ estimate: QboEstimate; score: number }> = [];
  for (const estimate of ctx.estimates) {
    if (!invoiceWithinMonths(estimate.txnDate, maxMonths, ctx.now)) continue;
    const hay = `${estimate.customerName} ${estimate.docNumber} ${estimate.searchText}`.toLowerCase();
    let score = 0;
    if (boundedMatrixInText(hay, query)) score += 90;
    else if (hay.includes(query.toLowerCase())) score += 50;
    for (const token of tokens) {
      if (hay.includes(token)) score += 15;
    }
    if (score > 0) scored.push({ estimate, score });
  }

  scored.sort((a, b) => b.score - a.score || String(b.estimate.txnDate).localeCompare(String(a.estimate.txnDate)));
  return {
    total_hits: scored.length,
    estimates: scored.slice(0, limit).map(({ estimate }) => ({
      id: estimate.id,
      docNumber: estimate.docNumber,
      txnDate: estimate.txnDate,
      customerId: estimate.customerId,
      customerName: estimate.customerName,
      totalAmt: estimate.totalAmt,
      linkedInvoiceIds: (estimate.linkedTxnIds || [])
        .filter(link => link.txnType.toLowerCase() === 'invoice')
        .map(link => link.txnId),
      snippet: estimate.searchText.replace(/\s+/g, ' ').slice(0, 260),
    })),
  };
}

/** Warm initial candidates so the agent starts with strong leads while staying free to search wider. */
export function preIndexCandidatesForJob(dossier: JobDossier, ctx: QboCrawlContext, limit = 4) {
  const byId = new Map<string, { summary: ReturnType<typeof summarizeInvoice>; score: number }>();
  const addQuery = (query: string, boost: number, maxMonths = 7) => {
    if (!query || query.trim().length < 2) return;
    const res = searchInvoicesInContext(ctx, { query, max_age_months: maxMonths, limit: 5 });
    res.invoices.forEach((inv, idx) => {
      const score = boost - idx * 4;
      const existing = byId.get(inv.id);
      if (!existing || score > existing.score) {
        byId.set(inv.id, { summary: inv, score });
      }
    });
  };

  for (const matrix of dossier.matrixValues.slice(0, 4)) addQuery(matrix, 100, 9);
  if (dossier.orderNumber) addQuery(dossier.orderNumber, 85, 9);
  if (dossier.artist && dossier.album) addQuery(`${dossier.artist} ${dossier.album}`, 75, 7);
  if (dossier.album) addQuery(dossier.album, 55, 7);
  if (dossier.artist) addQuery(dossier.artist, 50, 7);
  for (const contact of dossier.contacts.slice(0, 2)) addQuery(contact, 60, 7);
  for (const prefix of dossier.matrixPrefixes.slice(0, 2)) addQuery(prefix, 35, 7);

  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.summary);
}

export const QBO_AGENT_TOOLS: ToolSchema[] = [
  {
    name: 'search_invoices',
    description: 'Search QuickBooks invoices across doc number, customer, company, email, memo, custom fields, and line item descriptions. Returns compact summaries of matching recent invoices.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Matrix ID, artist name, album title, label/contact name, or acronym.' },
        customer_name: { type: 'string', description: 'Optional filter to narrow to a customer or company name.' },
        max_age_months: { type: 'number', description: 'Lookback window in months (default 7, max 12). Production jobs are usually <= 6 months old.' },
        limit: { type: 'number', description: 'Max results to return (default 10, max 20).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_customers',
    description: 'Search QuickBooks customers by display name, company/label name, email, notes, or acronym (for example "RPF" matches "Royal Potato Family"). Use this when the board lists a contact in parentheses or a label prefix.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Person name, band name, label name, email, or matrix prefix acronym.' },
        limit: { type: 'number', description: 'Max customers to return (default 10).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_customer_invoices',
    description: 'List all recent QuickBooks invoices for a specific customer ID or name, sorted newest first. Essential when a label or artist has multiple albums or represses so you pick the exact right invoice.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Exact QuickBooks customerId from search_customers or search_invoices.' },
        customer_name: { type: 'string', description: 'Customer or company name substring.' },
        max_age_months: { type: 'number', description: 'Lookback window in months (default 9, max 12).' },
      },
    },
  },
  {
    name: 'get_invoice_details',
    description: 'Inspect the complete QuickBooks invoice: every line item (item, description, quantity, unit price, amount), custom fields, memo, private note, bill email, ship-to address, customer company/notes, and linked estimates. Always call this before finalizing a match.',
    input_schema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Exact QuickBooks invoice id.' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'search_estimates',
    description: 'Search recent QuickBooks estimates when an invoice has sparse line descriptions or references an estimate. Returns estimate lines and any linked invoice IDs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Matrix ID, artist, album, or customer name.' },
        max_age_months: { type: 'number', description: 'Lookback window in months (default 9).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'submit_matches',
    description: 'Submit the final verified QuickBooks invoice link verdict for every job in this batch. Call this once you have verified each match via get_invoice_details.',
    input_schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              job_key: { type: 'string', description: 'Exact jobKey from the input batch.' },
              invoice_ids: {
                type: 'array',
                items: { type: 'string' },
                description: '1 or 2 verified QuickBooks invoice IDs (e.g. deposit + final invoice). Empty array if no confident match exists.',
              },
              confidence: {
                type: 'string',
                enum: ['high', 'medium', 'none'],
                description: 'Use "high" ONLY when you verified the invoice lines/details and are certain it belongs to this exact job.',
              },
              evidence: {
                type: 'array',
                items: { type: 'string' },
                description: 'Exact verbatim snippets copied from the invoice, customer, or linked estimate proving this match.',
              },
              reason: {
                type: 'string',
                description: 'Short plain-English explanation (max 120 chars), e.g. "Matrix RPF 2616 + Mike Dillon Beignet on Royal Potato Family invoice".',
              },
            },
            required: ['job_key', 'invoice_ids', 'confidence', 'evidence', 'reason'],
          },
        },
      },
      required: ['results'],
    },
  },
];

export function executeQboTool(
  ctx: QboCrawlContext,
  toolName: string,
  rawArgs: Record<string, unknown>,
): unknown {
  switch (toolName) {
    case 'search_invoices':
      return searchInvoicesInContext(ctx, {
        query: String(rawArgs.query || ''),
        customer_name: rawArgs.customer_name ? String(rawArgs.customer_name) : undefined,
        max_age_months: rawArgs.max_age_months !== undefined ? Number(rawArgs.max_age_months) : undefined,
        limit: rawArgs.limit !== undefined ? Number(rawArgs.limit) : undefined,
      });
    case 'search_customers':
      return searchCustomersInContext(ctx, {
        query: String(rawArgs.query || ''),
        limit: rawArgs.limit !== undefined ? Number(rawArgs.limit) : undefined,
      });
    case 'list_customer_invoices':
      return listCustomerInvoicesInContext(ctx, {
        customer_id: rawArgs.customer_id ? String(rawArgs.customer_id) : undefined,
        customer_name: rawArgs.customer_name ? String(rawArgs.customer_name) : undefined,
        max_age_months: rawArgs.max_age_months !== undefined ? Number(rawArgs.max_age_months) : undefined,
      });
    case 'get_invoice_details':
      return getInvoiceDetailsInContext(ctx, {
        invoice_id: String(rawArgs.invoice_id || ''),
      });
    case 'search_estimates':
      return searchEstimatesInContext(ctx, {
        query: String(rawArgs.query || ''),
        max_age_months: rawArgs.max_age_months !== undefined ? Number(rawArgs.max_age_months) : undefined,
      });
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
