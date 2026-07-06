import { appendRow, ensureCanonicalHeaders, findRow, getSheet, updateRow } from '@/lib/sheets';

export type SheetShipmentRow = Record<string, string>;

const STATUS_ONLY_FIELDS = new Set([
  'tracking_number',
  'job_id',
  'matrix',
  'customer',
  'direction',
  'supply_type',
  'source_subject',
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

const LINKAGE_FIELDS = new Set(['job_id', 'matrix', 'customer', 'source_subject']);

export function buildStatusOnlyUpdate(
  existing: SheetShipmentRow,
  updates: Partial<SheetShipmentRow>,
): SheetShipmentRow {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (!STATUS_ONLY_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    if (LINKAGE_FIELDS.has(key) && !String(value).trim()) continue;
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

  await ensureCanonicalHeaders('shipments');

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
    matrix: payload.matrix || '',
    customer: payload.customer || '',
    direction: payload.direction || '',
    supply_type: payload.supply_type || '',
    source_subject: payload.source_subject || '',
  };

  await appendRow('shipments', created);
  return { action: 'created' as const, tracking_number: normalized, row: created };
}

function newSheetShipmentRow(payload: Partial<SheetShipmentRow>, normalized: string): SheetShipmentRow {
  return {
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
    matrix: payload.matrix || '',
    customer: payload.customer || '',
    direction: payload.direction || '',
    supply_type: payload.supply_type || '',
    source_subject: payload.source_subject || '',
  };
}

export async function bulkUpsertSheetShipmentStatuses(
  updates: Array<{ tracking_number: string; patch: Partial<SheetShipmentRow> }>,
  options: { dryRun?: boolean } = {},
) {
  if (!updates.length) {
    return { created: 0, updated: 0, errors: [] as string[] };
  }

  if (options.dryRun) {
    return { created: updates.length, updated: 0, errors: [] as string[] };
  }

  await ensureCanonicalHeaders('shipments');
  const rows = await getSheet('shipments');
  const indexByTracking = new Map<string, number>();
  rows.forEach((row, index) => {
    const normalized = normalizeTrackingNumber(row.tracking_number || '');
    if (normalized) indexByTracking.set(normalized, index);
  });

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const toAppend: SheetShipmentRow[] = [];
  const changedRowIndexes = new Set<number>();

  for (const entry of updates) {
    const normalized = normalizeTrackingNumber(entry.tracking_number);
    if (!normalized) continue;

    const payload = {
      ...entry.patch,
      tracking_number: normalized,
      last_status_update: entry.patch.last_status_update || new Date().toISOString(),
    };

    const existingIndex = indexByTracking.get(normalized);
    if (existingIndex !== undefined) {
      rows[existingIndex] = buildStatusOnlyUpdate(rows[existingIndex], payload);
      changedRowIndexes.add(existingIndex);
      updated += 1;
      continue;
    }

    toAppend.push(newSheetShipmentRow(payload, normalized));
    created += 1;
  }

  for (const index of changedRowIndexes) {
    const rowIndex = index + 2;
    try {
      await updateRow('shipments', rowIndex, rows[index]);
    } catch (error) {
      errors.push(`row ${rowIndex}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const row of toAppend) {
    try {
      await appendRow('shipments', row);
    } catch (error) {
      errors.push(`${row.tracking_number}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { created, updated, errors };
}

export async function shipmentLedgerHasTracking(trackingNumber: string) {
  return Boolean(await findSheetShipment(trackingNumber));
}
