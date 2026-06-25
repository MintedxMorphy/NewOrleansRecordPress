import {
  afterShipRecordToStatusUpdate,
  parseAfterShipTrackingUpdate,
  type AfterShipWebhookEvent,
} from '@/lib/aftership';
import { upsertSheetShipmentStatus } from '@/lib/sheet-shipments';

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

export { afterShipRecordToStatusUpdate };
