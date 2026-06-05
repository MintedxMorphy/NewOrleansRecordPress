import type { NORPJob } from './norp-sheet';

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

const STAGE_LABELS: Record<string, string> = {
  pre_production: 'Pre-Production',
  press_queue: 'Press Queue',
  now_pressing: 'Now Pressing',
  quality_control: 'Quality Control',
  sleeving: 'Sleeving',
  assembly: 'Assembly',
  shipping: 'Shipping',
  completed: 'Completed',
};

const FIELD_ALIASES: Record<string, string[]> = {
  job_id: ['Job ID', 'Job Id', 'JobID', 'ID', 'Matrix', 'MATRIX', 'Matrix ID', 'Order Number', 'ORDER NUMBER'],
  customer: ['Customer', 'Customer Name', 'Client', 'Project', 'Project Name', 'Artist', 'Title', '1'],
  matrix: ['Matrix', 'MATRIX', 'Matrix ID', 'Catalog Number', 'Catalog #'],
  quantity: ['Quantity', 'Qty', 'Units', 'Run Size'],
  colors: ['Colors', 'Color', 'Vinyl Color', 'Vinyl Colors'],
  weight: ['Weight', 'weight', 'Weight (g)', 'Vinyl Weight'],
  speed: ['Speed', 'RPM'],
  lacquer: ['Lacquer', 'Lacquer Ordered', 'Lacquer Date'],
  stampers: ['Stampers', 'Stampers Done', 'Plates', 'Plating'],
  test_pressings_sent: ['Test Pressings Sent', 'Test pressings', 'Sent?', 'TP Sent', 'TPs Sent'],
  test_pressings_approved: ['Test Pressings Approved', 'approved?', 'TP Approved', 'TPs Approved'],
  labels_arrived: ['Labels Arrived', 'center labels', 'arrived?', 'Labels'],
  sleeves_arrived: ['Sleeves Arrived', 'Inner sleeves', 'arrived? 2', 'Sleeves'],
  jackets_arrived: ['Jackets Arrived', 'Jackets', 'arrived? 3'],
  ship_date: ['Ship Date', 'SHIP DATE', 'Shipped Date', 'Date Shipped'],
  order_number: ['Order Number', 'ORDER NUMBER', 'Order #', 'Invoice Number'],
  deposit: ['Deposit', 'DEPOSIT? Y/N', 'Deposit Received'],
  notes: ['Notes', 'Production Notes', 'Project Notes'],
  dash_notes: ['Dash Notes', 'Dashboard Notes', 'dash notes'],
  due_note: ['Due Note', 'Due', 'Due Date', 'Target Date'],
  stage: ['Dashboard Stage', 'Stage', 'Status', 'Production Stage'],
};

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
  error?: { type?: string; message?: string };
};

type AirtableFieldMeta = {
  id: string;
  name: string;
  type: string;
  options?: {
    choices?: Array<{
      id?: string;
      name: string;
    }>;
  };
};

type AirtableTableMeta = {
  id: string;
  name: string;
  fields: AirtableFieldMeta[];
};

type AirtableMetaResponse = {
  tables?: AirtableTableMeta[];
  error?: { message?: string };
};

function airtableToken() {
  return process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
}

function airtableBaseId() {
  return process.env.AIRTABLE_BASE_ID;
}

function airtableJobsTable() {
  return process.env.AIRTABLE_JOBS_TABLE || 'Jobs';
}

function airtableCompletedTable() {
  return process.env.AIRTABLE_COMPLETED_TABLE || 'Completed';
}

function airtableStageField() {
  return process.env.AIRTABLE_STAGE_FIELD || 'Dashboard Stage';
}

function airtableOrderField() {
  return process.env.AIRTABLE_ORDER_FIELD || 'Dashboard Order';
}

function airtableJobIdField() {
  return process.env.AIRTABLE_JOB_ID_FIELD || 'Job ID';
}

function airtableDashNotesField() {
  return process.env.AIRTABLE_DASH_NOTES_FIELD || 'Dash Notes';
}

