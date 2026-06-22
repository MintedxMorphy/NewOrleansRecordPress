import { NextResponse } from 'next/server';
import { getNORPJobs } from '@/lib/norp-sheet';
import { getNORPArtFiles } from '@/lib/norp-drive';
import { getAirtableJobs, isAirtableConfigured } from '@/lib/airtable';
import { applyProductionLogInferences } from '@/lib/production-log-inference';

export const dynamic = 'force-dynamic';

const STAGE_RANK: Record<string, number> = {
  pre_production: 1,
  press_queue: 2,
  now_pressing: 3,
  quality_control: 4,
  sleeving: 5,
  assembly: 6,
  shipping: 7,
  completed: 8,
};

const SOURCE_RANK: Record<string, number> = {
  airtable_dashboard_stage: 4,
  production_logs: 3,
  airtable_fields: 2,
};

function cleanKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function matrixKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isRealMatrix(value = '') {
  const normalized = matrixKey(value);
  return normalized.length >= 4 && !['tbc', 'tbd', 'na', 'none', 'unknown'].includes(normalized);
}

function isSplitBatch(job: any) {
  return String(job.dash_notes || job['Dash Notes'] || '').toLowerCase().includes('[split batch]');
}

function dedupeKey(job: any) {
  if (isSplitBatch(job)) {
    return `split::${job.airtable_record_id || job.job_id || job.matrix}`;
  }

  const customer = cleanKey(job.customer || '');
  const rawMatrix = job.matrix || job.job_id || '';
  const matrix = matrixKey(rawMatrix);
  const orderNumber = cleanKey(job.order_number || '');

  if (isRealMatrix(rawMatrix)) return `matrix::${matrix}`;
  if (customer && orderNumber) return `${customer}::${orderNumber}`;
  if (customer) return `customer::${customer}`;
  return job.airtable_record_id || job.job_id || matrix;
}

function betterJob(a: any, b: any) {
  const sourceDiff = (SOURCE_RANK[b.stage_source] || 0) - (SOURCE_RANK[a.stage_source] || 0);
  if (sourceDiff > 0) return b;
  if (sourceDiff < 0) return a;

  const stageDiff = (STAGE_RANK[b.stage] || 0) - (STAGE_RANK[a.stage] || 0);
  if (stageDiff > 0) return b;
  if (stageDiff < 0) return a;

  const orderA = Number(a.dashboard_order);
  const orderB = Number(b.dashboard_order);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderB < orderA) return b;

  return a;
}

function dedupeJobs<T extends Record<string, any>>(jobs: T[]) {
  const groups = new Map<string, T[]>();
  for (const job of jobs) {
    const key = dedupeKey(job);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(job);
  }

  return [...groups.values()].map(group => {
    const winner = group.reduce((best, job) => betterJob(best, job), group[0]);
    return group.length > 1 ? { ...winner, duplicate_count: group.length } : winner;
  });
}

export async function GET() {
  try {
    const source = isAirtableConfigured() ? 'airtable' : 'google_sheet';
    const baseJobs = source === 'airtable' ? await getAirtableJobs({ syncCompleted: true }) : await getNORPJobs();
    let jobs = baseJobs;
    try {
      jobs = await applyProductionLogInferences(baseJobs);
    } catch (e) {
      console.error('[norp-jobs] production log inference failed:', e);
    }
    jobs = dedupeJobs(jobs);

    // Best-effort enrichment with art file index. If Drive call fails,
    // jobs still return — we just skip art status.
    let artIndex: Awaited<ReturnType<typeof getNORPArtFiles>> = {};
    try {
      artIndex = await getNORPArtFiles();
    } catch (e) {
      console.error('[norp-jobs] art index lookup failed:', e);
    }

    const enriched = jobs.map(j => {
      const art = j.matrix ? artIndex[j.matrix] : undefined;
      return {
        ...j,
        art_received: !!art,
        art_received_date: art?.receivedDate ?? '',
        art_sides: art ? art.sides.join('+') : '',
      };
    });

    return NextResponse.json({ count: enriched.length, jobs: enriched, source });
  } catch (error) {
    console.error('[norp-jobs] Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
