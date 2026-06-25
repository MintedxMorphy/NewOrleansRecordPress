import {
  isAirtableConfigured,
  resolveAirtableJobReference,
} from '@/lib/airtable';

export type ShipmentDirection = 'inbound' | 'outbound';

export type SupplyType =
  | 'pvc'
  | 'inner_sleeves'
  | 'jackets'
  | 'labels'
  | 'stampers'
  | 'finished_goods'
  | 'other';

export type JobShipment = {
  id: string;
  tracking_number: string;
  direction: ShipmentDirection;
  carrier: string;
  status: string;
  supply_type: string;
  matrix: string;
  customer: string;
  shipped_date: string;
  est_delivery: string;
  delivered_date: string;
  total_cost: number;
  notes: string;
};

export type JobLogisticsSummary = {
  job: {
    record_id: string;
    job_id: string;
    matrix: string;
    customer: string;
    order_number: string;
  };
  shipments: JobShipment[];
  totals: {
    inbound_cost: number;
    outbound_cost: number;
    all_cost: number;
  };
};

export type CreateJobShipmentInput = {
  tracking_number?: string;
  direction: ShipmentDirection;
  carrier?: string;
  status?: string;
  supply_type?: SupplyType | string;
  shipped_date?: string;
  est_delivery?: string;
  delivered_date?: string;
  total_cost?: number;
  notes?: string;
};

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

const SHIPMENT_FIELD_ALIASES = {
  tracking_number: ['Tracking Number', 'Tracking #', 'Tracking'],
  direction: ['Direction'],
  carrier: ['Carrier'],
  status: ['Status', 'Ship Status'],
  supply_type: ['Supply Type', 'Material Type'],
  matrix: ['Matrix', 'MATRIX', 'Matrix ID'],
  customer: ['Customer', 'Customer Name', 'Artist'],
  shipped_date: ['Shipped Date', 'Ship Date'],
  est_delivery: ['Est Delivery', 'Estimated Delivery'],
  delivered_date: ['Delivered Date', 'Actual Delivery', 'Delivery Date'],
  total_cost: ['Total Cost', 'Shipping Cost', 'Cost'],
  notes: ['Notes'],
} as const;

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
  error?: { message?: string };
};

type AirtableTableMeta = {
  id: string;
  name: string;
  fields: Array<{ id: string; name: string; type: string; options?: { choices?: Array<{ name: string }> } }>;
};

function airtableToken() {
  return process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
}

function airtableBaseId() {
  return process.env.AIRTABLE_BASE_ID;
}

function airtableShipmentsTable() {
  return process.env.AIRTABLE_SHIPMENTS_TABLE || 'Shipments';
}