export function isAirtableConfigured() {
  return Boolean(airtableToken() && airtableBaseId() && airtableJobsTable());
}

function airtableHeaders() {
  const token = airtableToken();
  if (!token) throw new Error('Missing AIRTABLE_API_KEY, AIRTABLE_TOKEN, or AIRTABLE_PAT');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function tableUrl(path = '', table = airtableJobsTable()) {
  const baseId = airtableBaseId();
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

function field(fields: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return stringValue(value);
  }
  return '';
}

function hasValue(fields: Record<string, unknown>, aliases: string[]) {
  return Boolean(field(fields, aliases));
}

function isYes(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['no', 'n', 'false', '0'].includes(normalized)) return false;
  return ['yes', 'y', 'true', 'done', 'complete', 'completed', 'approved', 'sent', 'arrived', 'ordered', '1'].some(term =>
    normalized === term || normalized.startsWith(`${term} `)
  );
}

function isOrdered(value: string) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && (
    normalized.includes('ordered') ||
    normalized.includes('yes') ||
    normalized.includes('done') ||
    normalized.includes('complete')
  );
}

function isNo(value: string) {
  return ['no', 'n', 'false', 'none', 'not needed', 'n/a', 'na'].includes(value.trim().toLowerCase());
}

function readyForPressQueue(fields: Record<string, unknown>) {
  const lacquerOrdered = isOrdered(field(fields, FIELD_ALIASES.lacquer));
  const labelsOrdered = isOrdered(field(fields, ['ordered?', 'Center Labels Ordered', 'Labels Ordered']));
  const stampersOrdered = isOrdered(field(fields, FIELD_ALIASES.stampers));
  const jacketsOrdered = isOrdered(field(fields, ['ordered? 3', 'Jackets Ordered']));
  const miscPrint = field(fields, ['Misc print', 'Misc Print']);
  const miscPrintOrdered = isNo(miscPrint) || isOrdered(field(fields, ['ordered? 4', 'Misc Print Ordered']));

  return lacquerOrdered && labelsOrdered && stampersOrdered && jacketsOrdered && miscPrintOrdered;
}

function inferStage(fields: Record<string, unknown>) {
  const explicitStage = field(fields, FIELD_ALIASES.stage);
  if (explicitStage) return normalizeStage(explicitStage);

  const shipDate = field(fields, FIELD_ALIASES.ship_date);
  if (shipDate) return 'shipping';

  const jacketsArrived = field(fields, FIELD_ALIASES.jackets_arrived);
  const sleevesArrived = field(fields, FIELD_ALIASES.sleeves_arrived);
  const labelsArrived = field(fields, FIELD_ALIASES.labels_arrived);
  if (isYes(jacketsArrived) && isYes(sleevesArrived) && isYes(labelsArrived)) return 'assembly';
  if (isYes(sleevesArrived) || isYes(labelsArrived)) return 'sleeving';

  // Auto-placement uses Airtable's current production fields. Airtable is still
  // fed by staff-maintained upstream Sheets/Drive docs, so this readiness check
  // should be revisited if that upstream sync becomes automated.
  if (readyForPressQueue(fields)) return 'press_queue';

  const sent = field(fields, FIELD_ALIASES.test_pressings_sent);
  if (hasValue(fields, ['Test pressings']) || isYes(sent)) return 'quality_control';

  if (hasValue(fields, FIELD_ALIASES.stampers) || hasValue(fields, FIELD_ALIASES.lacquer)) return 'pre_production';

  const deposit = field(fields, FIELD_ALIASES.deposit);
  if (isYes(deposit)) return 'pre_production';

  return 'pre_production';
}

