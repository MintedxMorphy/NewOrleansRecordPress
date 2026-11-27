export const PVC_COST_PER_RECORD = 0.5;
export const PVC_COST_PER_RECORD_CLEAR_SPLATTER = 0.75;
export const RECORDS_PER_POUND = 2;
export const PVC_REJECTION_RATE = 0.15;
export const TRANSLUCENT_CLEAR_PARTS = 20;
export const TRANSLUCENT_COLOR_PARTS = 1;
export const SHOP_PAYROLL_BIWEEKLY = 11000;
const RECORDS_PER_WEEK = 4000;
const PAY_PERIOD_WEEKS = 2;
const BIWEEKLY_OUTPUT_RECORDS = RECORDS_PER_WEEK * PAY_PERIOD_WEEKS;
export const SHOP_PAYROLL_PER_RECORD = SHOP_PAYROLL_BIWEEKLY / BIWEEKLY_OUTPUT_RECORDS;

export type PvcEstimateLine = {
  label: string;
  quantity: number;
  rate: number;
  cost: number;
  pounds: number;
  premium: boolean;
  clearParts: number;
  colorParts: number;
  colorant: string;
};

export type PvcEstimate = {
  lines: PvcEstimateLine[];
  total: number;
  quantity: number;
  pounds: number;
};

export type ClientInvoiceMatch = {
  id: string;
  docNumber: string;
  customerName: string;
  totalAmt: number;
  balance: number;
  amountPaid: number;
  txnDate: string;
  source: 'quickbooks' | 'airtable';
  matchReason?: string;
};

export type JobPnlLine = {
  key: string;
  label: string;
  amount: number;
  detail: string;
  kind: 'cost' | 'revenue';
};

export type JobPnl = {
  quantity: number;
  pvc: PvcEstimate | null;
  vendorCosts: number;
  shopPayroll: number;
  costs: JobPnlLine[];
  costTotal: number;
  clientInvoice: number;
  clientInvoices: ClientInvoiceMatch[];
  clientInvoiceSource: 'quickbooks' | 'airtable' | 'none';
  grossProfit: number | null;
  marginPct: number | null;
};

export type QboInvoiceLike = {
  id: string;
  docNumber: string;
  customerName: string;
  totalAmt: number;
  balance: number;
  amountPaid: number;
  txnDate: string;
  searchText?: string;
};

type JobLike = Record<string, unknown>;

const STOPWORDS = new Set([
  'the', 'and', 'a', 'an', 'of', 'for', 'to', 'by', 'with', 'in', 'on', 'at', 'from',
  'feat', 'featuring', 'ft', 'vs', 'x',
  'record', 'records', 'vinyl', 'press', 'pressing', 'job', 'invoice', 'norp',
]);

const MIN_ASSIGN_SCORE = 40;
const AMBIGUOUS_GAP = 8;
export const INVOICE_LOOKBACK_MONTHS = 6;

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(' ');
  return String(value).trim();
}