function airtableHeaders() {
  const token = airtableToken();
  if (!token) throw new Error('Missing Airtable token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function shipmentsTableUrl(path = '') {
  const baseId = airtableBaseId();
  const table = airtableShipmentsTable();
  if (!baseId) throw new Error('Missing AIRTABLE_BASE_ID');
  return `${AIRTABLE_API_URL}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}${path}`;
}

function baseMetaUrl() {
  const baseId = airtableBaseId();
  if (!baseId) throw new Error('Missing AIRTABLE_BASE_ID');
  return `${AIRTABLE_API_URL}/meta/bases/${encodeURIComponent(baseId)}/tables`;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseNumber(value: unknown) {
  const cleaned = stringValue(value).replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function field(fields: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return stringValue(value);
  }
  return '';
}

function cleanKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizeDirection(value: string): ShipmentDirection {
  return value.toLowerCase().includes('out') ? 'outbound' : 'inbound';
}

function directionLabel(direction: ShipmentDirection) {
  return direction === 'outbound' ? 'Outbound' : 'Inbound';
}

function supplyTypeLabel(value: string) {
  const labels: Record<string, string> = {
    pvc: 'PVC',
    inner_sleeves: 'Inner Sleeves',
    jackets: 'Jackets',
    labels: 'Labels',
    stampers: 'Stampers',
    finished_goods: 'Finished Goods',
    other: 'Other',
  };
  return labels[value] || value || 'Other';
}

function mapShipmentRecord(record: AirtableRecord): JobShipment {
  const fields = record.fields;
  return {
    id: record.id,
    tracking_number: field(fields, SHIPMENT_FIELD_ALIASES.tracking_number),
    direction: normalizeDirection(field(fields, SHIPMENT_FIELD_ALIASES.direction) || 'Inbound'),
    carrier: field(fields, SHIPMENT_FIELD_ALIASES.carrier),
    status: field(fields, SHIPMENT_FIELD_ALIASES.status),
    supply_type: field(fields, SHIPMENT_FIELD_ALIASES.supply_type),
    matrix: field(fields, SHIPMENT_FIELD_ALIASES.matrix),
    customer: field(fields, SHIPMENT_FIELD_ALIASES.customer),
    shipped_date: field(fields, SHIPMENT_FIELD_ALIASES.shipped_date),
    est_delivery: field(fields, SHIPMENT_FIELD_ALIASES.est_delivery),
    delivered_date: field(fields, SHIPMENT_FIELD_ALIASES.delivered_date),
    total_cost: parseNumber(rawField(fields, SHIPMENT_FIELD_ALIASES.total_cost)),
    notes: field(fields, SHIPMENT_FIELD_ALIASES.notes),
  };
}

function rawField(fields: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function shipmentMatchesJob(shipment: JobShipment, job: { matrix: string; customer: string }) {
  const jobMatrix = cleanKey(job.matrix);
  const jobCustomer = cleanKey(job.customer);
  const shipmentMatrix = cleanKey(shipment.matrix);
  const shipmentCustomer = cleanKey(shipment.customer);

  if (jobMatrix) {
    if (shipmentMatrix) return shipmentMatrix === jobMatrix;
    if (jobCustomer && shipmentCustomer) return shipmentCustomer === jobCustomer;
    return false;
  }

  if (jobCustomer && shipmentCustomer) return shipmentCustomer === jobCustomer;
  return false;
}

async function listAllShipments() {
  const shipments: JobShipment[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);

    const res = await fetch(`${shipmentsTableUrl()}?${params.toString()}`, {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    const data = (await res.json()) as AirtableListResponse;

    if (!res.ok) {
      throw new Error(data.error?.message || `Airtable shipments request failed (${res.status})`);
    }

    for (const record of data.records || []) {
      shipments.push(mapShipmentRecord(record));
    }
    offset = data.offset;
  } while (offset);

  return shipments;
}

async function getShipmentsTableMeta() {
  const res = await fetch(baseMetaUrl(), {
    headers: airtableHeaders(),
    cache: 'no-store',
  });
  const data = await res.json() as { tables?: AirtableTableMeta[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable metadata lookup failed (${res.status})`);
  }

  const configured = airtableShipmentsTable();
  return data.tables?.find(table => table.id === configured || table.name === configured);
}

function resolveField(table: AirtableTableMeta | undefined, aliases: readonly string[]) {
  if (!table) return undefined;
  for (const alias of aliases) {
    const match = table.fields.find(fieldMeta => fieldMeta.name.toLowerCase() === alias.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

function choiceForField(fieldMeta: NonNullable<ReturnType<typeof resolveField>>, value: string) {
  const choices = fieldMeta.options?.choices || [];
  if (!choices.length) return value;
  const normalized = value.trim().toLowerCase();
  return choices.find(choice => choice.name.toLowerCase() === normalized)?.name || value;
}

function airtableValueForField(
  fieldMeta: NonNullable<ReturnType<typeof resolveField>>,
  value: unknown,
) {
  if (value === null || value === undefined || value === '') return undefined;

  if (['number', 'currency', 'percent', 'rating', 'duration'].includes(fieldMeta.type)) {
    const parsed = parseNumber(value);
    return parsed;
  }

  if (fieldMeta.type === 'singleSelect') {
    return choiceForField(fieldMeta, stringValue(value));
  }

  if (['date', 'dateTime'].includes(fieldMeta.type)) {
    const raw = stringValue(value).trim();
    return raw || undefined;
  }

  return stringValue(value);
}

export function trackingUrl(carrier: string, trackingNumber: string) {
  const number = trackingNumber.trim();
  if (!number) return '';

  const normalized = carrier.toLowerCase();
  if (normalized.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`;
  if (normalized.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`;
  if (normalized.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`;
  return `https://www.aftership.com/track/${encodeURIComponent(number)}`;
}

export async function getJobLogistics(jobRef: string): Promise<JobLogisticsSummary> {
  if (!isAirtableConfigured()) {
    throw new Error('Airtable is not configured');
  }

  const job = await resolveAirtableJobReference(jobRef);
  if (!job) {
    throw new Error(`Job not found: ${jobRef}`);
  }

  let shipments: JobShipment[] = [];
  try {
    const allShipments = await listAllShipments();
    shipments = allShipments
      .filter(shipment => shipmentMatchesJob(shipment, job))
      .sort((a, b) => (b.shipped_date || b.est_delivery).localeCompare(a.shipped_date || a.est_delivery));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('could not find table')) throw error;
  }

  const inbound_cost = shipments
    .filter(shipment => shipment.direction === 'inbound')
    .reduce((sum, shipment) => sum + shipment.total_cost, 0);
  const outbound_cost = shipments
    .filter(shipment => shipment.direction === 'outbound')
    .reduce((sum, shipment) => sum + shipment.total_cost, 0);

  return {
    job: {
      record_id: job.recordId,
      job_id: job.job_id,
      matrix: job.matrix,
      customer: job.customer,
      order_number: job.order_number,
    },
    shipments,
    totals: {
      inbound_cost,
      outbound_cost,
      all_cost: inbound_cost + outbound_cost,
    },
  };
}

export async function createJobShipment(jobRef: string, input: CreateJobShipmentInput) {
  if (!isAirtableConfigured()) {
    throw new Error('Airtable is not configured');
  }

  const job = await resolveAirtableJobReference(jobRef);
  if (!job) {
    throw new Error(`Job not found: ${jobRef}`);
  }

  const table = await getShipmentsTableMeta();
  if (!table) {
    throw new Error(
      `Airtable table not found: ${airtableShipmentsTable()}. Create a Shipments table in your base first.`,
    );
  }

  const writable: Record<string, unknown> = {};
  const assign = (aliases: readonly string[], value: unknown) => {
    const fieldMeta = resolveField(table, aliases);
    if (!fieldMeta) return;
    const sanitized = airtableValueForField(fieldMeta, value);
    if (sanitized === undefined) return;
    writable[fieldMeta.name] = sanitized;
  };

  assign(SHIPMENT_FIELD_ALIASES.tracking_number, input.tracking_number || '');
  assign(SHIPMENT_FIELD_ALIASES.direction, directionLabel(input.direction));
  assign(SHIPMENT_FIELD_ALIASES.carrier, input.carrier || '');
  assign(SHIPMENT_FIELD_ALIASES.status, input.status || 'Logged');
  assign(SHIPMENT_FIELD_ALIASES.supply_type, supplyTypeLabel(String(input.supply_type || 'other')));
  assign(SHIPMENT_FIELD_ALIASES.matrix, job.matrix);
  assign(SHIPMENT_FIELD_ALIASES.customer, job.customer);
  assign(SHIPMENT_FIELD_ALIASES.shipped_date, input.shipped_date || new Date().toISOString().slice(0, 10));
  assign(SHIPMENT_FIELD_ALIASES.est_delivery, input.est_delivery || '');
  assign(SHIPMENT_FIELD_ALIASES.delivered_date, input.delivered_date || '');
  assign(SHIPMENT_FIELD_ALIASES.total_cost, input.total_cost ?? 0);
  assign(SHIPMENT_FIELD_ALIASES.notes, input.notes || '');

  const res = await fetch(shipmentsTableUrl(), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: writable, typecast: true }),
  });
  const data = await res.json() as AirtableRecord & { error?: { message?: string } };

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable shipment create failed (${res.status})`);
  }

  return mapShipmentRecord(data);
}
