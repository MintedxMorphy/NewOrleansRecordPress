import type { NORPJob } from './norp-sheet';
import { createClient } from './supabase/server';

type Stage = 'now_pressing' | 'quality_control' | 'sleeving' | 'assembly' | 'shipping';

type Inference = {
  stage: Stage;
  reason: string;
  created_at: string;
};

type PressLogEntry = {
  created_at: string;
  job_ref: string | null;
  press_id: string | null;
  records_pressed: number | null;
  issues: string | null;
  notes: string | null;
};

type QcLogEntry = {
  created_at: string;
  job_ref: string | null;
  task_types: string[] | null;
  quantity: number | null;
  notes: string | null;
};

function compact(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function includesAny(value: string, words: string[]) {
  return words.some(word => value.includes(word));
}

function jobTokens(job: NORPJob) {
  return [job.matrix, job.job_id, job.order_number, job.customer]
    .map(value => compact(value || ''))
    .filter(value => value.length >= 4);
}

function matchesJob(job: NORPJob, jobRef?: string | null) {
  const ref = compact(jobRef || '');
  if (ref.length < 4) return false;

  return jobTokens(job).some(token => {
    if (token.length < 4) return false;
    if (ref.includes(token)) return true;
    return token.length >= 10 && token.includes(ref);
  });
}

function numericValue(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function stageFromQc(entry: QcLogEntry): Stage {
  const tasks = (entry.task_types || []).join(' ').toLowerCase();
  const notes = (entry.notes || '').toLowerCase();
  const text = `${tasks} ${notes}`;

  if (includesAny(text, ['ready to ship', 'ready for ship', 'waiting for shipping', 'wait for shipping', 'ship ready', 'finished assembly', 'assembly complete', 'boxed', 'packed'])) {
    return 'shipping';
  }
  if (includesAny(text, ['assembly', 'shrink wrap', 'shrinkwrap', 'boxing', 'packaging', 'sorting'])) {
    return 'assembly';
  }
  if (includesAny(text, ['sleeving', 'sleeve', 'inner sleeve', 'poly sleeve'])) {
    return 'sleeving';
  }
  return 'quality_control';
}

function newer(a?: Inference, b?: Inference) {
  if (!a) return b;
  if (!b) return a;
  return new Date(b.created_at).getTime() > new Date(a.created_at).getTime() ? b : a;
}

export async function applyProductionLogInferences<T extends NORPJob>(jobs: T[]): Promise<T[]> {
  const supabase = await createClient();

  const [pressResult, qcResult] = await Promise.all([
    supabase
      .from('press_log')
      .select('created_at, job_ref, press_id, records_pressed, issues, notes')
      .not('job_ref', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('qc_log')
      .select('created_at, job_ref, task_types, quantity, notes')
      .not('job_ref', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (pressResult.error || qcResult.error) {
    throw pressResult.error || qcResult.error;
  }

  const pressEntries = (pressResult.data || []) as PressLogEntry[];
  const qcEntries = (qcResult.data || []) as QcLogEntry[];

  return jobs.map(job => {
    const matchingPressEntries = pressEntries.filter(entry => matchesJob(job, entry.job_ref));
    const recordsPressedTotal = matchingPressEntries.reduce((total, entry) => (
      total + numericValue(entry.records_pressed)
    ), 0);
    const latestPressEntry = matchingPressEntries[0];
    const pressProgressFields = recordsPressedTotal > 0 ? {
      records_pressed_total: String(recordsPressedTotal),
      press_log_count: String(matchingPressEntries.length),
      latest_press_log_at: latestPressEntry?.created_at ?? '',
    } : {};

    const manualPressedRaw = String(job.records_pressed ?? '').replace(/,/g, '').trim();
    const manualPressed = manualPressedRaw ? numericValue(manualPressedRaw) : null;
    const resolvedPressProgress = manualPressed !== null ? {
      records_pressed_total: String(manualPressed),
      records_pressed_source: 'manual' as const,
      ...(recordsPressedTotal > 0 ? {
        press_log_count: String(matchingPressEntries.length),
        latest_press_log_at: latestPressEntry?.created_at ?? '',
        records_pressed_from_logs: String(recordsPressedTotal),
      } : {}),
    } : recordsPressedTotal > 0 ? {
      ...pressProgressFields,
      records_pressed_source: 'press_logs' as const,
    } : {};

    // Staff-set board positions are the source of truth. Logs only fill in
    // gaps for jobs that have not yet been manually placed on the dashboard.
    if (job.stage_source === 'airtable_dashboard_stage') {
      return {
        ...job,
        ...resolvedPressProgress,
      };
    }

    let inferred: Inference | undefined;

    for (const entry of matchingPressEntries) {
      inferred = newer(inferred, {
        stage: 'now_pressing',
        created_at: entry.created_at,
        reason: `Press log${entry.press_id ? `: ${entry.press_id}` : ''}${entry.records_pressed ? `, ${entry.records_pressed} records` : ''}`,
      });
      break;
    }

    for (const entry of qcEntries) {
      if (!matchesJob(job, entry.job_ref)) continue;
      const tasks = Array.isArray(entry.task_types) && entry.task_types.length ? entry.task_types.join(', ') : 'QC log';
      inferred = newer(inferred, {
        stage: stageFromQc(entry),
        created_at: entry.created_at,
        reason: `${tasks}${entry.quantity ? `, ${entry.quantity} units` : ''}`,
      });
      break;
    }

    if (!inferred) return {
      ...job,
      ...resolvedPressProgress,
    };

    return {
      ...job,
      ...resolvedPressProgress,
      stage: inferred.stage,
      stage_source: 'production_logs',
      inferred_stage_reason: inferred.reason,
      inferred_stage_at: inferred.created_at,
    };
  });
}
