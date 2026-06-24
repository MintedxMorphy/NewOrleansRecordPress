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
  customer: ['Customer', 'Customer Name', 'Client', 'Project', 'Project Name', 'Artist', 'Title', '1', 'Name', 'Silent EM'],
  matrix: ['Matrix', 'MATRIX', 'Matrix ID', 'Catalog Number', 'Catalog #', 'DSK-016'],
  quantity: ['Quantity', 'Qty', 'Units', 'Run Size', '52'],
  records_pressed: ['Records Pressed', 'Dashboard Records Pressed', 'Pressed Count', 'Records Pressed Total'],
  records_pressed_baseline_at: ['Records Pressed Baseline At', 'Records Pressed Set At', 'Pressed Baseline At'],
  colors: ['Colors', 'Color', 'Vinyl Color', 'Vinyl Colors', 'black'],
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

export type AirtableInventoryItem = {
  id: string;
  tableId: string;
  tableName: string;
  section: 'compound' | 'jackets' | 'inserts' | 'labels' | 'sleeves' | 'stampers' | 'testPresses';
  sectionTitle: string;
  item: string;
  artist: string;
  matrix: string;
  quantity: number;
  quantityLabel: string;
  unit: string;
  location: string;
  status: string;
  reorderPoint?: number;
  max?: number;
  notes: string;
  details?: string[];
  updatedAt: string;
};

export type AirtableInventoryDashboard = {
  source: 'airtable';
  pvcCapacityLbs: number;
  tables: Array<{ id: string; name: string; count: number }>;
  items: AirtableInventoryItem[];
  missingTables: string[];
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

function airtableRecordsPressedField() {
  return process.env.AIRTABLE_RECORDS_PRESSED_FIELD || 'Records Pressed';
}

function airtableRecordsPressedBaselineAtField() {
  return process.env.AIRTABLE_RECORDS_PRESSED_BASELINE_AT_FIELD || 'Records Pressed Baseline At';
}

function airtableInventoryTables() {
  return INVENTORY_SECTIONS.map(section => section.tableNames[0]);
}

const INVENTORY_SECTIONS = [
  { key: 'compound', title: 'Compound Inventory', tableNames: ['Compound Inventory'] },
  { key: 'jackets', title: 'Jackets', tableNames: ['Jackets, Inserts - Inventory', 'Jackets'] },
  { key: 'inserts', title: 'Inserts', tableNames: ['Jackets, Inserts - Inventory', 'Inserts'] },
  { key: 'labels', title: 'Center Lable', tableNames: ['Center Label Inventory', 'Center Lable', 'Center Label'] },
  {
    key: 'sleeves',
    title: 'Sleeves & Poly',
    tableNames: [
      'Sleeves & Poly-sleeve Inventory',
      'Sleeves & Poly-sleeves Inventory',
      'Sleeves and Poly-sleeve Inventory',
      'Sleeves and Poly-sleeves Inventory',
      'Sleeves & Poly',
      'Sleeves & Poly-sleeves',
      'Sleeves and Poly',
      'Sleeves Poly Inventory',
    ],
  },
  { key: 'stampers', title: 'Stamper Inventory', tableNames: ['Stamper Inventory', 'Stampers Inventory', 'Stampers'] },
  { key: 'testPresses', title: 'Test Press Inventory', tableNames: ['Test Press Inventory', 'Test Pressings Inventory', 'Test Presses'] },
] as const;

function inventorySections() {
  return INVENTORY_SECTIONS.map(section => ({ ...section }));
}

function normalizedInventoryTableName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveInventoryTable(
  tables: AirtableTableMeta[],
  section: ReturnType<typeof inventorySections>[number],
) {
  const exact = section.tableNames
    .map(nameOrId => resolveAirtableTable(tables, nameOrId))
    .find(Boolean);

  if (exact) return exact;

  const normalizedNames = section.tableNames.map(normalizedInventoryTableName);
  const fuzzyMatch = tables.find(table => {
    const normalizedTable = normalizedInventoryTableName(table.name);
    if (normalizedNames.some(name => normalizedTable.includes(name) || name.includes(normalizedTable))) return true;
    if (section.key === 'compound') return normalizedTable.includes('compound') && normalizedTable.includes('inventory');
    if (section.key === 'labels') return normalizedTable.includes('center') && normalizedTable.includes('label') && normalizedTable.includes('inventory');
    if (section.key === 'sleeves') return normalizedTable.includes('sleeve') && normalizedTable.includes('poly') && normalizedTable.includes('inventory');
    if (section.key === 'jackets' || section.key === 'inserts') return normalizedTable.includes('jacket') && normalizedTable.includes('insert') && normalizedTable.includes('inventory');
    if (section.key === 'stampers') return normalizedTable.includes('stamper') && normalizedTable.includes('inventory');
    if (section.key === 'testPresses') return normalizedTable.includes('test') && normalizedTable.includes('press') && normalizedTable.includes('inventory');
    return false;
  });

  return fuzzyMatch;
}

function airtablePvcCapacityLbs() {
  const parsed = Number(process.env.AIRTABLE_PVC_CAPACITY_LBS || '10000');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function airtableFetch(input: string, init?: RequestInit) {
  const delays = [450, 900, 1800, 3200];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const res = await fetch(input, init);
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt === delays.length) return res;

    const retryAfter = Number(res.headers.get('retry-after'));
    const retryDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delays[attempt];
    await sleep(retryDelay);
  }

  return fetch(input, init);
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

function parseQuantity(value: unknown) {
  const cleaned = stringValue(value).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function airtableValueForField(field: AirtableFieldMeta, value: number) {
  if (['number', 'currency', 'percent', 'rating', 'duration'].includes(field.type)) return value;
  return String(value);
}

function choiceForFieldValue(field: AirtableFieldMeta, value: unknown) {
  const raw = stringValue(value).trim();
  if (!raw) return undefined;

  const choices = field.options?.choices || [];
  if (!choices.length) return raw;

  return choices.find(choice => choiceKey(choice.name) === choiceKey(raw))?.name;
}

function sanitizedAirtableValueForField(field: AirtableFieldMeta, value: unknown): unknown {
  if (isEmptyAirtableValue(value)) return undefined;

  if (['number', 'currency', 'percent', 'rating', 'duration'].includes(field.type)) {
    const parsed = parseQuantity(value);
    return parsed === undefined ? undefined : parsed;
  }

  if (['date', 'dateTime'].includes(field.type)) {
    const raw = stringValue(value).trim();
    return isDateLike(raw) ? raw : undefined;
  }

  if (field.type === 'checkbox') {
    if (typeof value === 'boolean') return value;
    const normalized = stringValue(value).trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'done', 'complete', 'completed', 'approved'].includes(normalized)) return true;
    if (['no', 'n', 'false', '0'].includes(normalized)) return false;
    return undefined;
  }

  if (field.type === 'singleSelect') {
    return choiceForFieldValue(field, value);
  }

  if (field.type === 'multipleSelects') {
    const rawValues = Array.isArray(value)
      ? value.map(item => stringValue(item))
      : stringValue(value).split(',');
    const choices = rawValues
      .map(item => choiceForFieldValue(field, item))
      .filter((item): item is string => Boolean(item));

    return choices.length ? Array.from(new Set(choices)) : undefined;
  }

  if ([
    'multipleAttachments',
    'multipleCollaborators',
    'multipleRecordLinks',
  ].includes(field.type)) {
    return undefined;
  }

  if (Array.isArray(value)) return stringValue(value);
  if (typeof value === 'object') return stringValue(value);

  return value;
}

