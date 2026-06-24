import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};

for (const line of envText.split(/\r?\n/)) {
  if (!line.startsWith('AIRTABLE_')) continue;
  const index = line.indexOf('=');
  if (index > 0) env[line.slice(0, index)] = line.slice(index + 1).trim();
}

const baseUrl = `https://api.airtable.com/v0/meta/bases/${env.AIRTABLE_BASE_ID}/tables/${env.AIRTABLE_JOBS_TABLE}/fields`;
const headers = {
  Authorization: `Bearer ${env.AIRTABLE_PAT}`,
  'Content-Type': 'application/json',
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

const schemaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${env.AIRTABLE_BASE_ID}/tables`, { headers });
const schema = await schemaResponse.json();

if (!schemaResponse.ok) {
  console.log(JSON.stringify({ ok: false, status: schemaResponse.status, error: schema.error }, null, 2));
  process.exit(1);
}

const table = schema.tables.find(item => item.id === env.AIRTABLE_JOBS_TABLE || item.name === env.AIRTABLE_JOBS_TABLE);
if (!table) {
  console.log(JSON.stringify({ ok: false, error: 'Production table not found' }, null, 2));
  process.exit(1);
}

const existing = new Set(table.fields.map(field => field.name));
const created = [];
const missing = [];

if (!existing.has(env.AIRTABLE_STAGE_FIELD || 'Dashboard Stage')) {
  const { response, data } = await request(baseUrl, {
    method: 'POST',
    body: JSON.stringify({
      name: env.AIRTABLE_STAGE_FIELD || 'Dashboard Stage',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'Pre-Production' },
          { name: 'Press Queue' },
          { name: 'NOW PRESSING' },
          { name: 'Quality Control' },
          { name: 'Sleeving' },
          { name: 'Assembly' },
          { name: 'Shipping' },
          { name: 'Completed' },
        ],
      },
    }),
  });
  if (response.ok) created.push(data.name);
  else missing.push({ name: env.AIRTABLE_STAGE_FIELD || 'Dashboard Stage', status: response.status, error: data.error });
}

if (!existing.has(env.AIRTABLE_ORDER_FIELD || 'Dashboard Order')) {
  const { response, data } = await request(baseUrl, {
    method: 'POST',
    body: JSON.stringify({
      name: env.AIRTABLE_ORDER_FIELD || 'Dashboard Order',
      type: 'number',
      options: { precision: 0 },
    }),
  });
  if (response.ok) created.push(data.name);
  else missing.push({ name: env.AIRTABLE_ORDER_FIELD || 'Dashboard Order', status: response.status, error: data.error });
}

if (!existing.has(env.AIRTABLE_RECORDS_PRESSED_FIELD || 'Records Pressed')) {
  const { response, data } = await request(baseUrl, {
    method: 'POST',
    body: JSON.stringify({
      name: env.AIRTABLE_RECORDS_PRESSED_FIELD || 'Records Pressed',
      type: 'number',
      options: { precision: 0 },
    }),
  });
  if (response.ok) created.push(data.name);
  else missing.push({ name: env.AIRTABLE_RECORDS_PRESSED_FIELD || 'Records Pressed', status: response.status, error: data.error });
}

if (!existing.has(env.AIRTABLE_RECORDS_PRESSED_BASELINE_AT_FIELD || 'Records Pressed Baseline At')) {
  const { response, data } = await request(baseUrl, {
    method: 'POST',
    body: JSON.stringify({
      name: env.AIRTABLE_RECORDS_PRESSED_BASELINE_AT_FIELD || 'Records Pressed Baseline At',
      type: 'dateTime',
      options: {
        dateFormat: { name: 'iso' },
        timeFormat: { name: '24hour' },
        timeZone: 'utc',
      },
    }),
  });
  if (response.ok) created.push(data.name);
  else missing.push({ name: env.AIRTABLE_RECORDS_PRESSED_BASELINE_AT_FIELD || 'Records Pressed Baseline At', status: response.status, error: data.error });
}

console.log(JSON.stringify({
  ok: missing.length === 0,
  created,
  alreadyPresent: [...existing].filter(name =>
    name === (env.AIRTABLE_STAGE_FIELD || 'Dashboard Stage')
    || name === (env.AIRTABLE_ORDER_FIELD || 'Dashboard Order')
    || name === (env.AIRTABLE_RECORDS_PRESSED_FIELD || 'Records Pressed')
    || name === (env.AIRTABLE_RECORDS_PRESSED_BASELINE_AT_FIELD || 'Records Pressed Baseline At')
  ),
  missing,
}, null, 2));