function normalizeStage(stage: string) {
  const value = stage.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (value === 'preproduction' || value === 'pre_prod' || value === 'quote' || value === 'deposit' || value === 'plates') return 'pre_production';
  if (value === 'press' || value === 'pressing' || value === 'now_pressing') return 'now_pressing';
  if (value === 'test_press' || value === 'test_presses' || value === 'test_pressings' || value === 'test_pressing' || value === 'approved') return 'press_queue';
  if (value === 'qc' || value === 'quality' || value === 'quality_control') return 'quality_control';
  if (value === 'sleeve' || value === 'sleeving') return 'sleeving';
  if (value === 'pack' || value === 'packing' || value === 'assembly') return 'assembly';
  if (value === 'ship' || value === 'shipped' || value === 'shipping') return 'shipping';
  if (value === 'paid' || value === 'paid_in_full' || value === 'complete' || value === 'completed') return 'completed';
  return value;
}

function stageForAirtable(stage: string) {
  const mode = process.env.AIRTABLE_STAGE_WRITE_MODE || 'label';
  if (mode === 'key') return stage;
  return STAGE_LABELS[stage] || stage;
}

function choiceKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveAirtableField(table: AirtableTableMeta, names: string[]) {
  return table.fields.find(field =>
    names.some(name => field.name.toLowerCase() === name.toLowerCase())
  );
}

function resolveAirtableStageValue(stage: string, tables: AirtableTableMeta[] = []) {
  const fallback = stageForAirtable(stage);
  const table = resolveAirtableTable(tables, airtableJobsTable());
  const stageField = table ? resolveAirtableField(table, [airtableStageField(), ...FIELD_ALIASES.stage]) : undefined;
  const choices = stageField?.options?.choices || [];
  const keys = new Set([
    choiceKey(stage),
    choiceKey(fallback),
    choiceKey(normalizeStage(stage)),
  ]);
  const exactChoice = choices.find(choice =>
    keys.has(choiceKey(choice.name)) || normalizeStage(choice.name) === normalizeStage(stage)
  );
  return exactChoice?.name || fallback;
}

async function getAirtableTablesMetaOrEmpty() {
  try {
    return await getAirtableTablesMeta();
  } catch {
    return [];
  }
}

function escapeFormulaValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function mapRecordToJob(record: AirtableRecord): NORPJob & { airtable_record_id: string; dashboard_order: string } {
  const fields = record.fields;
  const jobId =
    field(fields, FIELD_ALIASES.job_id) ||
    field(fields, FIELD_ALIASES.matrix) ||
    record.id;

  return {
    airtable_record_id: record.id,
    job_id: jobId,
    customer: field(fields, FIELD_ALIASES.customer),
    matrix: field(fields, FIELD_ALIASES.matrix),
    quantity: field(fields, FIELD_ALIASES.quantity),
    colors: field(fields, FIELD_ALIASES.colors),
    weight: field(fields, FIELD_ALIASES.weight),
    speed: field(fields, FIELD_ALIASES.speed),
    lacquer: field(fields, FIELD_ALIASES.lacquer),
    stampers: field(fields, FIELD_ALIASES.stampers),
    test_pressings_sent: field(fields, FIELD_ALIASES.test_pressings_sent),
    test_pressings_approved: field(fields, FIELD_ALIASES.test_pressings_approved),
    labels_arrived: field(fields, FIELD_ALIASES.labels_arrived),
    sleeves_arrived: field(fields, FIELD_ALIASES.sleeves_arrived),
    jackets_arrived: field(fields, FIELD_ALIASES.jackets_arrived),
    ship_date: field(fields, FIELD_ALIASES.ship_date),
    order_number: field(fields, FIELD_ALIASES.order_number),
    deposit: field(fields, FIELD_ALIASES.deposit),
    notes: field(fields, FIELD_ALIASES.notes),
    dash_notes: field(fields, FIELD_ALIASES.dash_notes),
    due_note: field(fields, FIELD_ALIASES.due_note),
    stage: inferStage(fields),
    stage_source: field(fields, FIELD_ALIASES.stage) ? 'airtable_dashboard_stage' : 'airtable_fields',
    dashboard_order: field(fields, ['Dashboard Order', 'Sort Order', 'Order', 'Board Order']),
  };
}

