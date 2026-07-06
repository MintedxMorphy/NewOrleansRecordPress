import {
  afterShipRecordToStatusUpdate,
  listAfterShipTrackingsPage,
  parseAfterShipTrackingUpdate,
  type AfterShipWebhookEvent,
} from '@/lib/aftership';
import { bulkUpsertSheetShipmentStatuses, upsertSheetShipmentStatus } from '@/lib/sheet-shipments';
import { matchJobFromShipmentText } from '@/lib/shipment-job-link';
import { loadProductionJobsForVendorInvoices, type JobContext } from '@/lib/vendor-invoice-import';

export async function applyAfterShipUpdateToSheet(update: {
  tracking_number: string;
  carrier_label: string;
  status: string;
  shipped_date: string;
  est_delivery: string;
  delivered_date: string;
  notes?: string;
}) {
  return upsertSheetShipmentStatus(update.tracking_number, {
    carrier: update.carrier_label,
    status: update.status,
    shipped_date: update.shipped_date,
    est_delivery: update.est_delivery,
    actual_delivery: update.delivered_date,
    notes: update.notes || 'Updated from AfterShip',
  });
}

export async function handleAfterShipWebhookForSheet(payload: AfterShipWebhookEvent) {
  const update = parseAfterShipTrackingUpdate(payload);
  if (!update) {
    return { ignored: true, reason: 'missing_tracking_number' };
  }

  if (payload.event && !['tracking_update', 'edd_revise'].includes(payload.event)) {
    return { ignored: true, reason: `unsupported_event:${payload.event}` };
  }

  const result = await applyAfterShipUpdateToSheet({
    ...update,
    notes: `AfterShip webhook (${payload.event || 'tracking_update'})`,
  });

  return {
    ignored: false,
    tracking_number: update.tracking_number,
    status: update.status,
    sheet_action: result.action,
  };
}

function afterShipRecordLinkText(record: {
  title?: string;
  order_id?: string;
  order_number?: string;
  custom_fields?: Record<string, string> | null;
}) {
  const custom = record.custom_fields || {};
  return [
    record.title,
    record.order_id,
    record.order_number,
    custom.source_inbox,
    custom.job_id,
    custom.matrix,
    custom.customer,
  ].filter(Boolean).join('\n');
}

export async function syncAfterShipTrackingsToSheet(options: {
  jobs?: JobContext[];
  maxPages?: number;
  dryRun?: boolean;
} = {}) {
  const jobs = options.jobs?.length ? options.jobs : await loadProductionJobsForVendorInvoices();
  const maxPages = options.maxPages ?? 5;
  const dryRun = options.dryRun ?? false;

  let cursor: string | undefined;
  let page = 0;
  let synced = 0;
  let created = 0;
  let updated = 0;
  let linked = 0;
  const errors: string[] = [];
  const pendingUpdates: Array<{ tracking_number: string; patch: Record<string, string> }> = [];

  while (page < maxPages) {
    const batch = await listAfterShipTrackingsPage(cursor);
    page += 1;

    for (const record of batch.trackings) {
      const update = afterShipRecordToStatusUpdate(record);
      if (!update?.tracking_number) continue;

      const linkText = afterShipRecordLinkText(record);
      const jobLink = linkText ? matchJobFromShipmentText(linkText, jobs) : null;
      if (jobLink?.job_id || jobLink?.matrix) linked += 1;

      pendingUpdates.push({
        tracking_number: update.tracking_number,
        patch: {
          carrier: update.carrier_label,
          status: update.status,
          shipped_date: update.shipped_date,
          est_delivery: update.est_delivery,
          actual_delivery: update.delivered_date,
          ...(jobLink?.job_id ? { job_id: jobLink.job_id } : {}),
          ...(jobLink?.matrix ? { matrix: jobLink.matrix } : {}),
          ...(jobLink?.customer ? { customer: jobLink.customer } : {}),
          ...(record.title ? { source_subject: String(record.title).slice(0, 250) } : {}),
        },
      });
      synced += 1;
    }

    if (!batch.has_next_page || !batch.next_cursor) break;
    cursor = batch.next_cursor;
  }

  if (pendingUpdates.length) {
    const writeResult = await bulkUpsertSheetShipmentStatuses(pendingUpdates, { dryRun });
    created += writeResult.created;
    updated += writeResult.updated;
    errors.push(...writeResult.errors);
  }

  return {
    ok: errors.length === 0,
    synced,
    created,
    updated,
    linked,
    pages: page,
    errors,
  };
}

export { afterShipRecordToStatusUpdate };