function runMarker(run: number, total: number) {
  return `[Run ${run}/${total}]`;
}

function stripRunMarkers(notes: unknown) {
  return stringValue(notes)
    .replace(/\[Run\s+\d+\s*\/\s*\d+\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripDashboardMarkers(notes: unknown) {
  return stripRunMarkers(notes)
    .replace(/\[Rush\s+Order\]/gi, '')
    .replace(/\[Stage\s+Span:[^\]]+\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function withRunMarker(notes: unknown, run: number, total: number) {
  const cleaned = stripRunMarkers(notes);
  return [runMarker(run, total), cleaned].filter(Boolean).join(cleaned ? '\n' : '');
}

function field(fields: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return stringValue(value);
  }
  return '';
}

function rawField(fields: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
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

function resolveAirtableStageValue(stage: string, tables: AirtableTableMeta[] = [], tableOverride?: AirtableTableMeta) {
  const fallback = stageForAirtable(stage);
  const table = tableOverride || resolveAirtableTable(tables, airtableJobsTable());
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

const COMPLETED_COPY_ALIAS_GROUPS = [
  FIELD_ALIASES.job_id,
  FIELD_ALIASES.customer,
  FIELD_ALIASES.matrix,
  FIELD_ALIASES.quantity,
  FIELD_ALIASES.colors,
  FIELD_ALIASES.weight,
  FIELD_ALIASES.speed,
  FIELD_ALIASES.ship_date,
  FIELD_ALIASES.order_number,
  FIELD_ALIASES.notes,
  FIELD_ALIASES.dash_notes,
  FIELD_ALIASES.due_note,
  FIELD_ALIASES.stage,
];

function isEmptyAirtableValue(value: unknown) {
  return value === null || value === undefined || value === '';
}

function isDateLike(value: unknown) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && !Number.isNaN(Date.parse(trimmed));
}

function isValueCompatibleWithField(field: AirtableFieldMeta, value: unknown) {
  return sanitizedAirtableValueForField(field, value) !== undefined;
}

function matchingSourceFieldForCompletedTarget(
  targetField: AirtableFieldMeta,
  production: AirtableTableMeta,
  record: AirtableRecord
) {
  const exact = production.fields.find(field => field.name.toLowerCase() === targetField.name.toLowerCase());
  if (exact && isValueCompatibleWithField(targetField, record.fields[exact.name])) return exact;

  for (const aliases of COMPLETED_COPY_ALIAS_GROUPS) {
    const targetIsInAliasGroup = aliases.some(alias => alias.toLowerCase() === targetField.name.toLowerCase());
    if (!targetIsInAliasGroup) continue;

    const source = resolveAirtableField(production, aliases);
    if (source && isValueCompatibleWithField(targetField, record.fields[source.name])) return source;
  }

  return undefined;
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
    records_pressed: field(fields, FIELD_ALIASES.records_pressed),
    records_pressed_baseline_at: field(fields, FIELD_ALIASES.records_pressed_baseline_at),
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

export async function getAirtableJobs(options: { syncCompleted?: boolean } = {}): Promise<(NORPJob & { airtable_record_id: string; dashboard_order: string })[]> {
  const jobs: (NORPJob & { airtable_record_id: string; dashboard_order: string })[] = [];
  const completedProductionRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  // Airtable is the dashboard source of truth at read time. Some upstream
  // Google Sheet/Drive inputs may still be manually copied into Airtable;
  // revisit this boundary if that sync becomes automated or bidirectional.
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    const view = process.env.AIRTABLE_JOBS_VIEW;
    if (view) params.set('view', view);
    if (offset) params.set('offset', offset);

    const res = await airtableFetch(`${tableUrl()}?${params.toString()}`, {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    const data = (await res.json()) as AirtableListResponse;

    if (!res.ok) {
      throw new Error(data.error?.message || `Airtable jobs request failed (${res.status})`);
    }

    for (const record of data.records || []) {
      const job = mapRecordToJob(record);
      if (!(job.customer || job.matrix || job.order_number)) continue;
      if (normalizeStage(job.stage) === 'completed') {
        completedProductionRecords.push(record);
        continue;
      }
      jobs.push(job);
    }
    offset = data.offset;
  } while (offset);

  if (options.syncCompleted && completedProductionRecords.length) {
    try {
      await syncCompletedAirtableRecords(completedProductionRecords);
    } catch (error) {
      console.error('[airtable] completed production row sync failed:', error);
    }
  }

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

  const res = await airtableFetch(`${tableUrl()}?${params.toString()}`, {
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
  const res = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
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
  const res = await airtableFetch(baseMetaUrl(), {
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

function completedFieldsFromRecord(record: AirtableRecord, production: AirtableTableMeta, completed: AirtableTableMeta) {
  const fields: Record<string, unknown> = {};

  for (const targetField of completed.fields) {
    if (!isWritableField(targetField)) continue;

    const sourceField = matchingSourceFieldForCompletedTarget(targetField, production, record);
    const value = sourceField ? record.fields[sourceField.name] : undefined;

    const sanitized = sanitizedAirtableValueForField(targetField, value);
    if (sanitized === undefined) continue;
    fields[targetField.name] = sanitized;
  }

  return fields;
}

function completedFallbackFields(fields: Record<string, unknown>, completed: AirtableTableMeta) {
  const fieldNames = new Set<string>();
  for (const aliases of [
    FIELD_ALIASES.job_id,
    FIELD_ALIASES.customer,
    FIELD_ALIASES.matrix,
    FIELD_ALIASES.quantity,
    FIELD_ALIASES.order_number,
    FIELD_ALIASES.notes,
    FIELD_ALIASES.dash_notes,
  ]) {
    const field = resolveAirtableField(completed, aliases);
    if (field) fieldNames.add(field.name);
  }

  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => fieldNames.has(key))
  );
}

async function createCompletedRecord(completed: AirtableTableMeta, fields: Record<string, unknown>) {
  const create = async (fieldsToCreate: Record<string, unknown>) => {
    const res = await airtableFetch(tableUrl('', completed.name), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields: fieldsToCreate, typecast: true }),
    });
    const created = await res.json() as { id?: string; error?: { message?: string } };
    return { res, created };
  };

  const firstAttempt = await create(fields);
  if (firstAttempt.res.ok) return firstAttempt.created;

  const fallbackFields = completedFallbackFields(fields, completed);
  if (Object.keys(fallbackFields).length && Object.keys(fallbackFields).length < Object.keys(fields).length) {
    const fallbackAttempt = await create(fallbackFields);
    if (fallbackAttempt.res.ok) return fallbackAttempt.created;
    throw new Error(
      fallbackAttempt.created.error?.message ||
      firstAttempt.created.error?.message ||
      `Airtable completed record create failed (${fallbackAttempt.res.status})`
    );
  }

  throw new Error(firstAttempt.created.error?.message || `Airtable completed record create failed (${firstAttempt.res.status})`);
}

function formulaField(fieldName: string) {
  return `{${fieldName.replace(/}/g, '\\}')}}`;
}

function formulaEquals(fieldName: string, value: string) {
  return `${formulaField(fieldName)}='${escapeFormulaValue(value)}'`;
}

async function findMatchingCompletedRecord(record: AirtableRecord, completed: AirtableTableMeta) {
  const matrix = field(record.fields, FIELD_ALIASES.matrix);
  const jobId = field(record.fields, FIELD_ALIASES.job_id);
  const orderNumber = field(record.fields, FIELD_ALIASES.order_number);
  const customer = field(record.fields, FIELD_ALIASES.customer);

  const matrixField = resolveAirtableField(completed, FIELD_ALIASES.matrix);
  const jobIdField = resolveAirtableField(completed, FIELD_ALIASES.job_id);
  const orderField = resolveAirtableField(completed, FIELD_ALIASES.order_number);
  const customerField = resolveAirtableField(completed, FIELD_ALIASES.customer);

  const formulas: string[] = [];
  if (matrix && matrixField) formulas.push(formulaEquals(matrixField.name, matrix));
  if (jobId && jobIdField && jobId !== matrix) formulas.push(formulaEquals(jobIdField.name, jobId));
  if (orderNumber && customer && orderField && customerField) {
    formulas.push(`AND(${formulaEquals(orderField.name, orderNumber)}, ${formulaEquals(customerField.name, customer)})`);
  }

  if (!formulas.length) return undefined;

  const filterByFormula = formulas.length === 1 ? formulas[0] : `OR(${formulas.join(', ')})`;
  const params = new URLSearchParams({
    maxRecords: '1',
    filterByFormula,
  });

  const res = await airtableFetch(`${tableUrl('', completed.name)}?${params.toString()}`, {
    headers: airtableHeaders(),
    cache: 'no-store',
  });
  const data = await res.json() as AirtableListResponse;

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable completed lookup failed (${res.status})`);
  }

  return data.records?.[0];
}

async function completeAirtableRecord(
  recordId: string,
  existingRecord?: AirtableRecord,
  existingTables?: AirtableTableMeta[],
) {
  const [record, tables] = await Promise.all([
    existingRecord ? Promise.resolve(existingRecord) : getAirtableRecord(recordId),
    existingTables ? Promise.resolve(existingTables) : getAirtableTablesMeta(),
  ]);

  const production = resolveAirtableTable(tables, airtableJobsTable());
  const completed = resolveAirtableTable(tables, airtableCompletedTable());

  if (!production) throw new Error(`Airtable table not found: ${airtableJobsTable()}`);
  if (!completed) throw new Error(`Airtable table not found: ${airtableCompletedTable()}`);

  const matchingCompleted = await findMatchingCompletedRecord(record, completed);
  if (matchingCompleted) {
    const productionQuantityField = resolveAirtableField(production, FIELD_ALIASES.quantity);
    const completedQuantityField = resolveAirtableField(completed, FIELD_ALIASES.quantity);
    const productionQuantity = productionQuantityField ? parseQuantity(record.fields[productionQuantityField.name]) : undefined;
    const completedQuantity = completedQuantityField ? parseQuantity(matchingCompleted.fields[completedQuantityField.name]) : undefined;

    if (
      productionQuantityField &&
      completedQuantityField &&
      productionQuantity !== undefined &&
      productionQuantity > 0 &&
      completedQuantity !== undefined &&
      completedQuantity >= 0
    ) {
      const mergedQuantity = productionQuantity + completedQuantity;
      const completedFieldsToUpdate: Record<string, unknown> = {
        [completedQuantityField.name]: airtableValueForField(completedQuantityField, mergedQuantity),
      };
      const completedDashNotesField = resolveAirtableField(completed, FIELD_ALIASES.dash_notes);
      if (completedDashNotesField && isWritableField(completedDashNotesField)) {
        completedFieldsToUpdate[completedDashNotesField.name] = stripDashboardMarkers(matchingCompleted.fields[completedDashNotesField.name]);
      }

      const updateCompletedRes = await airtableFetch(tableUrl(`/${encodeURIComponent(matchingCompleted.id)}`, completed.name), {
        method: 'PATCH',
        headers: airtableHeaders(),
        body: JSON.stringify({
          fields: completedFieldsToUpdate,
          typecast: true,
        }),
      });
      const updatedCompleted = await updateCompletedRes.json() as { error?: { message?: string } };

      if (!updateCompletedRes.ok) {
        throw new Error(updatedCompleted.error?.message || `Airtable completed quantity merge failed (${updateCompletedRes.status})`);
      }

      const deleteRes = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
        method: 'DELETE',
        headers: airtableHeaders(),
      });
      const deleted = await deleteRes.json() as { deleted?: boolean; error?: { message?: string } };

      if (!deleteRes.ok || !deleted.deleted) {
        throw new Error(deleted.error?.message || `Airtable production record delete failed (${deleteRes.status})`);
      }

      return {
        completedRecordId: matchingCompleted.id,
        deletedRecordId: recordId,
        mergedCompletedRecord: true,
        completedQuantity: mergedQuantity,
      };
    }
  }

  const fields = completedFieldsFromRecord(record, production, completed);
  const completedDashNotesField = resolveAirtableField(completed, FIELD_ALIASES.dash_notes);
  if (completedDashNotesField && fields[completedDashNotesField.name] !== undefined) {
    fields[completedDashNotesField.name] = stripDashboardMarkers(fields[completedDashNotesField.name]);
  }

  const created = await createCompletedRecord(completed, fields);

  const deleteRes = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
    method: 'DELETE',
    headers: airtableHeaders(),
  });
  const deleted = await deleteRes.json() as { deleted?: boolean; error?: { message?: string } };

  if (!deleteRes.ok || !deleted.deleted) {
    throw new Error(deleted.error?.message || `Airtable production record delete failed (${deleteRes.status})`);
  }

  return { completedRecordId: created.id, deletedRecordId: recordId };
}

async function syncCompletedAirtableRecords(records: AirtableRecord[]) {
  const tables = await getAirtableTablesMeta();

  for (const record of records) {
    try {
      await completeAirtableRecord(record.id, record, tables);
    } catch (error) {
      console.error('[airtable] completed production row sync failed:', record.id, error);
    }
  }
}

export async function completeAirtableJob(jobId: string) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);

  return completeAirtableRecord(recordId);
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

  const res = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
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
  input: { stage: string; quantity?: string; order?: number }
) {
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

  const quantityField = resolveAirtableField(production, FIELD_ALIASES.quantity);
  if (!quantityField) throw new Error('Airtable quantity field not found');
  const totalQuantity = parseQuantity(record.fields[quantityField.name]);
  const remainingQuantity = parseQuantity(input.quantity);
  if (!totalQuantity || totalQuantity <= 0) throw new Error('Current job quantity is not a number Airtable can split');
  if (!remainingQuantity || remainingQuantity <= 0) throw new Error('Enter the remaining quantity as a number');
  if (remainingQuantity >= totalQuantity) {
    throw new Error(`Remaining quantity must be less than total quantity (${totalQuantity})`);
  }
  const completedQuantity = totalQuantity - remainingQuantity;

  const completedFields = completedFieldsFromRecord(record, production, completed);
  const completedQuantityField = resolveAirtableField(completed, FIELD_ALIASES.quantity);
  if (completedQuantityField) {
    completedFields[completedQuantityField.name] = airtableValueForField(completedQuantityField, completedQuantity);
  }
  const completedDashNotesField = resolveAirtableField(completed, FIELD_ALIASES.dash_notes);
  const productionDashNotesField = resolveAirtableField(production, FIELD_ALIASES.dash_notes);
  const sourceDashNotes = productionDashNotesField ? record.fields[productionDashNotesField.name] : field(record.fields, FIELD_ALIASES.dash_notes);
  if (completedDashNotesField && isWritableField(completedDashNotesField)) {
    completedFields[completedDashNotesField.name] = withRunMarker(sourceDashNotes, 1, 2);
  }

  const completedRecord = await createCompletedRecord(completed, completedFields);

  const productionFields: Record<string, unknown> = {
    [quantityField.name]: airtableValueForField(quantityField, remainingQuantity),
  };
  const stageField = resolveAirtableField(production, [airtableStageField(), ...FIELD_ALIASES.stage]);
  if (stageField) productionFields[stageField.name] = resolveAirtableStageValue(input.stage, tables, production);

  const orderField = resolveAirtableField(production, [airtableOrderField(), 'Dashboard Order', 'Sort Order', 'Board Order']);
  if (orderField) productionFields[orderField.name] = typeof input.order === 'number' ? input.order : 999999;
  if (productionDashNotesField && isWritableField(productionDashNotesField)) {
    productionFields[productionDashNotesField.name] = withRunMarker(sourceDashNotes, 2, 2);
  }

  const updateProductionRes = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`, production.name), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: productionFields, typecast: true }),
  });
  const updatedProduction = await updateProductionRes.json() as (AirtableRecord & { error?: { message?: string } });

  if (!updateProductionRes.ok) {
    throw new Error(updatedProduction.error?.message || `Airtable production split update failed (${updateProductionRes.status})`);
  }

  return {
    job: mapRecordToJob(updatedProduction),
    completedRecordId: completedRecord.id,
    completedQuantity,
    remainingQuantity,
  };
}

export async function updateAirtableJobDashNotes(jobId: string, dashNotes: string) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);

  const res = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
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

export async function updateAirtableJobRecordsPressed(jobId: string, recordsPressed: number | null) {
  const recordId = await findAirtableRecordId(jobId);
  if (!recordId) throw new Error(`Airtable job not found: ${jobId}`);

  const tables = await getAirtableTablesMetaOrEmpty();
  const production = tables.find(table => table.id === airtableJobsTable() || table.name === airtableJobsTable());
  const recordsPressedField = production
    ? resolveAirtableField(production, [airtableRecordsPressedField(), ...FIELD_ALIASES.records_pressed])
    : undefined;
  const baselineAtField = production
    ? resolveAirtableField(production, [airtableRecordsPressedBaselineAtField(), ...FIELD_ALIASES.records_pressed_baseline_at])
    : undefined;

  if (!recordsPressedField) {
    throw new Error(`Airtable field not found: ${airtableRecordsPressedField()}. Add a number field with that name to the Jobs table.`);
  }

  const fields: Record<string, unknown> = {
    [recordsPressedField.name]: recordsPressed === null ? null : recordsPressed,
  };
  if (baselineAtField) {
    fields[baselineAtField.name] = recordsPressed === null ? null : new Date().toISOString();
  }

  const res = await airtableFetch(tableUrl(`/${encodeURIComponent(recordId)}`), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  });
  const data = await res.json() as { error?: { message?: string } };

  if (!res.ok) {
    throw new Error(data.error?.message || `Airtable records pressed update failed (${res.status})`);
  }

  return {
    records_pressed: recordsPressed === null ? '' : String(recordsPressed),
    records_pressed_baseline_at: recordsPressed === null
      ? ''
      : String(baselineAtField ? fields[baselineAtField.name] : new Date().toISOString()),
  };
}