export async function getAirtableJobs(): Promise<(NORPJob & { airtable_record_id: string; dashboard_order: string })[]> {
  const jobs: (NORPJob & { airtable_record_id: string; dashboard_order: string })[] = [];
  let offset: string | undefined;

  // Airtable is the dashboard source of truth at read time. Some upstream
  // Google Sheet/Drive inputs may still be manually copied into Airtable;
  // revisit this boundary if that sync becomes automated or bidirectional.
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    const view = process.env.AIRTABLE_JOBS_VIEW;
    if (view) params.set('view', view);
    if (offset) params.set('offset', offset);

    const res = await fetch(`${tableUrl()}?${params.toString()}`, {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    const data = (await res.json()) as AirtableListResponse;

    if (!res.ok) {
      throw new Error(data.error?.message || `Airtable jobs request failed (${res.status})`);
    }

    for (const record of data.records || []) {
      const job = mapRecordToJob(record);
      if (job.customer || job.matrix || job.order_number) jobs.push(job);
    }
    offset = data.offset;
  } while (offset);

  return jobs;
}

async function findAirtableRecordId(jobId: string) {
  const recordIdPattern = /^rec[a-zA-Z0-9]{14,}$/;
  if (recordIdPattern.test(jobId)) return jobId;

  const fieldName = airtableJobIdField();
  const params = new URLSearchParams({
    maxRecords: '1',
    filterByFormula: `{${fieldName}}='${escapeFormulaValue(jobId)}'`,
  });

  const res = await fetch(`${tableUrl()}?${params.toString()}`, {
    headers: airtableHeaders(),
    cache: 'no-store',
  });
  const data = (await res.json()) as AirtableListResponse;

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable lookup failed (${res.status})`);
  }

  return data.records?.[0]?.id;
}

async function getAirtableRecord(recordId: string) {
  const res = await fetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
    headers: airtableHeaders(),
    cache: 'no-store',
  });
  const data = await res.json() as AirtableRecord & { error?: { message?: string } };

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable record lookup failed (${res.status})`);
  }

  return data;
}

async function getAirtableTablesMeta() {
  const res = await fetch(baseMetaUrl(), {
    headers: airtableHeaders(),
    cache: 'no-store',
  });
  const data = await res.json() as AirtableMetaResponse;

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable metadata lookup failed (${res.status})`);
  }

  return data.tables || [];
}

function isWritableField(field: AirtableFieldMeta) {
  return ![
    'aiText',
    'autoNumber',
    'button',
    'count',
    'createdBy',
    'createdTime',
    'externalSyncSource',
    'formula',
    'lastModifiedBy',
    'lastModifiedTime',
    'lookup',
    'multipleLookupValues',
    'rollup',
  ].includes(field.type);
}

function resolveAirtableTable(tables: AirtableTableMeta[], configuredTable: string) {
  return tables.find(table => table.id === configuredTable || table.name === configuredTable);
}

export async function completeAirtableJob(jobId: string) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);

  const [record, tables] = await Promise.all([
    getAirtableRecord(recordId),
    getAirtableTablesMeta(),
  ]);

  const production = resolveAirtableTable(tables, airtableJobsTable());
  const completed = resolveAirtableTable(tables, airtableCompletedTable());

  if (!production) throw new Error(`Airtable table not found: ${airtableJobsTable()}`);
  if (!completed) throw new Error(`Airtable table not found: ${airtableCompletedTable()}`);

  const fields: Record<string, unknown> = {};

  for (let index = 0; index < completed.fields.length; index += 1) {
    const targetField = completed.fields[index];
    if (!isWritableField(targetField)) continue;

    const sourceField =
      production.fields.find(field => field.name === targetField.name) ||
      production.fields[index];
    const value = sourceField ? record.fields[sourceField.name] : undefined;

    if (value === undefined) continue;
    fields[targetField.name] = value;
  }

  const createRes = await fetch(tableUrl('', completed.name), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  const created = await createRes.json() as { id?: string; error?: { message?: string } };

  if (!createRes.ok) {
    throw new Error(created.error?.message || `Airtable completed record create failed (${createRes.status})`);
  }

  const deleteRes = await fetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
    method: 'DELETE',
    headers: airtableHeaders(),
  });
  const deleted = await deleteRes.json() as { deleted?: boolean; error?: { message?: string } };

  if (!deleteRes.ok || !deleted.deleted) {
    throw new Error(deleted.error?.message || `Airtable production record delete failed (${deleteRes.status})`);
  }

  return { completedRecordId: created.id, deletedRecordId: recordId };
}

export async function updateAirtableJobStage(jobId: string, stage: string) {
  return updateAirtableJobPosition(jobId, stage);
}

export async function updateAirtableJobPosition(jobId: string, stage: string, order?: number) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);
  const tables = await getAirtableTablesMetaOrEmpty();

  const fields: Record<string, string | number> = {
    [airtableStageField()]: resolveAirtableStageValue(stage, tables),
  };
  if (typeof order === 'number') fields[airtableOrderField()] = order;

  const res = await fetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields,
    }),
  });
  const data = await res.json() as { error?: { message?: string } };

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable stage update failed (${res.status})`);
  }
}

