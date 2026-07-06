import { google } from 'googleapis';
import {
  afterShipRecordToStatusUpdate,
  carrierLabelFromSlug,
  getAfterShipTracking,
  isAfterShipConfiguredAsync,
  registerAfterShipTracking,
} from '@/lib/aftership';
import { getShipmentInboxAuth, hasServiceAccount } from '@/lib/google-auth';
import { appendRow, findRow, updateRow } from '@/lib/sheets';
import { extractTrackingCandidatesBatchWithAI } from '@/lib/shipment-ai-extract';
import { getShipmentAiModel, isShipmentAiReady } from '@/lib/shipment-ai-config';
import { extractBestTracking, extractTrackingCandidates, type ExtractedTracking } from '@/lib/shipment-email-extract';
import { fetchShipmentEmails, SHIPMENT_INBOXES } from '@/lib/shipment-gmail';
import { linkJobFromEmail } from '@/lib/shipment-job-link';
import {
  listActiveSheetShipments,
  shipmentLedgerHasTracking,
  upsertSheetShipmentStatus,
} from '@/lib/sheet-shipments';
import { syncAfterShipTrackingsToSheet } from '@/lib/shipment-aftership-sync';

export type ShipmentPipelineOptions = {
  dryRun?: boolean;
  inbox?: string;
  lookbackHours?: number;
  backfillDays?: number;
  windowStartEpochSeconds?: number;
  windowEndEpochSeconds?: number;
  batch?: ShipmentBackfillBatch;
  maxEmailsPerInbox?: number;
  skipPoll?: boolean;
};

export type ShipmentBackfillBatch = {
  backfill_days: number;
  batch_days: number;
  batch_index: number;
  batch_count: number;
  batch_anchor_epoch_seconds: number;
  window_start_epoch_seconds: number;
  window_end_epoch_seconds: number;
  window_start: string;
  window_end: string;
  next_batch_index: number | null;
};

export type ShipmentPipelineResult = {
  ok: boolean;
  dry_run: boolean;
  lookback_hours: number;
  window: {
    after_epoch_seconds: number;
    before_epoch_seconds?: number;
    start: string;
    end: string;
  };
  batch?: ShipmentBackfillBatch;
  inboxes: string[];
  extracted: Array<{
    inbox: string;
    email_id: string;
    from: string;
    subject: string;
    candidates: ExtractedTracking[];
    selected: ExtractedTracking | null;
  }>;
  created: string[];
  skipped_existing: string[];
  polled: string[];
  aftership_sync?: Awaited<ReturnType<typeof syncAfterShipTrackingsToSheet>>;
  errors: Array<{ stage: string; detail: string }>;
  parser: {
    ai_enabled: boolean;
    ai_model: string;
  };
};

const DEFAULT_LOOKBACK_HOURS = 36;
const INITIAL_BACKFILL_DAYS = Number(process.env.SHIPMENT_TRACKING_INITIAL_BACKFILL_DAYS || '30');
const SECONDS_PER_DAY = 24 * 60 * 60;