function numericValue(value: unknown) {
  const parsed = Number(stringValue(value).replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function jobRecords(value: unknown): JobLike[] {
  return Array.isArray(value)
    ? value.filter((item): item is JobLike => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function jobQuantity(job: JobLike) {
  for (const key of ['quantity', 'Quantity', 'Qty', 'Run Size']) {
    const amount = numericValue(job[key]);
    if (amount > 0) return amount;
  }
  return 0;
}

function colorText(color: string) {
  return color.toLowerCase();
}

export function isSplatterColor(color: string) {
  const text = colorText(color);
  return /\bsplatters?\b/.test(text)
    || /\bsplattered\b/.test(text)
    || /\bsplats?\b/.test(text);
}

export function isTranslucentColor(color: string) {
  const text = colorText(color);
  return /\btranslucents?\b/.test(text) || /\btrans\b/.test(text);
}

export function isPureClearColor(color: string) {
  if (isTranslucentColor(color)) return false;
  const text = colorText(color);
  return /\bclears?\b/.test(text) || /\btransparent\b/.test(text);
}

export function isClearOrSplatterColor(color: string) {
  return isSplatterColor(color) || isPureClearColor(color);
}

export function colorantName(color: string) {
  const name = color
    .replace(/\btranslucents?\b/ig, '')
    .replace(/\btrans\b/ig, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,/-]+|[\s,/-]+$/g, '')
    .trim();
  return name || 'color';
}

export function translucentPoundSplit(pounds: number, clearParts = TRANSLUCENT_CLEAR_PARTS, colorParts = TRANSLUCENT_COLOR_PARTS) {
  const total = Math.max(0, Math.round(pounds));
  const parts = clearParts + colorParts;
  if (!Number.isFinite(pounds) || pounds <= 0 || parts <= 0) return { clear: 0, color: 0, total };
  const clear = Math.min(total, Math.max(0, Math.round(pounds * clearParts / parts)));
  return { clear, color: total - clear, total };
}

export function translucentPvcRate() {
  const parts = TRANSLUCENT_CLEAR_PARTS + TRANSLUCENT_COLOR_PARTS;
  return (
    TRANSLUCENT_CLEAR_PARTS * PVC_COST_PER_RECORD_CLEAR_SPLATTER
    + TRANSLUCENT_COLOR_PARTS * PVC_COST_PER_RECORD
  ) / parts;
}

export function pvcRateForColor(color: string) {
  if (isClearOrSplatterColor(color)) return PVC_COST_PER_RECORD_CLEAR_SPLATTER;
  if (isTranslucentColor(color)) return translucentPvcRate();
  return PVC_COST_PER_RECORD;
}

export function formatPvcRate(rate: number) {
  const rounded = Math.round(rate * 1000) / 1000;
  const cents = Math.round(rounded * 100);
  const digits = Math.abs(rounded * 100 - cents) < 0.000001 ? 2 : 3;
  return `$${rounded.toFixed(digits)} / record`;
}

export function pvcPoundsForRecords(records: number) {
  if (!Number.isFinite(records) || records <= 0) return 0;
  return records / (1 - PVC_REJECTION_RATE) / RECORDS_PER_POUND;
}

export function formatPvcPounds(pounds: number) {
  const rounded = Math.max(0, Math.round(pounds));
  return `${rounded.toLocaleString('en-US')} lb${rounded === 1 ? '' : 's'}`;
}

function pvcLine(label: string, quantity: number) {
  const translucent = isTranslucentColor(label) && !isSplatterColor(label);
  const rate = pvcRateForColor(label);
  return {
    label,
    quantity,
    rate,
    cost: quantity * rate,
    pounds: pvcPoundsForRecords(quantity),
    premium: isClearOrSplatterColor(label),
    clearParts: translucent ? TRANSLUCENT_CLEAR_PARTS : 0,
    colorParts: translucent ? TRANSLUCENT_COLOR_PARTS : 0,
    colorant: translucent ? colorantName(label) : '',
  };
}

export function estimatePvcCompound(job: JobLike): PvcEstimate | null {
  const variants = jobRecords(job.variants);
  const lines: PvcEstimateLine[] = [];

  if (variants.length > 1) {
    for (const variant of variants) {
      const quantity = numericValue(variant.quantity);
      if (quantity <= 0) continue;
      lines.push(pvcLine(stringValue(variant.colors || variant.run_label) || 'Variant', quantity));
    }
  }

  if (!lines.length) {
    const quantity = jobQuantity(job);
    if (quantity <= 0) return null;
    const label = stringValue(job.colors || job.Colors || job.color || job.Color || job['Vinyl Color']) || 'Vinyl';
    lines.push(pvcLine(label, quantity));
  }

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.cost, 0),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    pounds: lines.reduce((sum, line) => sum + line.pounds, 0),
  };
}

function compact(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 2 && !STOPWORDS.has(word));
}

function wordCore(value: string) {
  return normalizeWords(value).join(' ');
}

export function jobCustomerName(job: JobLike) {
  return stringValue(
    job.customer
    || job.Customer
    || job.artist
    || job.ARTIST
    || job.Artist
    || job['Customer Name']
    || job['Job Name']
    || job.Title
    || job['Project Name']
    || job['1'],
  );
}

