import { buildJobPnl } from './job-pnl';
import { loadCoreBoardJobs, jobDetailKey } from './production-board-jobs';
import { listQboCustomers, listQboEstimates, listQboInvoices } from './qbo';
import { runInvoiceAgentBatch, type CustomAgentRunner } from './qbo-invoice-agent';
import { resolveInvoicesWithQboGraph } from './qbo-invoice-resolver';
import {
  latestQboTxnDate,
  loadInvoiceAgentState,
  loadPersistedInvoiceLinks,
  refreshPersistedLinkAmounts,
  saveInvoiceAgentState,
  savePersistedInvoiceLinks,
  selectJobsForAgentCrawl,
  verdictsToPersistedLinks,
  type InvoiceAgentState,
  type PersistedJobInvoiceLink,
} from './qbo-invoice-store';
import type { JobLike } from './qbo-invoice-tools';

export type CrawlPassOptions = {
  limit?: number;
  jobKey?: string;
  force?: boolean;
  forceAll?: boolean;
  forceQboRefresh?: boolean;
  jobs?: JobLike[];
  now?: Date;
  customRunner?: CustomAgentRunner;
};

export type CrawledJobDetail = {
  detail_key: string;
  pnl: ReturnType<typeof buildJobPnl>;
  invoice_match_status: 'matched' | 'unmatched' | 'pending';
  invoice_match_model: string;
  invoice_match_reason: string;
  invoice_match_checked_at: string;
};

export type CrawlPassResponse = {
  ok: boolean;
  processed: number;
  matchedInBatch: number;
  remaining: number;
  model: string;
  provider: string | null;
  turns: number;
  toolCalls: number;
  error?: string;
  state: InvoiceAgentState;
  updatedJobs: CrawledJobDetail[];
};

export function summarizeCoverage(
  jobs: JobLike[],
  persisted: Map<string, PersistedJobInvoiceLink>,
  qboLatestTxn: string,
  meta: { lastRunAt: string; model: string; lastError: string },
  now = new Date(),
): InvoiceAgentState {
  let matched = 0;
  let unmatched = 0;
  for (const job of jobs) {
    const key = jobDetailKey(job);
    const link = persisted.get(key);
    if (!link) continue;
    if (link.status === 'matched' && link.invoices.length > 0) matched += 1;
    else unmatched += 1;
  }
  const { totalPending } = selectJobsForAgentCrawl(jobs, persisted, qboLatestTxn, { now, limit: 1 });
  return {
    lastRunAt: meta.lastRunAt,
    qboLatestTxn,
    model: meta.model,
    totalJobs: jobs.length,
    matched,
    unmatched,
    pending: totalPending,
    lastError: meta.lastError,
  };
}

export async function getInvoiceAgentStatus(): Promise<InvoiceAgentState> {
  const [{ jobs }, persisted, savedState] = await Promise.all([
    loadCoreBoardJobs(),
    loadPersistedInvoiceLinks(),
    loadInvoiceAgentState(),
  ]);
  return summarizeCoverage(
    jobs,
    persisted,
    savedState?.qboLatestTxn || '',
    {
      lastRunAt: savedState?.lastRunAt || '',
      model: savedState?.model || '',
      lastError: savedState?.lastError || '',
    },
  );
}

