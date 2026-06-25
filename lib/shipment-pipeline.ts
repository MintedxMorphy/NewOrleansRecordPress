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
import { extractBestTracking, extractTrackingCandidates, type ExtractedTracking } from '@/lib/shipment-email-extract';
import { fetchShipmentEmails, SHIPMENT_INBOXES } from '@/lib/shipment-gmail';
import { linkJobFromEmail } from '@/lib/shipment-job-link';
import {
  listActiveSheetShipments,
  shipmentLedgerHasTracking,
  upsertSheetShipmentStatus,
} from '@/lib/sheet-shipments';

export type ShipmentPipelineOptions = {
  dryRun?: boolean;
  inbox?: string;
  lookbackHours?: number;
  backfillDays?: number;
  maxEmailsPerInbox?: number;
  skipPoll?: boolean;
};

export type ShipmentPipelineResult = {
  ok: boolean;
  dry_run: boolean;
  lookback_hours: number;
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
  errors: Array<{ stage: string; detail: string }>;
};

const DEFAULT_LOOKBACK_HOURS = 36;
const INITIAL_BACKFILL_DAYS = Number(process.env.SHIPMENT_TRACKING_INITIAL_BACKFILL_DAYS || '30');

function pipelineDryRun(options: ShipmentPipelineOptions) {
  if (options.dryRun) return true;
  return process.env.SHIPMENT_TRACKING_DRY_RUN === 'true';
}

async function resolveLookbackHours(options: ShipmentPipelineOptions) {
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

  if (await shipmentLedgerHasTracking(trackingNumber)) {
    result.skipped_existing.push(trackingNumber);
    return;
  }

  const jobLink = await linkJobFromEmail({
    subject: emailMeta.subject,
    body: emailMeta.body,
  });

  if (dryRun) {
    result.created.push(`${trackingNumber} (dry-run)`);
    await upsertSheetShipmentStatus(trackingNumber, {
      job_id: jobLink.job_id,
      carrier: candidate.carrier,
      status: 'Dry run',
      notes: `[dry-run] ${candidate.reason}; job_link=${jobLink.reason}`,
    }, { dryRun: true });
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
    job_id: jobLink.job_id,
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

export async function runShipmentTrackingPipeline(options: ShipmentPipelineOptions = {}): Promise<ShipmentPipelineResult> {
  if (!hasServiceAccount()) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is required for shipment inbox scanning');
  }

  const dryRun = pipelineDryRun(options);
  const lookbackHours = await resolveLookbackHours(options);
  const afterEpochSeconds = Math.floor(Date.now() / 1000 - lookbackHours * 60 * 60);
  const inboxes = options.inbox ? [options.inbox] : [...SHIPMENT_INBOXES];
  const maxEmails = options.maxEmailsPerInbox ?? 50;

  const result: ShipmentPipelineResult = {
    ok: true,
    dry_run: dryRun,
    lookback_hours: lookbackHours,
    inboxes,
    extracted: [],
    created: [],
    skipped_existing: [],
    polled: [],
    errors: [],
  };

  for (const inbox of inboxes) {
    try {
      const auth = getShipmentInboxAuth(inbox);
      const gmail = google.gmail({ version: 'v1', auth });
      const emails = await fetchShipmentEmails(gmail, inbox, afterEpochSeconds, maxEmails);

      for (const email of emails) {
        const candidates = extractTrackingCandidates(email);
        const selected = extractBestTracking(email);

        result.extracted.push({
          inbox,
          email_id: email.id,
          from: email.from,
          subject: email.subject,
          candidates,
          selected,
        });

        if (!selected || selected.confidence !== 'high') continue;

        try {
          await registerAndWriteCandidate(selected, {
            inbox,
            email_id: email.id,
            subject: email.subject,
            body: email.body,
          }, dryRun, result);
        } catch (error) {
          result.errors.push({
            stage: 'register',
            detail: `${selected.tracking_number}: ${error instanceof Error ? error.message : String(error)}`,
          });
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
