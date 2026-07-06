import { isAirtableConfigured } from '@/lib/airtable';

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

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
  fields: Array<{
    id: string;
    name: string;
    type: string;
    options?: { choices?: Array<{ name: string }> };
  }>;
};

export type VendorCostRowInput = {
  invoice_number?: string;
  vendor?: string;
  category?: string;
  matrix?: string;
  customer?: string;
  job_id?: string;
  description?: string;
  quantity?: number;
  unit_cost?: number;
  amount: number;
  invoice_date?: string;
  source_file?: string;
  raw_line?: string;
  match_confidence?: string;
};

export type VendorCost = Required<Pick<VendorCostRowInput, 'amount'>> & Omit<VendorCostRowInput, 'amount'> & {
  id: string;
  duplicate_key: string;
  imported_at: string;
};

export type VendorCostSummary = {
  total: number;
  count: number;
  categories: Record<string, number>;
  items: VendorCost[];
};

const FIELD_ALIASES = {
  name: ['Name', 'Vendor Cost', 'Line Key'],
  invoice_number: ['Invoice Number', 'Invoice #', 'Invoice'],
  vendor: ['Vendor', 'Supplier'],
  category: ['Category', 'Cost Category', 'Type'],
  matrix: ['Matrix', 'MATRIX', 'Matrix ID'],
  customer: ['Customer', 'Customer Name', 'Artist'],
  job_id: ['Job ID', 'Job Id', 'JobID'],
  description: ['Description', 'Line Description', 'Item', 'Memo'],
  quantity: ['Quantity', 'Qty'],
  unit_cost: ['Unit Cost', 'Unit Price', 'Rate'],
  amount: ['Amount', 'Line Amount', 'Total', 'Cost'],
  invoice_date: ['Invoice Date', 'Date'],
  source_file: ['Source File', 'File Name', 'Filename'],
  raw_line: ['Raw Line', 'Raw Text'],
  match_confidence: ['Match Confidence', 'Confidence'],
  duplicate_key: ['Duplicate Key', 'Import Key', 'Idempotency Key'],
  imported_at: ['Imported At', 'Imported'],
} as const;

function airtableToken() {
  return process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
}

function airtableBaseId() {
  return process.env.AIRTABLE_BASE_ID;
}

export function airtableVendorCostsTable() {
  return process.env.AIRTABLE_VENDOR_COSTS_TABLE || 'Vendor Costs';
}

