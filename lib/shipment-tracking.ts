import {
  carrierLabelFromSlug,
  isAfterShipConfigured,
  normalizeTrackingNumber,
  parseAfterShipTrackingUpdate,
  registerAfterShipTracking,
  type AfterShipTrackingUpdate,
  type AfterShipWebhookEvent,
} from '@/lib/aftership';
import { resolveAirtableJobReference } from '@/lib/airtable';
import {
  createJobShipment,
  createStandaloneShipment,
  findShipmentByRecordId,
  findShipmentByTrackingNumber,
  listAllShipmentsForSync,
  updateShipmentRecord,
  type ShipmentDirection,
  type StandaloneShipmentInput,
} from '@/lib/airtable-shipments';

export type RegisterTrackingInput = {
  tracking_number: string;
  carrier?: string;
  direction?: ShipmentDirection;
  matrix?: string;
  customer?: string;
  job_ref?: string;
  job_id?: string;
  supply_type?: string;
  notes?: string;
  total_cost?: number;
  source?: string;
};

function appendSourceNote(existingNotes: string, source: string, summary: string) {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${source}: ${summary}`.trim();
  if (!existingNotes) return line;
  if (existingNotes.includes(line)) return existingNotes;
  return `${existingNotes}\n${line}`.trim();
}

async function resolveJobContext(input: RegisterTrackingInput) {
  const jobRef = input.job_ref || input.job_id || input.matrix || '';
  if (!jobRef) {
    return {
      matrix: input.matrix || '',
      customer: input.customer || '',
    };
  }

  const job = await resolveAirtableJobReference(jobRef);
  if (!job) {
    return {
      matrix: input.matrix || '',
      customer: input.customer || '',
    };
  }

  return {
    matrix: input.matrix || job.matrix,
    customer: input.customer || job.customer,
  };
}

async function ensureShipmentRecord(input: RegisterTrackingInput) {
  const trackingNumber = normalizeTrackingNumber(input.tracking_number);
  if (!trackingNumber) {
    throw new Error('Tracking number is required');
  }

  const existing = await findShipmentByTrackingNumber(trackingNumber);
  if (existing) return existing;

  const context = await resolveJobContext(input);
  const notes = input.notes || (input.source ? `Registered from ${input.source}` : 'Registered for AfterShip tracking');
  const payload: StandaloneShipmentInput = {
    tracking_number: trackingNumber,
    direction: input.direction || 'inbound',
    carrier: input.carrier || '',
    status: 'Tracking registered',
    supply_type: input.supply_type || 'other',
    matrix: context.matrix,
    customer: context.customer,
    notes,
    total_cost: input.total_cost ?? 0,
  };

  if (input.job_ref || input.job_id) {
    try {
      return await createJobShipment(input.job_ref || input.job_id || '', {
        tracking_number: trackingNumber,
        direction: input.direction || 'inbound',
        carrier: input.carrier || '',
        status: 'Tracking registered',
        supply_type: input.supply_type || 'other',
        notes,
        total_cost: input.total_cost ?? 0,
      });
    } catch {
      return createStandaloneShipment(payload);
    }
  }

  return createStandaloneShipment(payload);
}

export async function registerTrackingShipment(input: RegisterTrackingInput) {
  const trackingNumber = normalizeTrackingNumber(input.tracking_number);
  const shipment = await ensureShipmentRecord(input);

  let aftership: Awaited<ReturnType<typeof registerAfterShipTracking>> | null = null;
  let aftershipError = '';

  if (isAfterShipConfigured()) {
    try {
      aftership = await registerAfterShipTracking({
        tracking_number: trackingNumber,
        carrier: input.carrier || shipment.carrier,
        title: shipment.matrix || shipment.customer || trackingNumber,
        custom_fields: {
          airtable_record_id: shipment.id,
          matrix: shipment.matrix || '',
          customer: shipment.customer || '',
          direction: shipment.direction,
        },
      });
    } catch (error) {
      aftershipError = error instanceof Error ? error.message : String(error);
    }
  } else {
    aftershipError = 'AfterShip is not configured';
  }

  const updated = await updateShipmentRecord(shipment.id, {
    carrier: input.carrier || shipment.carrier || (aftership?.slug ? carrierLabelFromSlug(aftership.slug) : shipment.carrier),
    status: aftership?.tag ? `AfterShip: ${aftership.tag}` : shipment.status || 'Tracking registered',
    aftership_id: aftership?.id || shipment.aftership_id || '',
    notes: input.source
      ? appendSourceNote(shipment.notes, input.source, `Tracking ${trackingNumber} registered`)
      : shipment.notes,
  });

  return {
    shipment: updated,
    aftership,
    aftership_error: aftershipError,
  };
}

export async function applyAfterShipWebhookUpdate(update: AfterShipTrackingUpdate) {
  let shipment = update.airtable_record_id
    ? await findShipmentByRecordId(update.airtable_record_id)
    : null;

  if (!shipment && update.tracking_number) {
    shipment = await findShipmentByTrackingNumber(update.tracking_number);
  }

  if (!shipment) {
    shipment = await createStandaloneShipment({
      tracking_number: update.tracking_number,
      direction: 'inbound',
      carrier: update.carrier_label,
      status: update.status,
      supply_type: 'other',
      shipped_date: update.shipped_date,
      est_delivery: update.est_delivery,
      delivered_date: update.delivered_date,
      aftership_id: update.aftership_id,
      notes: 'Auto-created from AfterShip webhook',
    });
  } else {
    shipment = await updateShipmentRecord(shipment.id, {
      carrier: update.carrier_label || shipment.carrier,
      status: update.status,
      shipped_date: update.shipped_date || shipment.shipped_date,
      est_delivery: update.est_delivery || shipment.est_delivery,
      delivered_date: update.delivered_date || shipment.delivered_date,
      aftership_id: update.aftership_id || shipment.aftership_id,
    });
  }

  return shipment;
}

export async function handleAfterShipWebhookEvent(payload: AfterShipWebhookEvent) {
  const update = parseAfterShipTrackingUpdate(payload);
  if (!update) {
    return { ignored: true, reason: 'missing_tracking_number' };
  }

  if (payload.event && !['tracking_update', 'edd_revise'].includes(payload.event)) {
    return { ignored: true, reason: `unsupported_event:${payload.event}` };
  }

  const shipment = await applyAfterShipWebhookUpdate(update);
  return {
    ignored: false,
    event: payload.event || 'tracking_update',
    tracking_number: update.tracking_number,
    shipment_id: shipment.id,
    status: update.status,
  };
}

export async function registerPendingAfterShipShipments(limit = 25) {
  if (!isAfterShipConfigured()) {
    return { registered: 0, skipped: 0, errors: ['AfterShip is not configured'] };
  }

  const candidates = (await listAllShipmentsForSync())
    .filter(shipment => shipment.tracking_number && !shipment.aftership_id)
    .slice(0, limit);

  const results: Array<{ tracking_number: string; ok: boolean; error?: string }> = [];

  for (const shipment of candidates) {
    try {
      await registerTrackingShipment({
        tracking_number: shipment.tracking_number,
        carrier: shipment.carrier,
        direction: shipment.direction,
        matrix: shipment.matrix,
        customer: shipment.customer,
        notes: shipment.notes,
        source: 'aftership_backfill',
      });
      results.push({ tracking_number: shipment.tracking_number, ok: true });
    } catch (error) {
      results.push({
        tracking_number: shipment.tracking_number,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    registered: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).length,
    results,
  };
}
