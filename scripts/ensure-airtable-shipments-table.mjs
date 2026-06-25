import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};

for (const line of envText.split(/\r?\n/)) {
  if (!line.startsWith('AIRTABLE_')) continue;
  const index = line.indexOf('=');
  if (index > 0) env[line.slice(0, index)] = line.slice(index + 1).trim();
}

const baseId = env.AIRTABLE_BASE_ID;
const tableName = env.AIRTABLE_SHIPMENTS_TABLE || 'Shipments';
const headers = {
  Authorization: `Bearer ${env.AIRTABLE_PAT}`,
  'Content-Type': 'application/json',
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

const schemaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers });
const schema = await schemaResponse.json();

if (!schemaResponse.ok) {
  console.log(JSON.stringify({ ok: false, status: schemaResponse.status, error: schema.error }, null, 2));
  process.exit(1);
}

let table = schema.tables.find(item => item.name === tableName);
const createdFields = [];
const missing = [];

if (!table) {
  const createTable = await request(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    method: 'POST',
    body: JSON.stringify({
      name: tableName,
      description: 'Inbound supplies and outbound finished-goods shipments linked to production jobs by matrix/customer.',
      fields: [
        { name: 'Tracking Number', type: 'singleLineText' },
        {
          name: 'Direction',
          type: 'singleSelect',
          options: { choices: [{ name: 'Inbound' }, { name: 'Outbound' }] },
        },
        { name: 'Carrier', type: 'singleLineText' },
        { name: 'Status', type: 'singleLineText' },
        {
          name: 'Supply Type',
          type: 'singleSelect',
          options: {
            choices: [
              { name: 'PVC' },
              { name: 'Inner Sleeves' },
              { name: 'Jackets' },
              { name: 'Labels' },
              { name: 'Stampers' },
              { name: 'Finished Goods' },
              { name: 'Other' },
            ],
          },
        },
        { name: 'Matrix', type: 'singleLineText' },
        { name: 'Customer', type: 'singleLineText' },
        { name: 'Shipped Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'Est Delivery', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'Delivered Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
        { name: 'Total Cost', type: 'currency', options: { precision: 2, symbol: '$' } },
        { name: 'Notes', type: 'multilineText' },
      ],
    }),
  });

  if (!createTable.response.ok) {
    console.log(JSON.stringify({ ok: false, step: 'create_table', error: createTable.data.error }, null, 2));
    process.exit(1);
  }

  table = createTable.data;
}

const existing = new Set((table.fields || []).map(field => field.name));
const fieldUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;

const desiredFields = [
  ['Tracking Number', { name: 'Tracking Number', type: 'singleLineText' }],
  ['Direction', {
    name: 'Direction',
    type: 'singleSelect',
    options: { choices: [{ name: 'Inbound' }, { name: 'Outbound' }] },
  }],
  ['Carrier', { name: 'Carrier', type: 'singleLineText' }],
  ['Status', { name: 'Status', type: 'singleLineText' }],
  ['Supply Type', {
    name: 'Supply Type',
    type: 'singleSelect',
    options: {
      choices: [
        { name: 'PVC' },
        { name: 'Inner Sleeves' },
        { name: 'Jackets' },
        { name: 'Labels' },
        { name: 'Stampers' },
        { name: 'Finished Goods' },
        { name: 'Other' },
      ],
    },
  }],
  ['Matrix', { name: 'Matrix', type: 'singleLineText' }],
  ['Customer', { name: 'Customer', type: 'singleLineText' }],
  ['Shipped Date', { name: 'Shipped Date', type: 'date', options: { dateFormat: { name: 'iso' } } }],
  ['Est Delivery', { name: 'Est Delivery', type: 'date', options: { dateFormat: { name: 'iso' } } }],
  ['Delivered Date', { name: 'Delivered Date', type: 'date', options: { dateFormat: { name: 'iso' } } }],
  ['Total Cost', { name: 'Total Cost', type: 'currency', options: { precision: 2, symbol: '$' } }],
  ['Notes', { name: 'Notes', type: 'multilineText' }],
];

for (const [name, payload] of desiredFields) {
  if (existing.has(name)) continue;
  const { response, data } = await request(fieldUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (response.ok) createdFields.push(data.name);
  else missing.push({ name, status: response.status, error: data.error });
}

console.log(JSON.stringify({
  ok: missing.length === 0,
  table: table.name,
  tableId: table.id,
  createdFields,
  alreadyPresent: [...existing],
  missing,
}, null, 2));