/** Artist name from "Artist - Album" / "Album by Artist" job titles. */
export function artistCoreFromCustomer(customer: string) {
  const raw = customer.trim();
  if (!raw) return '';
  const byMatch = raw.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return wordCore(byMatch[2]);
  const dashParts = raw.split(/\s+[–—-]\s+/);
  if (dashParts.length >= 2) return wordCore(dashParts[0]);
  return wordCore(raw);
}

export function titleCoreFromCustomer(customer: string) {
  const raw = customer.trim();
  if (!raw) return '';
  const byMatch = raw.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return wordCore(byMatch[1]);
  const dashParts = raw.split(/\s+[–—-]\s+/);
  if (dashParts.length >= 2) return wordCore(dashParts.slice(1).join(' '));
  return '';
}

type JobMatchProfile = {
  index: number;
  artistCore: string;
  titleCore: string;
  matrixValues: string[];
};

export function jobMatchProfile(job: JobLike, index = 0): JobMatchProfile {
  const customer = jobCustomerName(job);
  const artistCore = artistCoreFromCustomer(customer);
  const titleCore = titleCoreFromCustomer(customer);
  const variantTokens = jobRecords(job.variants).flatMap(variant => [
    variant.matrix,
    variant.job_id,
    variant.order_number,
  ]);
  const matrixValues = [
    job.matrix,
    job.MATRIX,
    job.job_id,
    job['Job ID'],
    job.order_number,
    job['Order Number'],
    job['ORDER NUMBER'],
    ...variantTokens,
  ];

  return {
    index,
    artistCore,
    titleCore,
    matrixValues: rawMatrixValues(matrixValues),
  };
}

function rawMatrixValues(values: unknown[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = stringValue(value);
    const token = compact(text);
    if (token.length < 5 || seen.has(token)) continue;
    seen.add(token);
    out.push(text);
  }
  return out;
}

export function invoiceIsRecent(txnDate: string, now = new Date()) {
  const raw = String(txnDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const txn = Date.UTC(year, month - 1, day);
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - INVOICE_LOOKBACK_MONTHS, now.getUTCDate());
  return txn >= cutoff;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clueAppears(haystack: string, phrase: string) {
  const words = normalizeWords(phrase).filter(word => word.length >= 4);
  if (!words.length) return false;
  const hay = haystack.toLowerCase();
  const present = words.filter(word => new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(word)}(?:[^a-z0-9]|$)`).test(hay));
  if (words.length === 1) return present.length === 1;
  const needed = words.length === 2 ? 2 : Math.max(2, Math.ceil(words.length * 0.6));
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  return present.length >= needed && present.includes(longest);
}

function matrixAppears(haystack: string, rawMatrix: string) {
  const parts = rawMatrix.toLowerCase().match(/[a-z0-9]+/g) || [];
  const token = parts.join('');
  if (token.length < 5) return false;
  const source = haystack.toLowerCase();
  const pattern = parts.map(part => escapeRegExp(part)).join('[^a-z0-9]{0,2}');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`).test(source);
}

function invoiceHaystack(invoice: QboInvoiceLike) {
  return [invoice.searchText, invoice.customerName, invoice.docNumber, invoice.txnDate]
    .filter(Boolean)
    .join(' ');
}

type InvoiceScore = { score: number; reason: string };

function scoreInvoiceForJob(profile: JobMatchProfile, invoice: QboInvoiceLike): InvoiceScore {
  const haystack = invoiceHaystack(invoice);
  const clueText = `${invoice.customerName || ''} ${haystack}`;
  const matrix = profile.matrixValues.some(value => matrixAppears(clueText, value));
  const artist = Boolean(profile.artistCore) && clueAppears(clueText, profile.artistCore);
  const album = Boolean(profile.titleCore) && clueAppears(clueText, profile.titleCore);
  if (!matrix && !(artist && album)) return { score: 0, reason: '' };

  let score = 0;
  const reasons: string[] = [];
  if (matrix) {
    score += 40;
    reasons.push('matrix ID');
  }
  if (artist) {
    score += 30;
    reasons.push('artist');
  }
  if (album) {
    score += 30;
    reasons.push('album');
  }
  return { score, reason: reasons.join(' · ') };
}