function airtableHeaders() {
  const token = airtableToken();
  if (!token) throw new Error('Missing Airtable token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function tableUrl(path = '') {
  const baseId = airtableBaseId();
  const table = airtableVendorCostsTable();
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

function normalizedKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedCategory(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function duplicateKeyFor(input: Pick<VendorCostRowInput, 'invoice_number' | 'matrix' | 'category' | 'amount'>) {
  return [
    normalizedKey(input.invoice_number || ''),
    normalizedKey(input.matrix || ''),
    normalizedCategory(input.category || ''),
    Number(input.amount || 0).toFixed(2),
  ].join('|');
}

function likelySameChargeKeyFor(input: Pick<VendorCostRowInput, 'vendor' | 'matrix' | 'job_id' | 'amount'>) {
  return [
    normalizedKey(input.vendor || ''),
    normalizedKey(input.matrix || input.job_id || ''),
    Number(input.amount || 0).toFixed(2),
  ].join('|');
}

function isGenericCategory(value = '') {
  return ['other', 'misc', 'miscellaneous', 'unknown', ''].includes(normalizedCategory(value));
}

function betterVendorCost(existing: VendorCost, candidate: VendorCost) {
  if (isGenericCategory(existing.category) && !isGenericCategory(candidate.category)) return candidate;
  if (!existing.description && candidate.description) return candidate;
  if (!existing.raw_line && candidate.raw_line) return candidate;
  return existing;
}

function field(fields: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return stringValue(value);
  }
  return '';
}

function rawField(fields: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function mapRecord(record: AirtableRecord): VendorCost {
  const fields = record.fields;
  const cost = {
    id: record.id,
    invoice_number: field(fields, FIELD_ALIASES.invoice_number),
    vendor: field(fields, FIELD_ALIASES.vendor),
    category: field(fields, FIELD_ALIASES.category),
    matrix: field(fields, FIELD_ALIASES.matrix),
    customer: field(fields, FIELD_ALIASES.customer),
    job_id: field(fields, FIELD_ALIASES.job_id),
    description: field(fields, FIELD_ALIASES.description),
    quantity: parseNumber(rawField(fields, FIELD_ALIASES.quantity)),
    unit_cost: parseNumber(rawField(fields, FIELD_ALIASES.unit_cost)),
    amount: parseNumber(rawField(fields, FIELD_ALIASES.amount)),
    invoice_date: field(fields, FIELD_ALIASES.invoice_date),
    source_file: field(fields, FIELD_ALIASES.source_file),
    raw_line: field(fields, FIELD_ALIASES.raw_line),
    match_confidence: field(fields, FIELD_ALIASES.match_confidence),
    duplicate_key: field(fields, FIELD_ALIASES.duplicate_key),
    imported_at: field(fields, FIELD_ALIASES.imported_at),
  };

  return {
    ...cost,
    duplicate_key: cost.duplicate_key || duplicateKeyFor(cost),
  };
}

async function getVendorCostsTableMeta() {
  const res = await fetch(baseMetaUrl(), {
    headers: airtableHeaders(),
    cache: 'no-store',
  });
  const data = await res.json() as { tables?: AirtableTableMeta[]; error?: { message?: string } };

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable metadata lookup failed (${res.status})`);
  }

  const configured = airtableVendorCostsTable();
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
    return parseNumber(value);
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

function buildWritableFields(table: AirtableTableMeta, input: VendorCostRowInput, duplicateKey: string) {
  const writable: Record<string, unknown> = {};
  const amount = Number(input.amount || 0);
  const name = [
    input.invoice_number || 'Invoice',
    input.matrix || 'unmatched',
    input.category || 'Vendor Cost',
    amount.toFixed(2),
  ].join(' / ');

  const assign = (aliases: readonly string[], value: unknown) => {
    const fieldMeta = resolveField(table, aliases);
    if (!fieldMeta) return;
    const sanitized = airtableValueForField(fieldMeta, value);
    if (sanitized === undefined) return;
    writable[fieldMeta.name] = sanitized;
  };

  assign(FIELD_ALIASES.name, name);
  assign(FIELD_ALIASES.invoice_number, input.invoice_number || '');
  assign(FIELD_ALIASES.vendor, input.vendor || '');
  assign(FIELD_ALIASES.category, input.category || 'Other');
  assign(FIELD_ALIASES.matrix, input.matrix || '');
  assign(FIELD_ALIASES.customer, input.customer || '');
  assign(FIELD_ALIASES.job_id, input.job_id || '');
  assign(FIELD_ALIASES.description, input.description || '');
  if (input.quantity !== undefined) assign(FIELD_ALIASES.quantity, input.quantity);
  if (input.unit_cost !== undefined) assign(FIELD_ALIASES.unit_cost, input.unit_cost);
  assign(FIELD_ALIASES.amount, amount);
  assign(FIELD_ALIASES.invoice_date, input.invoice_date || '');
  assign(FIELD_ALIASES.source_file, input.source_file || '');
  assign(FIELD_ALIASES.raw_line, input.raw_line || '');
  assign(FIELD_ALIASES.match_confidence, input.match_confidence || '');
  assign(FIELD_ALIASES.duplicate_key, duplicateKey);
  assign(FIELD_ALIASES.imported_at, new Date().toISOString());

  return writable;
}

async function listAllVendorCosts() {
  const costs: VendorCost[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);

    const res = await fetch(`${tableUrl()}?${params.toString()}`, {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    const data = await res.json() as AirtableListResponse;

    if (!res.ok) {
      throw new Error(data.error?.message || `Airtable vendor costs request failed (${res.status})`);
    }

    costs.push(...(data.records || []).map(mapRecord));
    offset = data.offset;
  } while (offset);

  return costs;
}

export async function getVendorCostSummariesByMatrix(): Promise<Map<string, VendorCostSummary>> {
  if (!isAirtableConfigured()) return new Map();

  const costs = await listAllVendorCosts();
  const summaries = new Map<string, VendorCostSummary>();
  const seenChargesByMatrix = new Map<string, Map<string, VendorCost>>();

  for (const cost of costs) {
    const key = normalizedKey(cost.matrix);
    if (!key) continue;
    const summary = summaries.get(key) || { total: 0, count: 0, categories: {}, items: [] };
    const chargeKey = likelySameChargeKeyFor(cost);
    const seenCharges = seenChargesByMatrix.get(key) || new Map<string, VendorCost>();
    const existingCharge = seenCharges.get(chargeKey);

    if (existingCharge) {
      const preferred = betterVendorCost(existingCharge, cost);
      if (preferred.id !== existingCharge.id) {
        const existingIndex = summary.items.findIndex(item => item.id === existingCharge.id);
        if (existingIndex !== -1) summary.items[existingIndex] = preferred;
        seenCharges.set(chargeKey, preferred);
      }
      summaries.set(key, rebuildVendorCostSummary(summary.items));
      seenChargesByMatrix.set(key, seenCharges);
      continue;
    }

    summary.total += cost.amount;
    summary.count += 1;
    const category = cost.category || 'Other';
    summary.categories[category] = (summary.categories[category] || 0) + cost.amount;
    summary.items.push(cost);
    seenCharges.set(chargeKey, cost);
    seenChargesByMatrix.set(key, seenCharges);
    summaries.set(key, summary);
  }

  return summaries;
}

function rebuildVendorCostSummary(items: VendorCost[]): VendorCostSummary {
  const summary: VendorCostSummary = { total: 0, count: items.length, categories: {}, items };
  for (const item of items) {
    summary.total += item.amount;
    const category = item.category || 'Other';
    summary.categories[category] = (summary.categories[category] || 0) + item.amount;
  }
  return summary;
}

export async function createVendorCostRows(inputs: VendorCostRowInput[]) {
  if (!isAirtableConfigured()) {
    throw new Error('Airtable is not configured');
  }

  const table = await getVendorCostsTableMeta();
  if (!table) {
    throw new Error(`Airtable table not found: ${airtableVendorCostsTable()}. Create it in Airtable before applying invoices.`);
  }

  const existingCosts = await listAllVendorCosts();
  const existingKeys = new Set(existingCosts.map(cost => cost.duplicate_key || duplicateKeyFor(cost)));
  const existingLikelyCharges = new Set(existingCosts.map(cost => likelySameChargeKeyFor(cost)));
  const created: VendorCost[] = [];
  const skipped: Array<{ input: VendorCostRowInput; duplicate_key: string }> = [];

  for (const input of inputs) {
    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const normalizedInput = { ...input, amount };
    const duplicateKey = duplicateKeyFor(normalizedInput);
    const likelySameChargeKey = likelySameChargeKeyFor(normalizedInput);
    if (existingKeys.has(duplicateKey) || existingLikelyCharges.has(likelySameChargeKey)) {
      skipped.push({ input: normalizedInput, duplicate_key: duplicateKey });
      continue;
    }

    const writable = buildWritableFields(table, normalizedInput, duplicateKey);
    if (!Object.keys(writable).length) {
      throw new Error('No matching writable fields found on the Vendor Costs Airtable table');
    }

    const res = await fetch(tableUrl(), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields: writable, typecast: true }),
    });
    const data = await res.json() as AirtableRecord & { error?: { message?: string } };

    if (!res.ok) {
      throw new Error(data.error?.message || `Airtable vendor cost create failed (${res.status})`);
    }

    const cost = mapRecord(data);
    created.push(cost);
    existingKeys.add(duplicateKey);
    existingLikelyCharges.add(likelySameChargeKey);
  }

  return { created, skipped };
}
