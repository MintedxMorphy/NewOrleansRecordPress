import { appendRow, findRow, getSheet, updateRow } from '@/lib/sheets';

export type SheetShipmentRow = Record<string, string>;

const STATUS_ONLY_FIELDS = new Set([
  'tracking_number',
  'job_id',
  'carrier',
  'service',
  'shipped_date',
  'est_delivery',
  'actual_delivery',
  'status',
  'last_status_update',
  'notes',
]);

const COST_FIELDS = new Set([
  'total_cost',
  'base_cost',
  'fuel_surcharge',
  'accessorials',
]);

function normalizeTrackingNumber(value: string) {
  return value.replace(/\s+/g, '').trim().toUpperCase();
}

export async function findSheetShipment(trackingNumber: string) {
  const normalized = normalizeTrackingNumber(trackingNumber);
  const rows = await getSheet('shipments');
  const index = rows.findIndex(row => normalizeTrackingNumber(row.tracking_number || '') === normalized);
  if (index === -1) return null;
  return { row: rows[index], rowIndex: index + 2 };
}

export async function listActiveSheetShipments() {
  const rows = await getSheet('shipments');
  return rows.filter(row => {
    const status = (row.status || '').toLowerCase();
    return row.tracking_number && !['delivered', 'returned'].includes(status);
  });
}

export function buildStatusOnlyUpdate(
  existing: SheetShipmentRow,
  updates: Partial<SheetShipmentRow>,
): SheetShipmentRow {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (!STATUS_ONLY_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    merged[key] = value;
  }
  for (const key of COST_FIELDS) {
    if (existing[key]) merged[key] = existing[key];
  }
  return merged;
}

export async function upsertSheetShipmentStatus(
  trackingNumber: string,
  updates: Partial<SheetShipmentRow>,
  options: { dryRun?: boolean } = {},
) {
  const normalized = normalizeTrackingNumber(trackingNumber);
  const payload = {
    ...updates,
    tracking_number: normalized,
    last_status_update: updates.last_status_update || new Date().toISOString(),
  };

  if (options.dryRun) {
    return { action: 'dry_run' as const, tracking_number: normalized, updates: payload };
  }

  const existing = await findSheetShipment(normalized);
  if (existing) {
    const merged = buildStatusOnlyUpdate(existing.row, payload);
    await updateRow('shipments', existing.rowIndex, merged);
    return { action: 'updated' as const, tracking_number: normalized, row: merged };
  }

  const created: SheetShipmentRow = {
    tracking_number: normalized,
    job_id: payload.job_id || '',
    carrier: payload.carrier || '',
    service: payload.service || '',
    weight_lbs: '',
    dimensions: '',
    shipped_date: payload.shipped_date || new Date().toISOString().slice(0, 10),
    est_delivery: payload.est_delivery || '',
    actual_delivery: payload.actual_delivery || '',
    status: payload.status || 'Registered',
    last_status_update: payload.last_status_update || new Date().toISOString(),
    total_cost: '',
    base_cost: '',
    fuel_surcharge: '',
    accessorials: '',
    notes: payload.notes || '',
  };

  await appendRow('shipments', created);
  return { action: 'created' as const, tracking_number: normalized, row: created };
}

export async function shipmentLedgerHasTracking(trackingNumber: string) {
  return Boolean(await findSheetShipment(trackingNumber));
}
