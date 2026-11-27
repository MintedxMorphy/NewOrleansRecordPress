import { jobCustomerName, type ClientInvoiceMatch } from './job-pnl';
import type { QboInvoice } from './qbo';
import type { AgentJobVerdict } from './qbo-invoice-agent';
import { jobKeyOf, jobSignature, type JobLike } from './qbo-invoice-tools';
import { appendRow, findRow, getSheet, updateRow, upsertRowsBatch } from './sheets';

export type PersistedJobInvoiceLink = {
  jobKey: string;
  matrix: string;
  customer: string;
  stage: string;
  status: 'matched' | 'unmatched';
  invoiceIds: string[];
  invoices: ClientInvoiceMatch[];
  confidence: 'high' | 'medium' | 'none';
  model: string;
  reason: string;
  evidence: string[];
  updatedAt: string;
  qboLatestTxn: string;
  jobSignature: string;
};

export type InvoiceAgentState = {
  lastRunAt: string;
  qboLatestTxn: string;
  model: string;
  totalJobs: number;
  matched: number;
  unmatched: number;
  pending: number;
  lastError: string;
};

const STORE_CACHE_MS = 30 * 1000;
const UNMATCHED_RECHECK_MS = 2 * 60 * 60 * 1000;
const MATCHED_RECHECK_MS = 24 * 60 * 60 * 1000;
const AGENT_STATE_CACHE_KEY = 'qbo_invoice_agent_state';

let memoryLinks: { at: number; map: Map<string, PersistedJobInvoiceLink> } | null = null;
let memoryState: { at: number; state: InvoiceAgentState | null } | null = null;