export function resolveShipmentBackfillBatch(params: {
  backfillDays: number;
  batchDays: number;
  batchIndex?: number;
  batchAnchorEpochSeconds?: number;
}): ShipmentBackfillBatch {
  if (!Number.isFinite(params.backfillDays) || params.backfillDays <= 0) {
    throw new Error('backfillDays must be a positive number');
  }
  if (!Number.isFinite(params.batchDays) || params.batchDays <= 0) {
    throw new Error('batchDays must be a positive number');
  }

  const batchCount = Math.ceil(params.backfillDays / params.batchDays);
  const batchIndex = params.batchIndex ?? 0;
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= batchCount) {
    throw new Error(`batchIndex must be between 0 and ${batchCount - 1}`);
  }

  const batchAnchorEpochSeconds = Math.floor(params.batchAnchorEpochSeconds ?? Date.now() / 1000);
  const batchStartDaysAgo = Math.min(params.backfillDays, (batchIndex + 1) * params.batchDays);
  const batchEndDaysAgo = batchIndex * params.batchDays;
  const windowStartEpochSeconds = Math.floor(batchAnchorEpochSeconds - batchStartDaysAgo * SECONDS_PER_DAY);
  const windowEndEpochSeconds = Math.floor(batchAnchorEpochSeconds - batchEndDaysAgo * SECONDS_PER_DAY);

  return {
    backfill_days: params.backfillDays,
    batch_days: params.batchDays,
    batch_index: batchIndex,
    batch_count: batchCount,
    batch_anchor_epoch_seconds: batchAnchorEpochSeconds,
    window_start_epoch_seconds: windowStartEpochSeconds,
    window_end_epoch_seconds: windowEndEpochSeconds,
    window_start: new Date(windowStartEpochSeconds * 1000).toISOString(),
    window_end: new Date(windowEndEpochSeconds * 1000).toISOString(),
    next_batch_index: batchIndex + 1 < batchCount ? batchIndex + 1 : null,
  };
}

function pipelineDryRun(options: ShipmentPipelineOptions) {
  if (options.dryRun) return true;
  return process.env.SHIPMENT_TRACKING_DRY_RUN === 'true';
}

async function resolveLookbackHours(options: ShipmentPipelineOptions) {
  if (options.windowStartEpochSeconds !== undefined && options.windowEndEpochSeconds !== undefined) {
    return Math.max(1, (options.windowEndEpochSeconds - options.windowStartEpochSeconds) / 60 / 60);
  }
  if (options.backfillDays) return options.backfillDays * 24;
  if (options.lookbackHours) return options.lookbackHours;

  const override = process.env.SHIPMENT_TRACKING_LOOKBACK_HOURS;
  if (override) return Number(override);

  const backfillDone = await findRow('qbo_cache', 'key', 'shipment_tracking_backfill_done');
  const lastRun = await findRow('qbo_cache', 'key', 'shipment_tracking_last_run');
  if (!backfillDone && !lastRun) return INITIAL_BACKFILL_DAYS * 24;

  return DEFAULT_LOOKBACK_HOURS;
}

async function markPipelineRun(options: ShipmentPipelineOptions, lookbackHours: number, dryRun: boolean) {
  if (dryRun) return;

  const now = new Date().toISOString();
  const lastRunRow = { key: 'shipment_tracking_last_run', value: String(Date.now()), updated_at: now };
  const existingLastRun = await findRow('qbo_cache', 'key', 'shipment_tracking_last_run');
  if (existingLastRun) await updateRow('qbo_cache', existingLastRun.rowIndex, lastRunRow);
  else await appendRow('qbo_cache', lastRunRow);

  if (lookbackHours >= INITIAL_BACKFILL_DAYS * 24) {
    const backfillRow = { key: 'shipment_tracking_backfill_done', value: 'true', updated_at: now };
    const existingBackfill = await findRow('qbo_cache', 'key', 'shipment_tracking_backfill_done');
    if (existingBackfill) await updateRow('qbo_cache', existingBackfill.rowIndex, backfillRow);
    else await appendRow('qbo_cache', backfillRow);
  }
}