export async function createAirtableJobSplit(
  jobId: string,
  input: { stage: string; quantity?: string; note?: string; order?: number }
) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);

  const [record, tables] = await Promise.all([
    getAirtableRecord(recordId),
    getAirtableTablesMeta(),
  ]);
  const production = resolveAirtableTable(tables, airtableJobsTable());
  if (!production) throw new Error(`Airtable table not found: ${airtableJobsTable()}`);

  const fields: Record<string, unknown> = {};
  for (const field of production.fields) {
    if (!isWritableField(field)) continue;
    const value = record.fields[field.name];
    if (value !== undefined) fields[field.name] = value;
  }

  const stageField = resolveAirtableField(production, [airtableStageField(), ...FIELD_ALIASES.stage]);
  if (stageField) fields[stageField.name] = resolveAirtableStageValue(input.stage, tables);

  const orderField = resolveAirtableField(production, [airtableOrderField(), 'Dashboard Order', 'Sort Order', 'Board Order']);
  if (orderField) fields[orderField.name] = typeof input.order === 'number' ? input.order : 999999;

  const quantityField = resolveAirtableField(production, FIELD_ALIASES.quantity);
  if (quantityField && input.quantity?.trim()) {
    const parsed = Number(input.quantity);
    fields[quantityField.name] = Number.isFinite(parsed) ? parsed : input.quantity.trim();
  }

  const dashNotesField = resolveAirtableField(production, [airtableDashNotesField(), ...FIELD_ALIASES.dash_notes]);
  if (dashNotesField) {
    const existingNotes = stringValue(record.fields[dashNotesField.name]);
    const customer = field(record.fields, FIELD_ALIASES.customer);
    const matrix = field(record.fields, FIELD_ALIASES.matrix);
    const source = [customer, matrix].filter(Boolean).join(' / ') || jobId;
    const note = input.note?.trim() || `Split from ${source}`;
    fields[dashNotesField.name] = [
      `[Split Batch] ${note}`,
      existingNotes ? `Original dash notes:\n${existingNotes}` : '',
    ].filter(Boolean).join('\n\n');
  }

  const res = await fetch(tableUrl('', production.name), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  });
  const created = await res.json() as (AirtableRecord & { error?: { message?: string } });

  if (!res.ok) {
    throw new Error(created.error?.message || `Airtable split record create failed (${res.status})`);
  }

  return mapRecordToJob(created);
}

export async function updateAirtableJobDashNotes(jobId: string, dashNotes: string) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);

  const res = await fetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        [airtableDashNotesField()]: dashNotes,
      },
    }),
  });
  const data = await res.json() as { error?: { message?: string } };

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable dash notes update failed (${res.status})`);
  }
}