function parseJsonSafe<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToPersistedLink(row: Record<string, string>): PersistedJobInvoiceLink | null {
  const jobKey = String(row.job_key || '').trim();
  if (!jobKey) return null;
  const invoicesRaw = parseJsonSafe<ClientInvoiceMatch[]>(row.invoices_json, []);
  const invoices = Array.isArray(invoicesRaw)
    ? invoicesRaw.filter(inv => inv && typeof inv === 'object' && inv.id && inv.source === 'quickbooks')
    : [];
  const invoiceIds = String(row.invoice_ids || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  const status: 'matched' | 'unmatched' = invoices.length > 0 ? 'matched' : 'unmatched';
  const confRaw = String(row.confidence || 'none').toLowerCase();
  const confidence: 'high' | 'medium' | 'none' =
    confRaw === 'high' ? 'high' : confRaw === 'medium' ? 'medium' : 'none';

  return {
    jobKey,
    matrix: String(row.matrix || ''),
    customer: String(row.customer || ''),
    stage: String(row.stage || ''),
    status,
    invoiceIds: invoiceIds.length ? invoiceIds : invoices.map(inv => inv.id),
    invoices,
    confidence,
    model: String(row.model || ''),
    reason: String(row.reason || ''),
    evidence: parseJsonSafe<string[]>(row.evidence, []),
    updatedAt: String(row.updated_at || ''),
    qboLatestTxn: String(row.qbo_latest_txn || ''),
    jobSignature: String(row.job_signature || ''),
  };
}

function persistedLinkToRow(link: PersistedJobInvoiceLink): Record<string, string> {
  return {
    job_key: link.jobKey,
    matrix: link.matrix.slice(0, 120),
    customer: link.customer.slice(0, 200),
    stage: link.stage.slice(0, 40),
    status: link.status,
    invoice_ids: link.invoiceIds.join(','),
    invoices_json: JSON.stringify(link.invoices).slice(0, 4000),
    confidence: link.confidence,
    model: link.model.slice(0, 80),
    reason: link.reason.slice(0, 240),
    evidence: JSON.stringify(link.evidence.slice(0, 4)).slice(0, 800),
    updated_at: link.updatedAt,
    qbo_latest_txn: link.qboLatestTxn,
    job_signature: link.jobSignature.slice(0, 300),
  };
}

export async function loadPersistedInvoiceLinks(options?: { force?: boolean }): Promise<Map<string, PersistedJobInvoiceLink>> {
  if (!options?.force && memoryLinks && Date.now() - memoryLinks.at < STORE_CACHE_MS) {
    return new Map(memoryLinks.map);
  }

  const map = new Map<string, PersistedJobInvoiceLink>();
  if (!process.env.SHEETS_DB_ID) {
    return memoryLinks ? new Map(memoryLinks.map) : map;
  }

  try {
    const rows = await getSheet('qbo_invoice_links');
    for (const row of rows) {
      const parsed = rowToPersistedLink(row);
      if (parsed) map.set(parsed.jobKey, parsed);
    }
    memoryLinks = { at: Date.now(), map };
    return new Map(map);
  } catch {
    // Tab may not exist yet before the first crawl write.
    return memoryLinks ? new Map(memoryLinks.map) : map;
  }
}

export async function savePersistedInvoiceLinks(links: PersistedJobInvoiceLink[]): Promise<void> {
  if (!links.length) return;
  const current = memoryLinks ? new Map(memoryLinks.map) : new Map<string, PersistedJobInvoiceLink>();
  for (const link of links) current.set(link.jobKey, link);
  memoryLinks = { at: Date.now(), map: current };

  if (!process.env.SHEETS_DB_ID) return;
  try {
    await upsertRowsBatch('qbo_invoice_links', 'job_key', links.map(persistedLinkToRow));
  } catch (error) {
    console.error('[qbo-invoice-store] savePersistedInvoiceLinks failed:', error instanceof Error ? error.message : error);
  }
}

export async function loadInvoiceAgentState(options?: { force?: boolean }): Promise<InvoiceAgentState | null> {
  if (!options?.force && memoryState && Date.now() - memoryState.at < STORE_CACHE_MS) {
    return memoryState.state;
  }
  if (!process.env.SHEETS_DB_ID) return memoryState?.state || null;

  try {
    const row = await findRow('qbo_cache', 'key', AGENT_STATE_CACHE_KEY);
    const parsed = row ? parseJsonSafe<InvoiceAgentState | null>(row.row.value, null) : null;
    memoryState = { at: Date.now(), state: parsed };
    return parsed;
  } catch {
    return memoryState?.state || null;
  }
}

export async function saveInvoiceAgentState(state: InvoiceAgentState): Promise<void> {
  memoryState = { at: Date.now(), state };
  if (!process.env.SHEETS_DB_ID) return;
  try {
    const existing = await findRow('qbo_cache', 'key', AGENT_STATE_CACHE_KEY);
    const row = {
      key: AGENT_STATE_CACHE_KEY,
      value: JSON.stringify(state),
      updated_at: new Date().toISOString(),
    };
    if (existing) await updateRow('qbo_cache', existing.rowIndex, row);
    else await appendRow('qbo_cache', row);
  } catch (error) {
    console.error('[qbo-invoice-store] saveInvoiceAgentState failed:', error instanceof Error ? error.message : error);
  }
}

export function latestQboTxnDate(invoices: QboInvoice[]): string {
  let latest = '';
  for (const inv of invoices) {
    const d = String(inv.txnDate || '').trim().slice(0, 10);
    if (d && d > latest) latest = d;
  }
  return latest;
}

export function jobNeedsCrawl(
  job: JobLike,
  existing: PersistedJobInvoiceLink | undefined,
  qboLatestTxn: string,
  now: Date,
): { needed: boolean; priority: number } {
  if (!existing) return { needed: true, priority: 1 };

  const sig = jobSignature(job);
  if (existing.jobSignature && existing.jobSignature !== sig) {
    return { needed: true, priority: 2 };
  }

  const updatedMs = Date.parse(existing.updatedAt || '');
  const ageMs = Number.isFinite(updatedMs) ? now.getTime() - updatedMs : Number.POSITIVE_INFINITY;
  const qboAdvanced = Boolean(qboLatestTxn && (!existing.qboLatestTxn || qboLatestTxn > existing.qboLatestTxn));

  if (existing.status === 'unmatched') {
    if (qboAdvanced || ageMs >= UNMATCHED_RECHECK_MS) {
      return { needed: true, priority: 3 };
    }
    return { needed: false, priority: 99 };
  }

  if (qboAdvanced && ageMs >= MATCHED_RECHECK_MS) {
    return { needed: true, priority: 4 };
  }

  return { needed: false, priority: 99 };
}

export function selectJobsForAgentCrawl(
  jobs: JobLike[],
  persisted: Map<string, PersistedJobInvoiceLink>,
  qboLatestTxn: string,
  options: {
    now?: Date;
    limit?: number;
    jobKey?: string;
    force?: boolean;
    forceAll?: boolean;
  } = {},
): { batch: JobLike[]; totalPending: number } {
  const now = options.now ?? new Date();
  const limit = Math.min(10, Math.max(1, options.limit ?? 6));

  if (options.jobKey) {
    const target = jobs.find(job => jobKeyOf(job) === options.jobKey);
    if (!target) return { batch: [], totalPending: 0 };
    const existing = persisted.get(options.jobKey);
    if (!options.force && existing && !jobNeedsCrawl(target, existing, qboLatestTxn, now).needed) {
      return { batch: [], totalPending: 0 };
    }
    return { batch: [target], totalPending: 1 };
  }

  const queued: Array<{ job: JobLike; priority: number; updatedMs: number }> = [];
  for (const job of jobs) {
    const key = jobKeyOf(job);
    if (!key) continue;
    const existing = persisted.get(key);
    if (options.forceAll) {
      const updatedMs = Date.parse(existing?.updatedAt || '') || 0;
      const priority = !existing ? 1 : existing.status === 'unmatched' ? 2 : 3;
      queued.push({ job, priority, updatedMs });
      continue;
    }
    const check = jobNeedsCrawl(job, existing, qboLatestTxn, now);
    if (check.needed) {
      const updatedMs = Date.parse(existing?.updatedAt || '') || 0;
      queued.push({ job, priority: check.priority, updatedMs });
    }
  }

  queued.sort((a, b) => a.priority - b.priority || a.updatedMs - b.updatedMs);
  return {
    batch: queued.slice(0, limit).map(item => item.job),
    totalPending: queued.length,
  };
}

export function verdictsToPersistedLinks(
  jobs: JobLike[],
  verdicts: AgentJobVerdict[],
  qboLatestTxn: string,
  now: Date,
): PersistedJobInvoiceLink[] {
  const jobByKey = new Map(jobs.map(job => [jobKeyOf(job), job]));
  const updatedAt = now.toISOString();
  const out: PersistedJobInvoiceLink[] = [];

  for (const verdict of verdicts) {
    const job = jobByKey.get(verdict.jobKey);
    if (!job) continue;
    out.push({
      jobKey: verdict.jobKey,
      matrix: String(job.matrix || job.job_id || ''),
      customer: jobCustomerName(job),
      stage: String(job.stage || ''),
      status: verdict.status,
      invoiceIds: verdict.invoices.map(inv => inv.id),
      invoices: verdict.invoices,
      confidence: verdict.confidence,
      model: verdict.model,
      reason: verdict.reason,
      evidence: verdict.evidence,
      updatedAt,
      qboLatestTxn,
      jobSignature: jobSignature(job),
    });
  }
  return out;
}

/** Refresh live amounts/balances on persisted links when fresh QBO invoices are available. */
export function refreshPersistedLinkAmounts(
  link: PersistedJobInvoiceLink,
  invoicesById: Map<string, QboInvoice>,
): ClientInvoiceMatch[] {
  return link.invoices.map(inv => {
    const fresh = invoicesById.get(inv.id);
    if (!fresh) return inv;
    return {
      ...inv,
      docNumber: fresh.docNumber || inv.docNumber,
      customerName: fresh.customerName || inv.customerName,
      totalAmt: fresh.totalAmt,
      balance: fresh.balance,
      amountPaid: fresh.amountPaid,
      txnDate: fresh.txnDate || inv.txnDate,
    };
  });
}
