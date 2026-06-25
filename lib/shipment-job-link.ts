import { getSheet } from '@/lib/sheets';

const NORP_JOB_ID = /\b(NORP[-\s]?\d{4,}(?:[-\s]?\d+)?)\b/i;

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeJobId(value: string) {
  return value.toUpperCase().replace(/\s+/g, '-').replace(/--+/g, '-');
}

export type JobLinkResult = {
  job_id: string;
  reason: string;
};

export async function linkJobFromEmail(email: {
  subject: string;
  body: string;
  customerHint?: string;
}): Promise<JobLinkResult> {
  const text = `${email.subject}\n${email.body}`;
  const jobIdMatch = text.match(NORP_JOB_ID);
  if (jobIdMatch) {
    const normalized = normalizeJobId(jobIdMatch[1]);
    const jobs = await getSheet('jobs');
    const exact = jobs.find(job => normalizeJobId(job.job_id || '') === normalized);
    if (exact?.job_id) {
      return { job_id: exact.job_id, reason: 'matched_explicit_job_id' };
    }
    return { job_id: '', reason: 'job_id_not_found_in_sheet' };
  }

  const customerHint = email.customerHint?.trim();
  if (!customerHint) {
    return { job_id: '', reason: 'no_customer_hint' };
  }

  const jobs = await getSheet('jobs');
  const normalizedHint = clean(customerHint);
  const matches = jobs.filter(job => clean(job.customer || '') === normalizedHint);

  if (matches.length === 1 && matches[0].job_id) {
    return { job_id: matches[0].job_id, reason: 'exact_customer_match' };
  }

  if (matches.length > 1) {
    return { job_id: '', reason: 'ambiguous_customer_match' };
  }

  return { job_id: '', reason: 'no_confident_match' };
}
