/**
 * One-time / idempotent backfill: copy Completed (legacy) values into the
 * matching Production-named fields when those fields are empty.
 *
 * Requires AIRTABLE_PAT, AIRTABLE_BASE_ID, AIRTABLE_COMPLETED_TABLE.
 * Does not delete records. Does not touch Production.
 */
const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

function token() {
  return process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
}

function baseId() {
  return process.env.AIRTABLE_BASE_ID;
}

function completedTable() {
  return process.env.AIRTABLE_COMPLETED_TABLE || 'Completed';
}

function empty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function parseQuantity(value) {
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function excelSerialFromIso(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - epoch) / 86400000);
}

export function weightFromLegacy(value) {
  if (empty(value)) return undefined;
  if (Array.isArray(value)) return value.length ? value.map(String) : undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const serial = excelSerialFromIso(raw);
    if (serial === 7) return ['7"'];
    if (serial != null && serial >= 70 && serial <= 220) return [`${serial}g`];
    return undefined;
  }
  if (/^\d+g$/.test(raw) || raw === '7"' || raw === "7\"") return [raw];
  return [raw];
}

export function dateOrderedFromLegacy(value) {
  if (empty(value)) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !Number.isNaN(Date.parse(raw))) {
    return new Date(raw).toISOString();
  }
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day)).toISOString();
    }
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return undefined;
}

export function fieldsToBackfill(fields) {
  const next = {};

  if (empty(fields.Quantity) && !empty(fields['Quantity (legacy)'])) {
    const qty = parseQuantity(fields['Quantity (legacy)']);
    if (qty !== undefined) next.Quantity = qty;
  }

  if (empty(fields['Quantity copy']) && !empty(fields['Quantity (legacy)'])) {
    next['Quantity copy'] = String(fields['Quantity (legacy)']).trim();
  }

  if (empty(fields.Colors) && !empty(fields['Colors (legacy)'])) {
    const color = Array.isArray(fields['Colors (legacy)'])
      ? fields['Colors (legacy)'].map(String)
      : [String(fields['Colors (legacy)']).trim()];
    if (color.filter(Boolean).length) next.Colors = color.filter(Boolean);
  }

  if (empty(fields.weight) && !empty(fields['weight (legacy)'])) {
    const weight = weightFromLegacy(fields['weight (legacy)']);
    if (weight) next.weight = weight;
  }

  if (empty(fields['DATE ORDERED']) && !empty(fields['DATE ORDERED (legacy)'])) {
    const ordered = dateOrderedFromLegacy(fields['DATE ORDERED (legacy)']);
    if (ordered) next['DATE ORDERED'] = ordered;
  }

  if (empty(fields.SPEED) && !empty(fields['SPEED (legacy)'])) {
    next.SPEED = String(fields['SPEED (legacy)']).trim();
  }

  if (empty(fields['UPS Shipments']) && !empty(fields['UPS Shipments (legacy)'])) {
    const shipments = parseQuantity(fields['UPS Shipments (legacy)']);
    if (shipments !== undefined) next['UPS Shipments'] = shipments;
  }

  if (empty(fields['Dashboard Order']) && !empty(fields['Dashboard Order (legacy)'])) {
    const order = parseQuantity(fields['Dashboard Order (legacy)']);
    if (order !== undefined) next['Dashboard Order'] = order;
  }

  return next;
}

async function airtableFetch(url, init) {
  const delays = [450, 900, 1800, 3200];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt === delays.length) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delays[attempt];
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  return fetch(url, init);
}

async function listRecords(table) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);
    const res = await airtableFetch(`${AIRTABLE_API_URL}/${encodeURIComponent(baseId())}/${encodeURIComponent(table)}?${params}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `List failed (${res.status})`);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

async function patchBatch(table, records) {
  const res = await airtableFetch(`${AIRTABLE_API_URL}/${encodeURIComponent(baseId())}/${encodeURIComponent(table)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records, typecast: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Patch failed (${res.status})`);
  return data;
}

const dryRun = process.argv.includes('--dry-run');

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('backfill-completed-legacy-fields.mjs')) {
  if (!token() || !baseId()) {
    console.error('Missing AIRTABLE_PAT or AIRTABLE_BASE_ID');
    process.exit(1);
  }

  const table = completedTable();
  const records = await listRecords(table);
  const updates = [];
  const fieldCounts = {};

  for (const record of records) {
    const fields = fieldsToBackfill(record.fields || {});
    if (!Object.keys(fields).length) continue;
    for (const key of Object.keys(fields)) fieldCounts[key] = (fieldCounts[key] || 0) + 1;
    updates.push({ id: record.id, fields });
  }

  console.log(JSON.stringify({
    dryRun,
    scanned: records.length,
    toUpdate: updates.length,
    fieldCounts,
  }, null, 2));

  if (dryRun || !updates.length) process.exit(0);

  let updated = 0;
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10);
    await patchBatch(table, chunk);
    updated += chunk.length;
    if (i + 10 < updates.length) await new Promise(resolve => setTimeout(resolve, 220));
  }

  console.log(JSON.stringify({ ok: true, updated }, null, 2));
}