async function registerAndWriteCandidate(
  candidate: ExtractedTracking,
  emailMeta: { inbox: string; email_id: string; subject: string; body: string },
  dryRun: boolean,
  result: ShipmentPipelineResult,
) {
  const trackingNumber = candidate.tracking_number;

  const jobLink = await linkJobFromEmail({
    subject: emailMeta.subject,
    body: emailMeta.body,
  });

  if (dryRun) {
    result.created.push(`${trackingNumber} (dry-run${jobLink.job_id ? ` → ${jobLink.job_id}` : ''})`);
    return;
  }

  const linkageUpdate = {
    job_id: jobLink.job_id,
    matrix: jobLink.matrix,
    customer: jobLink.customer,
    source_subject: emailMeta.subject.slice(0, 250),
  };

  if (await shipmentLedgerHasTracking(trackingNumber)) {
    await upsertSheetShipmentStatus(trackingNumber, linkageUpdate);
    result.skipped_existing.push(trackingNumber);
    return;
  }

  if (!(await isAfterShipConfiguredAsync())) {
    result.errors.push({ stage: 'aftership', detail: 'AFTERSHIP_API_KEY not configured' });
    return;
  }

  const aftership = await registerAfterShipTracking({
    tracking_number: trackingNumber,
    carrier: candidate.carrier,
    title: emailMeta.subject.slice(0, 100),
    custom_fields: {
      source_inbox: emailMeta.inbox,
      source_email_id: emailMeta.email_id,
    },
  });

  const live = await getAfterShipTracking(trackingNumber, aftership.slug || candidate.slug);
  const statusUpdate = live ? afterShipRecordToStatusUpdate(live) : null;

  await upsertSheetShipmentStatus(trackingNumber, {
    ...linkageUpdate,
    carrier: statusUpdate?.carrier_label || candidate.carrier,
    status: statusUpdate?.status || 'Registered',
    shipped_date: statusUpdate?.shipped_date || new Date().toISOString().slice(0, 10),
    est_delivery: statusUpdate?.est_delivery || '',
    actual_delivery: statusUpdate?.delivered_date || '',
    notes: `Auto from ${emailMeta.inbox} (${candidate.reason}; job_link=${jobLink.reason})`,
  });

  result.created.push(trackingNumber);
}