const INVENTORY_FIELD_ALIASES = {
  item: ['Item', 'Material', 'Product', 'Product Name', 'Name', 'Description', 'SKU', 'Color', 'Type', 'Sleeve', 'Sleeve Type', 'Poly Sleeve', 'Poly-sleeve', 'Size', 'Stamper', 'Stamper ID', 'Test Press', 'Test Pressing'],
  artist: ['Artist', 'Customer', 'Customer Name', 'Client', 'Project', 'Project Name', 'Title'],
  matrix: ['Matrix', 'MATRIX', 'Matrix ID', 'Catalog Number', 'Catalog #', 'Job ID', 'Job Id', 'Order Number', 'ORDER NUMBER'],
  quantity: [
    'Current Inventory',
    'Current inventory',
    'Current',
    'Inventory',
    'Quantity',
    'Qty',
    'QTY',
    'On Hand',
    'On Hand Qty',
    'On Hand Quantity',
    'Stock',
    'Count',
    'Units',
    'Lbs',
    'Pounds',
    'Weight',
    'Quantity Info',
    'Qty Info',
    'Jacket Quantity',
    'Insert Quantity',
    'Label Quantity',
    'Record Quantity',
    'Run Size',
    'Amount',
    'quantity',
    'Qty On Hand',
    'Available',
    'Copies',
    'Sets',
    'Pairs',
  ],
  unit: ['Unit', 'UOM', 'Measure'],
  location: ['Location', 'location', 'Warehouse Location', 'Warehouse', 'Bin', 'Rack', 'Shelf', 'Zone', 'Aisle', 'Box 1', 'Box Number', 'Box'],
  status: ['Status', 'Inventory Status', 'Order Status'],
  onOrder: ['On Order', 'On order', 'Ordered', 'Incoming'],
  reorderPoint: ['Reorder Point', 'Reorder', 'Min', 'Minimum', 'Par', 'Low Stock'],
  max: ['Max', 'Maximum', 'Capacity', 'Target Stock'],
  notes: ['Notes', 'Note', 'Details', 'Comments'],
  updatedAt: ['Updated', 'Last Updated', 'Modified', 'Last Modified'],
  category: ['Category', 'Item Type', 'Material Type', 'Inventory Type'],
};