/** Clues that actually appear in text. Used to check a model's quoted evidence. */
export function cluesInText(job: JobLike, text: string) {
  const profile = jobMatchProfile(job);
  return {
    matrix: profile.matrixValues.some(value => matrixAppears(text, value)),
    artist: Boolean(profile.artistCore) && clueAppears(text, profile.artistCore),
    album: Boolean(profile.titleCore) && clueAppears(text, profile.titleCore),
  };
}

export function quickBooksInvoiceUrl(invoiceId: string) {
  const id = String(invoiceId || '').trim();
  if (!id) return '';
  return `https://app.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(id)}`;
}

export function quickBooksInvoicesFromJob(job: { pnl?: unknown }): ClientInvoiceMatch[] {
  const pnl = job.pnl;
  if (!pnl || typeof pnl !== 'object' || Array.isArray(pnl)) return [];
  const invoices = (pnl as { clientInvoices?: unknown }).clientInvoices;
  if (!Array.isArray(invoices)) return [];
  return invoices.flatMap(invoice => {
    if (!invoice || typeof invoice !== 'object') return [];
    const row = invoice as Partial<ClientInvoiceMatch>;
    if (row.source !== 'quickbooks') return [];
    const id = String(row.id || '').trim();
    if (!id) return [];
    return [{
      id,
      docNumber: String(row.docNumber || ''),
      customerName: String(row.customerName || ''),
      totalAmt: Number(row.totalAmt || 0),
      balance: Number(row.balance || 0),
      amountPaid: Number(row.amountPaid || 0),
      txnDate: String(row.txnDate || ''),
      source: 'quickbooks' as const,
      matchReason: row.matchReason ? String(row.matchReason) : undefined,
    }];
  });
}

export function quickBooksInvoicesForJob(job: { pnl?: unknown }, now = new Date()): ClientInvoiceMatch[] {
  return quickBooksInvoicesFromJob(job)
    .filter(invoice => invoiceIsRecent(invoice.txnDate, now))
    .sort((a, b) => String(b.txnDate).localeCompare(String(a.txnDate)))
    .slice(0, 2);
}

function toClientInvoice(invoice: QboInvoiceLike, reason: string): ClientInvoiceMatch {
  return {
    id: invoice.id,
    docNumber: invoice.docNumber,
    customerName: invoice.customerName,
    totalAmt: invoice.totalAmt,
    balance: invoice.balance,
    amountPaid: invoice.amountPaid,
    txnDate: invoice.txnDate,
    source: 'quickbooks',
    matchReason: reason || undefined,
  };
}

/**
 * Assign each QuickBooks invoice to at most one job.
 * Production jobs are current, so only invoices from the last 6 months qualify.
 * A matrix ID can identify the job. Otherwise the artist and album both have to match.
 */
export function assignClientInvoices(
  jobs: JobLike[],
  invoices: QboInvoiceLike[],
  options: { now?: Date } = {},
): ClientInvoiceMatch[][] {
  const now = options.now ?? new Date();
  const profiles = jobs.map((job, index) => jobMatchProfile(job, index));

  const ranked: Array<{ index: number; invoice: QboInvoiceLike; score: number; reason: string }> = [];
  for (const invoice of invoices) {
    if (!invoice.id || !(invoice.totalAmt > 0)) continue;
    if (!invoiceIsRecent(invoice.txnDate, now)) continue;
    const candidates = profiles
      .map(profile => {
        const { score, reason } = scoreInvoiceForJob(profile, invoice);
        return { index: profile.index, score, reason };
      })
      .filter(row => row.score >= MIN_ASSIGN_SCORE)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) continue;
    const best = candidates[0];
    const second = candidates[1];
    if (second && second.score >= best.score - AMBIGUOUS_GAP && best.score < 80) continue;
    ranked.push({ index: best.index, invoice, score: best.score, reason: best.reason });
  }

  const assigned: ClientInvoiceMatch[][] = jobs.map(() => []);
  const usedInvoiceIds = new Set<string>();
  ranked.sort((a, b) => b.score - a.score);
  for (const row of ranked) {
    if (usedInvoiceIds.has(row.invoice.id)) continue;
    usedInvoiceIds.add(row.invoice.id);
    assigned[row.index].push(toClientInvoice(row.invoice, row.reason));
  }
  return assigned;
}

