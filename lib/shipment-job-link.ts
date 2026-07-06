import { getSheet } from '@/lib/sheets';
import { isAirtableConfigured } from '@/lib/airtable';
import {
  findMatchingVendorInvoiceJob,
  loadProductionJobsForVendorInvoices,
  matrixKey,
  type JobContext,
} from '@/lib/vendor-invoice-import';

const NORP_JOB_ID = /\b(NORP[-\s]?\d{4,}(?:[-\s]?\d+)?)\b/i;

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeJobId(value: string) {
  return value.toUpperCase().replace(/\s+/g, '-').replace(/--+/g, '-');
}

export type JobLinkResult = {
  job_id: string;
  matrix: string;
  customer: string;
  reason: string;
};

function linkResultFromJob(job: JobContext, reason: string): JobLinkResult {
  const matrix = job.matrix || job.job_id || '';
  const jobId = job.job_id || job.matrix || '';
  return {
    job_id: jobId,
    matrix,
    customer: job.customer || '',
    reason,
  };
}

function matchFromProductionJobs(text: string, jobs: JobContext[]): JobLinkResult | null {
  const norpMatch = text.match(NORP_JOB_ID);
  if (norpMatch) {
    const normalized = normalizeJobId(norpMatch[1]);
    const exact = jobs.find(job => normalizeJobId(job.job_id || '') === normalized);
    if (exact) return linkResultFromJob(exact, 'matched_explicit_norp_job_id');
  }

  for (const job of jobs) {
    for (const candidate of [job.matrix, job.job_id, job.order_number]) {
      const key = String(candidate || '').trim();
      if (key.length < 4) continue;
      const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(text)) return linkResultFromJob(job, 'matched_matrix_token_in_email');
    }
  }

  const fuzzy = findMatchingVendorInvoiceJob({ matrix: '', description: text }, jobs);
  if (fuzzy) return linkResultFromJob(fuzzy, 'matched_matrix_in_email_text');

  const normalizedText = clean(text);
  const customerMatches = jobs.filter(job => {
    const customer = clean(job.customer || '');
    return customer.length >= 8 && normalizedText.includes(customer);
  });
  if (customerMatches.length === 1) {
    return linkResultFromJob(customerMatches[0], 'matched_customer_name_in_email');
  }

  return null;
}

async function matchFromSheetJobs(text: string): Promise<JobLinkResult | null> {
  const jobs = await getSheet('jobs');
  const norpMatch = text.match(NORP_JOB_ID);
  if (norpMatch) {
    const normalized = normalizeJobId(norpMatch[1]);
    const exact = jobs.find(job => normalizeJobId(job.job_id || '') === normalized);
    if (exact?.job_id) {
      return {
        job_id: exact.job_id,
        matrix: exact.job_id,
        customer: exact.customer || '',
        reason: 'matched_sheet_job_id',
      };
    }
  }

  const normalizedText = clean(text);
  const matches = jobs.filter(job => {
    const customer = clean(job.customer || '');
    return customer.length >= 4 && normalizedText.includes(customer);
  });

  if (matches.length === 1 && matches[0].job_id) {
    return {
      job_id: matches[0].job_id,
      matrix: matches[0].job_id,
      customer: matches[0].customer || '',
      reason: 'matched_sheet_customer_in_email',
    };
  }

  return null;
}

export function matchJobFromShipmentText(text: string, jobs: JobContext[]): JobLinkResult | null {
  return matchFromProductionJobs(text, jobs);
}

export async function linkJobFromEmail(email: {
  subject: string;
  body: string;
  customerHint?: string;
}): Promise<JobLinkResult> {
  const text = `${email.subject}\n${email.body}`.trim();
  const empty: JobLinkResult = { job_id: '', matrix: '', customer: '', reason: 'no_confident_match' };

  if (isAirtableConfigured()) {
    try {
      const jobs = await loadProductionJobsForVendorInvoices();
      const linked = matchFromProductionJobs(text, jobs);
      if (linked) return linked;
    } catch (error) {
      console.error('[shipment-job-link] Airtable job match failed:', error);
    }
  }

  try {
    const sheetLinked = await matchFromSheetJobs(text);
    if (sheetLinked) return sheetLinked;
  } catch (error) {
    console.error('[shipment-job-link] Sheet job match failed:', error);
  }

  const customerHint = email.customerHint?.trim();
  if (customerHint && isAirtableConfigured()) {
    try {
      const jobs = await loadProductionJobsForVendorInvoices();
      const normalizedHint = clean(customerHint);
      const matches = jobs.filter(job => clean(job.customer || '') === normalizedHint);
      if (matches.length === 1) return linkResultFromJob(matches[0], 'matched_sender_customer_hint');
    } catch (error) {
      console.error('[shipment-job-link] Customer hint match failed:', error);
    }
  }

  return empty;
}

export function shipmentTextMightMatchJob(text: string, job: { matrix?: string; job_id?: string; customer?: string }) {
  const blob = matrixKey(text);
  for (const candidate of [job.matrix, job.job_id]) {
    const key = matrixKey(String(candidate || ''));
    if (key.length >= 4 && blob.includes(key)) return true;
  }
  const customer = clean(String(job.customer || ''));
  return customer.length >= 4 && clean(text).includes(customer);
}