const COMPOUND_FIELD_ALIASES = {
  color: ['Color'],
  virgin: ['Virgin Compound (lbs)', 'Virgin Compound', 'Virgin lbs'],
  regrind: ['Regrind Compound (lbs)', 'Regrind Compound', 'Regrind lbs'],
  virginOnOrder: ['Virgin Compound On Order (lbs)', 'Virgin On Order', 'Virgin Ordered'],
  regrindOnOrder: ['Regrind On Order (lbs)', 'Regrind Compound On Order (lbs)', 'Regrind Ordered'],
};

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{10,}$/.test(value.trim());
}

function humanInventoryField(fields: Record<string, unknown>, aliases: string[]) {
  const raw = field(fields, aliases).trim();
  if (!raw || isAirtableRecordId(raw)) return '';

  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length && parts.every(isAirtableRecordId)) return '';

  return raw;
}

function normalizedMatrixKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function inventoryNumber(value: unknown) {
  const cleaned = stringValue(value).replace(/,/g, '').replace(/lbs?/gi, '').trim();
  if (!cleaned) return 0;
  const firstNumber = cleaned.match(/-?\d+(\.\d+)?/)?.[0] || '';
  const parsed = Number(firstNumber || cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inventoryQuantityLabel(value: unknown, unit: string) {
  const raw = stringValue(value).trim();
  if (!raw || isAirtableRecordId(raw)) return '';
  const numeric = inventoryNumber(value);
  if (numeric > 0) return unit ? `${numeric.toLocaleString()} ${unit}` : numeric.toLocaleString();
  return raw;
}

function normalizeInventoryUnit(value: unknown, tableName: string, item: string) {
  const explicit = stringValue(value).trim();
  if (explicit) return explicit;
  const text = `${tableName} ${item}`.toLowerCase();
  if (text.includes('pvc') || text.includes('compound')) return 'lbs';
  return '';
}

function jobReferenceFromRecord(record: AirtableRecord) {
  const artist = field(record.fields, FIELD_ALIASES.customer);
  const matrix = field(record.fields, FIELD_ALIASES.matrix) || field(record.fields, FIELD_ALIASES.job_id);
  return { artist, matrix };
}

function buildJobReferenceLookup(records: AirtableRecord[]) {
  const lookup = new Map<string, { artist: string; matrix: string }>();

  for (const record of records) {
    const reference = jobReferenceFromRecord(record);
    if (!reference.matrix) continue;
    const key = normalizedMatrixKey(reference.matrix);
    if (!key || lookup.has(key)) continue;
    lookup.set(key, reference);
  }

  return lookup;
}

function inventoryDisplayName(input: {
  item: string;
  artist: string;
  matrix: string;
  matched?: { artist: string; matrix: string };
}) {
  const artist = input.artist || input.matched?.artist || '';
  const matrix = input.matrix || input.matched?.matrix || '';
  if (artist && matrix) return `${artist} - ${matrix}`;
  if (artist) return artist;
  if (matrix) return matrix;
  if (input.item && !isAirtableRecordId(input.item)) return input.item;
  return 'Unlabeled inventory item';
}

function inventoryTypeText(fields: Record<string, unknown>) {
  return field(fields, ['Type', 'Category', 'Item Type', 'Inventory Type']).toLowerCase();
}

function inventoryRecordBelongsToSection(sectionKey: AirtableInventoryItem['section'], fields: Record<string, unknown>) {
  if (sectionKey === 'jackets') {
    const type = inventoryTypeText(fields);
    return !type || type.includes('jacket');
  }

  if (sectionKey === 'inserts') {
    const type = inventoryTypeText(fields);
    return type.includes('insert');
  }

  return true;
}

function inventoryDetails(fields: Record<string, unknown>, tableName: string) {
  const details = [
    field(fields, ['Type', 'Category', 'Item Type']),
  ];
  const onOrder = field(fields, INVENTORY_FIELD_ALIASES.onOrder);
  if (onOrder && onOrder !== '0') details.push(`On order: ${onOrder}`);

  return details.filter(Boolean);
}

function inventoryLocation(fields: Record<string, unknown>, tableName: string) {
  const location = field(fields, INVENTORY_FIELD_ALIASES.location);
  if (!location) return 'Unassigned';

  const tableText = tableName.toLowerCase();
  if ((tableText.includes('stamper') || tableText.includes('test press')) && /^\d+$/.test(location)) {
    return `Box ${location}`;
  }

  return location;
}

function compoundInventoryFields(fields: Record<string, unknown>) {
  const virgin = inventoryNumber(rawField(fields, COMPOUND_FIELD_ALIASES.virgin));
  const regrind = inventoryNumber(rawField(fields, COMPOUND_FIELD_ALIASES.regrind));
  const virginOnOrder = inventoryNumber(rawField(fields, COMPOUND_FIELD_ALIASES.virginOnOrder));
  const regrindOnOrder = inventoryNumber(rawField(fields, COMPOUND_FIELD_ALIASES.regrindOnOrder));
  return {
    color: humanInventoryField(fields, COMPOUND_FIELD_ALIASES.color) || 'Unlabeled compound',
    onHand: virgin + regrind,
    onOrder: virginOnOrder + regrindOnOrder,
    details: [
      `Virgin: ${virgin.toLocaleString()} lbs`,
      `Regrind: ${regrind.toLocaleString()} lbs`,
      `On order: ${(virginOnOrder + regrindOnOrder).toLocaleString()} lbs`,
    ],
  };
}

async function getAirtableRecordsForTable(table: AirtableTableMeta) {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);

    const res = await airtableFetch(`${tableUrl('', table.id)}?${params.toString()}`, {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    const data = await res.json() as AirtableListResponse;

    if (!res.ok) {
      throw new Error(data.error?.message || `Airtable inventory request failed for ${table.name} (${res.status})`);
    }

    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records;
}

export async function getAirtableInventoryDashboard(): Promise<AirtableInventoryDashboard> {
  const tables = await getAirtableTablesMeta();
  const configuredSections = inventorySections();
  const selectedSections = configuredSections.map(section => {
    const table = resolveInventoryTable(tables, section);
    return { ...section, table };
  });
  const foundSections = selectedSections.filter(section => section.table) as Array<typeof selectedSections[number] & { table: AirtableTableMeta }>;
  const missingTables = selectedSections
    .filter(section => !section.table)
    .map(section => section.title);
  const productionTable = resolveAirtableTable(tables, airtableJobsTable());
  const completedTable = resolveAirtableTable(tables, airtableCompletedTable());

  if (!foundSections.length) {
    throw new Error(`No Airtable inventory tables found. Expected: ${configuredSections.map(section => section.tableNames[0]).join(', ')}`);
  }

  // Airtable is the source of truth at page-load time. If warehouse staff still
  // update upstream Sheets and manually sync them into Airtable, this read layer
  // intentionally shows whatever Airtable currently contains.
  const [recordGroups, productionRefs, completedRefs] = await Promise.all([
    Promise.all(foundSections.map(async section => ({
      section,
      table: section.table,
      records: await getAirtableRecordsForTable(section.table),
    }))),
    productionTable ? getAirtableRecordsForTable(productionTable).catch(() => []) : Promise.resolve([]),
    completedTable ? getAirtableRecordsForTable(completedTable).catch(() => []) : Promise.resolve([]),
  ]);
  const jobLookup = buildJobReferenceLookup([...productionRefs, ...completedRefs]);

  const items = recordGroups.flatMap(({ section, table, records }) => records.filter(record =>
    inventoryRecordBelongsToSection(section.key, record.fields)
  ).map(record => {
    if (section.key === 'compound') {
      const compound = compoundInventoryFields(record.fields);
      const status = compound.onOrder > 0 ? `${compound.onOrder.toLocaleString()} lbs on order` : '';
      return {
        id: `${record.id}-${section.key}`,
        tableId: table.id,
        tableName: table.name,
        section: section.key,
        sectionTitle: section.title,
        item: compound.color,
        artist: '',
        matrix: '',
        quantity: compound.onHand,
        quantityLabel: `${compound.onHand.toLocaleString()} lbs`,
        unit: 'lbs',
        location: 'Compound Inventory',
        status,
        reorderPoint: parseQuantity(rawField(record.fields, INVENTORY_FIELD_ALIASES.reorderPoint)),
        max: parseQuantity(rawField(record.fields, INVENTORY_FIELD_ALIASES.max)),
        notes: field(record.fields, INVENTORY_FIELD_ALIASES.notes),
        details: compound.details,
        updatedAt: field(record.fields, INVENTORY_FIELD_ALIASES.updatedAt),
      };
    }

    const rawItem = humanInventoryField(record.fields, INVENTORY_FIELD_ALIASES.item);
    const matrix = humanInventoryField(record.fields, INVENTORY_FIELD_ALIASES.matrix);
    const matched = matrix ? jobLookup.get(normalizedMatrixKey(matrix)) : undefined;
    const artist = humanInventoryField(record.fields, INVENTORY_FIELD_ALIASES.artist) || matched?.artist || '';
    const item = inventoryDisplayName({ item: rawItem, artist, matrix, matched });
    const rawQuantity = rawField(record.fields, INVENTORY_FIELD_ALIASES.quantity);
    const unit = normalizeInventoryUnit(rawField(record.fields, INVENTORY_FIELD_ALIASES.unit), table.name, item);
    const quantityLabel = inventoryQuantityLabel(rawQuantity, unit);
    const quantity = quantityLabel ? inventoryNumber(rawQuantity) : 0;

    return {
      id: `${record.id}-${section.key}`,
      tableId: table.id,
      tableName: table.name,
      section: section.key,
      sectionTitle: section.title,
      item,
      artist,
      matrix: matrix || matched?.matrix || '',
      quantity,
      quantityLabel,
      unit,
      location: inventoryLocation(record.fields, table.name),
      status: field(record.fields, INVENTORY_FIELD_ALIASES.status),
      reorderPoint: parseQuantity(rawField(record.fields, INVENTORY_FIELD_ALIASES.reorderPoint)),
      max: parseQuantity(rawField(record.fields, INVENTORY_FIELD_ALIASES.max)),
      notes: field(record.fields, INVENTORY_FIELD_ALIASES.notes),
      details: inventoryDetails(record.fields, table.name),
      updatedAt: field(record.fields, INVENTORY_FIELD_ALIASES.updatedAt),
    };
  })).filter(item => item.item || item.quantity || item.location !== 'Unassigned');

  return {
    source: 'airtable',
    pvcCapacityLbs: airtablePvcCapacityLbs(),
    tables: recordGroups.map(({ table, records }) => ({ id: table.id, name: table.name, count: records.length })),
    items,
    missingTables,
  };
}