export async function runInvoiceAgentCrawlPass(options: CrawlPassOptions = {}): Promise<CrawlPassResponse> {
  const now = options.now ?? new Date();
  const limit = Math.min(300, Math.max(1, options.limit ?? 250));

  // Fetch board jobs, persisted links, and QBO customers first (so invoices reuse cached customers)
  const [loadedJobs, customers, persisted, savedState] = await Promise.all([
    options.jobs ? Promise.resolve(options.jobs) : loadCoreBoardJobs().then(res => res.jobs),
    listQboCustomers({ force: options.forceQboRefresh }),
    loadPersistedInvoiceLinks({ force: true }),
    loadInvoiceAgentState(),
  ]);

  const [invoices, estimates] = await Promise.all([
    listQboInvoices({ force: options.forceQboRefresh }),
    listQboEstimates({ force: options.forceQboRefresh }),
  ]);

  const qboLatestTxn = latestQboTxnDate(invoices);
  const invoicesById = new Map(invoices.map(inv => [inv.id, inv]));

  if (!invoices.length) {
    const state = summarizeCoverage(loadedJobs, persisted, qboLatestTxn, {
      lastRunAt: now.toISOString(),
      model: savedState?.model || '',
      lastError: 'QuickBooks returned 0 invoices — check QBO connection/token.',
    }, now);
    await saveInvoiceAgentState(state);
    return {
      ok: false,
      processed: 0,
      matchedInBatch: 0,
      remaining: state.pending,
      model: state.model,
      provider: null,
      turns: 0,
      toolCalls: 0,
      error: state.lastError,
      state,
      updatedJobs: [],
    };
  }

  const { batch, totalPending } = selectJobsForAgentCrawl(loadedJobs, persisted, qboLatestTxn, {
    now,
    limit,
    jobKey: options.jobKey,
    force: options.force,
    forceAll: options.forceAll,
  });

  if (!batch.length) {
    const state = summarizeCoverage(loadedJobs, persisted, qboLatestTxn, {
      lastRunAt: now.toISOString(),
      model: savedState?.model || '',
      lastError: '',
    }, now);
    await saveInvoiceAgentState(state);
    return {
      ok: true,
      processed: 0,
      matchedInBatch: 0,
      remaining: 0,
      model: state.model,
      provider: null,
      turns: 0,
      toolCalls: 0,
      state,
      updatedJobs: [],
    };
  }

  // Preserve invoice claims already held by other persisted jobs when running an incremental/single-job pass
  const batchKeys = new Set(batch.map(job => jobDetailKey(job)));
  const preClaimedInvoiceIds = new Set<string>();
  if (!options.forceAll) {
    for (const [key, link] of persisted.entries()) {
      if (batchKeys.has(key)) continue;
      if (link.status === 'matched') {
        for (const id of link.invoiceIds) preClaimedInvoiceIds.add(id);
      }
    }
  }

  const ran = options.customRunner
    ? await runInvoiceAgentBatch(
        batch,
        { invoices, customers, estimates, now },
        { customRunner: options.customRunner },
      )
    : resolveInvoicesWithQboGraph(
        batch,
        loadedJobs,
        { invoices, customers, estimates, now },
        { preClaimedInvoiceIds },
      );

  if (!ran.ok) {
    const state = summarizeCoverage(loadedJobs, persisted, qboLatestTxn, {
      lastRunAt: now.toISOString(),
      model: ran.model || savedState?.model || '',
      lastError: ran.error || 'Invoice agent batch failed',
    }, now);
    await saveInvoiceAgentState(state);
    return {
      ok: false,
      processed: 0,
      matchedInBatch: 0,
      remaining: totalPending,
      model: ran.model,
      provider: ran.provider,
      turns: ran.turns,
      toolCalls: ran.toolCalls,
      error: ran.error,
      state,
      updatedJobs: [],
    };
  }

  const newLinks = verdictsToPersistedLinks(batch, ran.verdicts, qboLatestTxn, now);
  await savePersistedInvoiceLinks(newLinks);
  for (const link of newLinks) persisted.set(link.jobKey, link);

  const linkByKey = new Map(newLinks.map(link => [link.jobKey, link]));
  const updatedJobs: CrawledJobDetail[] = batch.map(job => {
    const key = jobDetailKey(job);
    const link = linkByKey.get(key);
    const refreshed = link ? refreshPersistedLinkAmounts(link, invoicesById) : [];
    return {
      detail_key: key,
      pnl: buildJobPnl(job, refreshed),
      invoice_match_status: link?.status || 'unmatched',
      invoice_match_model: link?.model || ran.model,
      invoice_match_reason: link?.reason || '',
      invoice_match_checked_at: link?.updatedAt || now.toISOString(),
    };
  });

  const matchedInBatch = newLinks.filter(link => link.status === 'matched').length;
  const state = summarizeCoverage(loadedJobs, persisted, qboLatestTxn, {
    lastRunAt: now.toISOString(),
    model: ran.model || savedState?.model || '',
    lastError: '',
  }, now);
  await saveInvoiceAgentState(state);

  return {
    ok: true,
    processed: batch.length,
    matchedInBatch,
    remaining: state.pending,
    model: ran.model,
    provider: ran.provider,
    turns: ran.turns,
    toolCalls: ran.toolCalls,
    state,
    updatedJobs,
  };
}
