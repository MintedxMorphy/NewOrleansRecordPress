import { getAirtableJobs, isAirtableConfigured } from './airtable';
import { getNORPJobs } from './norp-sheet';
import { applyProductionLogInferences } from './production-log-inference';

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

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(', ');
  return String(value).trim();
}

function isRealMatrix(value = '') {
  const normalized = matrixKey(value);
  return normalized.length >= 4 && !['tbc', 'tbd', 'na', 'none', 'unknown'].includes(normalized);
}

function isSplitBatch(job: any) {
  return String(job.dash_notes || job['Dash Notes'] || '').toLowerCase().includes('[split batch]');
}

function parseQuantity(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function variantSignature(job: any) {
  return `${cleanKey(job.colors || job.Colors || '')}::${cleanKey(job.quantity || job.Quantity || '')}`;
}

function runLabelFromNotes(notes: unknown) {
  const match = String(notes ?? '').match(/\[Run\s+(\d+)\s*\/\s*(\d+)\]/i);
  return match ? `Run ${match[1]}/${match[2]}` : '';
}

function formatVariantLabel(colors: string, quantity: string, runLabel = '') {
  const parts: string[] = [];
  if (colors) parts.push(colors);
  if (quantity) parts.push(`(${quantity})`);
  if (runLabel) parts.push(runLabel);
  return parts.join(' ').trim();
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

function mergeVariantGroup<T extends Record<string, any>>(group: T[]) {
  const winner = group.reduce((best, job) => betterJob(best, job), group[0]);
  const variants = group.map(job => ({
    airtable_record_id: job.airtable_record_id || '',
    colors: String(job.colors || job.Colors || '').trim(),
    quantity: String(job.quantity || job.Quantity || '').trim(),
    run_label: runLabelFromNotes(job.dash_notes || job['Dash Notes']),
  })).filter(variant => variant.colors || variant.quantity);

  const seen = new Set<string>();
  const uniqueVariants = variants.filter(variant => {
    const key = `${cleanKey(variant.colors)}::${cleanKey(variant.quantity)}::${cleanKey(variant.run_label)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const combinedColors = uniqueVariants
    .map(variant => formatVariantLabel(variant.colors, variant.quantity, variant.run_label))
    .join(' · ');
  const totalQuantity = group.reduce((sum, job) => sum + parseQuantity(job.quantity || job.Quantity), 0);
  const mergedRecordIds = group
    .map(job => job.airtable_record_id)
    .filter((id): id is string => Boolean(id));

  return {
    ...winner,
    variant_count: group.length,
    duplicate_count: group.length,
    merged_record_ids: mergedRecordIds,
    variants: uniqueVariants,
    colors: combinedColors || winner.colors,
    Colors: combinedColors || winner.Colors,
    quantity: totalQuantity > 0 ? String(totalQuantity) : winner.quantity,
    Quantity: totalQuantity > 0 ? String(totalQuantity) : winner.Quantity,
  };
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

export function dedupeBoardJobs<T extends Record<string, any>>(jobs: T[]) {
  const groups = new Map<string, T[]>();
  for (const job of jobs) {
    const key = dedupeKey(job);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(job);
  }

  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0];

    const signatures = new Set(group.map(variantSignature));
    if (signatures.size === 1) {
      const winner = group.reduce((best, job) => betterJob(best, job), group[0]);
      return { ...winner, duplicate_count: group.length };
    }

    return mergeVariantGroup(group);
  });
}

export function jobDetailKey(job: Record<string, any>) {
  return stringValue(job.airtable_record_id || job.job_id || job.matrix || job.MATRIX);
}

export async function loadCoreBoardJobs() {
  const source = isAirtableConfigured() ? 'airtable' : 'google_sheet';
  const baseJobs = source === 'airtable' ? await getAirtableJobs({ syncCompleted: false }) : await getNORPJobs();
  let jobs = baseJobs;
  try {
    jobs = await applyProductionLogInferences(baseJobs);
  } catch (e) {
    console.error('[production-board-jobs] production log inference failed:', e);
  }
  return { source, jobs: dedupeBoardJobs(jobs) as unknown as Array<Record<string, unknown>> };
}