async function pollActiveShipments(dryRun: boolean, result: ShipmentPipelineResult) {
  if (!(await isAfterShipConfiguredAsync())) return;

  const active = await listActiveSheetShipments();
  for (const row of active) {
    try {
      const live = await getAfterShipTracking(row.tracking_number, undefined);
      if (!live) continue;
      const statusUpdate = afterShipRecordToStatusUpdate(live);
      if (!statusUpdate) continue;

      await upsertSheetShipmentStatus(row.tracking_number, {
        carrier: statusUpdate.carrier_label || row.carrier || carrierLabelFromSlug(statusUpdate.carrier_slug),
        status: statusUpdate.status,
        est_delivery: statusUpdate.est_delivery || row.est_delivery,
        actual_delivery: statusUpdate.delivered_date || row.actual_delivery,
      }, { dryRun });

      result.polled.push(row.tracking_number);
    } catch (error) {
      result.errors.push({
        stage: 'poll',
        detail: `${row.tracking_number}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

function mergeCandidates(...groups: ExtractedTracking[][]) {
  const merged = new Map<string, ExtractedTracking>();
  for (const candidates of groups) {
    for (const candidate of candidates) {
      const existing = merged.get(candidate.tracking_number);
      if (!existing) {
        merged.set(candidate.tracking_number, candidate);
        continue;
      }
      if (existing.confidence === 'medium' && candidate.confidence === 'high') {
        merged.set(candidate.tracking_number, candidate);
      }
    }
  }
  return [...merged.values()].sort((a, b) => {
    const rank = { high: 0, medium: 1 };
    return rank[a.confidence] - rank[b.confidence];
  });
}

async function batchAiCandidates(
  inbox: string,
  emails: Array<{ id: string; from: string; subject: string; body: string }>,
  result: ShipmentPipelineResult,
) {
  if (!result.parser.ai_enabled) return {};

  const byEmail: Record<string, ExtractedTracking[]> = {};
  const chunkSize = 8;
  for (let index = 0; index < emails.length; index += chunkSize) {
    const chunk = emails.slice(index, index + chunkSize);
    try {
      const parsed = await extractTrackingCandidatesBatchWithAI(chunk);
      for (const [emailId, candidates] of Object.entries(parsed)) {
        byEmail[emailId] = candidates;
      }
    } catch (error) {
      result.errors.push({
        stage: 'ai_extract',
        detail: `${inbox} chunk ${Math.floor(index / chunkSize) + 1}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return byEmail;
}

export async function runShipmentTrackingPipeline(options: ShipmentPipelineOptions = {}): Promise<ShipmentPipelineResult> {
  if (!hasServiceAccount()) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is required for shipment inbox scanning');
  }

  const dryRun = pipelineDryRun(options);
  const lookbackHours = await resolveLookbackHours(options);
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const afterEpochSeconds = options.windowStartEpochSeconds ?? Math.floor(nowEpochSeconds - lookbackHours * 60 * 60);
  const beforeEpochSeconds = options.windowEndEpochSeconds;
  const inboxes = options.inbox ? [options.inbox] : [...SHIPMENT_INBOXES];
  const maxEmails = options.maxEmailsPerInbox ?? (options.backfillDays ? 150 : 50);

  const result: ShipmentPipelineResult = {
    ok: true,
    dry_run: dryRun,
    lookback_hours: lookbackHours,
    window: {
      after_epoch_seconds: afterEpochSeconds,
      before_epoch_seconds: beforeEpochSeconds,
      start: new Date(afterEpochSeconds * 1000).toISOString(),
      end: new Date((beforeEpochSeconds ?? nowEpochSeconds) * 1000).toISOString(),
    },
    batch: options.batch,
    inboxes,
    extracted: [],
    created: [],
    skipped_existing: [],
    polled: [],
    errors: [],
    parser: {
      ai_enabled: await isShipmentAiReady(),
      ai_model: await getShipmentAiModel(),
    },
  };
  const seenTrackingNumbers = new Set<string>();

  if (!dryRun && (await isAfterShipConfiguredAsync())) {
    try {
      result.aftership_sync = await syncAfterShipTrackingsToSheet({ maxPages: 5, dryRun: false });
    } catch (error) {
      result.errors.push({
        stage: 'aftership_sync',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const inbox of inboxes) {
    try {
      const auth = getShipmentInboxAuth(inbox);
      const gmail = google.gmail({ version: 'v1', auth });
      const emails = await fetchShipmentEmails(gmail, inbox, afterEpochSeconds, maxEmails, beforeEpochSeconds);
      const aiByEmail = await batchAiCandidates(inbox, emails, result);

      for (const email of emails) {
        const regexCandidates = extractTrackingCandidates(email);
        const aiCandidates = aiByEmail[email.id] || [];

        const candidates = mergeCandidates(aiCandidates, regexCandidates);
        const selected = extractBestTracking(email);
        const bestSelected = candidates.find(candidate => candidate.confidence === 'high') || candidates[0] || selected;

        result.extracted.push({
          inbox,
          email_id: email.id,
          from: email.from,
          subject: email.subject,
          candidates,
          selected: bestSelected,
        });

        const highConfidenceCandidates = candidates.filter(candidate => candidate.confidence === 'high');
        if (!bestSelected || !highConfidenceCandidates.length) continue;

        for (const candidate of highConfidenceCandidates) {
          try {
            if (seenTrackingNumbers.has(candidate.tracking_number)) {
              result.skipped_existing.push(`${candidate.tracking_number} (duplicate in this run)`);
              continue;
            }
            seenTrackingNumbers.add(candidate.tracking_number);

            await registerAndWriteCandidate(candidate, {
              inbox,
              email_id: email.id,
              subject: email.subject,
              body: email.body,
            }, dryRun, result);
          } catch (error) {
            result.errors.push({
              stage: 'register',
              detail: `${candidate.tracking_number}: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }
    } catch (error) {
      result.errors.push({
        stage: 'inbox',
        detail: `${inbox}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (!options.skipPoll) {
    await pollActiveShipments(dryRun, result);
  }

  result.ok = result.errors.length === 0;
  await markPipelineRun(options, lookbackHours, dryRun);
  return result;
}