export function invoiceMatchesJob(job: JobLike, invoiceText: string, docNumber = '') {
  const matches = assignClientInvoices([job], [{
    id: 'probe',
    docNumber,
    customerName: '',
    totalAmt: 1,
    balance: 0,
    amountPaid: 0,
    txnDate: new Date().toISOString().slice(0, 10),
    searchText: invoiceText,
  }]);
  return matches[0].length > 0;
}

export function clientInvoicesFromQbo(
  job: JobLike,
  invoices: QboInvoiceLike[],
  options: { now?: Date } = {},
): ClientInvoiceMatch[] {
  return assignClientInvoices([job], invoices, options)[0] || [];
}

function vendorCostTotal(job: JobLike) {
  const summary = job.vendor_cost_summary;
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    const total = numericValue((summary as { total?: unknown }).total);
    if (total) return total;
  }
  return numericValue(job.vendor_cost_total);
}

function airtableInvoiceTotal(job: JobLike) {
  return numericValue(
    job.invoice_total
    || job['Invoice Total']
    || job.client_invoice_total
    || job['Client Invoice']
    || job.total_price
    || job['Total Price']
    || job.quote_total
    || job['Quote Total'],
  );
}

export function buildJobPnl(job: JobLike, invoices: ClientInvoiceMatch[] = []): JobPnl {
  const pvc = estimatePvcCompound(job);
  const quantity = pvc?.quantity || jobQuantity(job);
  const vendorCosts = vendorCostTotal(job);
  const shopPayroll = quantity * SHOP_PAYROLL_PER_RECORD;

  const costs: JobPnlLine[] = [
    {
      key: 'pvc',
      label: 'PVC compound',
      amount: pvc?.total || 0,
      detail: pvc
        ? `${formatPvcPounds(pvc.pounds)} · ${pvc.quantity.toLocaleString()} records · ${formatPvcRate(PVC_COST_PER_RECORD)} standard / ${formatPvcRate(PVC_COST_PER_RECORD_CLEAR_SPLATTER)} clear & splatter`
        : 'Need a quantity to estimate',
      kind: 'cost',
    },
    {
      key: 'vendor',
      label: 'Vendor costs',
      amount: vendorCosts,
      detail: vendorCosts ? 'Imported supplier invoices matched to this job' : 'No vendor invoices matched yet',
      kind: 'cost',
    },
    {
      key: 'shop_payroll',
      label: 'Shop payroll',
      amount: shopPayroll,
      detail: `$${SHOP_PAYROLL_BIWEEKLY.toLocaleString()} every 2 weeks ÷ ${BIWEEKLY_OUTPUT_RECORDS.toLocaleString()} records (${RECORDS_PER_WEEK.toLocaleString()}/week × ${PAY_PERIOD_WEEKS} weeks) = ${formatPvcRate(SHOP_PAYROLL_PER_RECORD)}`,
      kind: 'cost',
    },
  ];

  const costTotal = costs.reduce((sum, line) => sum + line.amount, 0);
  const qboTotal = invoices.reduce((sum, invoice) => sum + invoice.totalAmt, 0);
  const airtableTotal = airtableInvoiceTotal(job);
  const clientInvoice = qboTotal || airtableTotal;
  const clientInvoiceSource = qboTotal ? 'quickbooks' : airtableTotal ? 'airtable' : 'none';
  const grossProfit = clientInvoice ? clientInvoice - costTotal : null;
  const marginPct = clientInvoice && grossProfit !== null ? (grossProfit / clientInvoice) * 100 : null;

  return {
    quantity,
    pvc,
    vendorCosts,
    shopPayroll,
    costs,
    costTotal,
    clientInvoice,
    clientInvoices: invoices,
    clientInvoiceSource,
    grossProfit,
    marginPct,
  };
}
