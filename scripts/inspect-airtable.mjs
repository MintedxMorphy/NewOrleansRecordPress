import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};

for (const line of envText.split(/\r?\n/)) {
  if (!line.startsWith('AIRTABLE_')) continue;
  const index = line.indexOf('=');
  if (index > 0) env[line.slice(0, index)] = line.slice(index + 1).trim();
}

const response = await fetch(`https://api.airtable.com/v0/meta/bases/${env.AIRTABLE_BASE_ID}/tables`, {
  headers: { Authorization: `Bearer ${env.AIRTABLE_PAT}` },
});

const data = await response.json();

if (!response.ok) {
  console.log(JSON.stringify({
    ok: false,
    status: response.status,
    error: data.error,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  tableCount: data.tables.length,
  tables: data.tables.map((table) => ({
    id: table.id,
    name: table.name,
    fieldCount: table.fields.length,
    fields: table.fields.map((field) => ({
      name: field.name,
      type: field.type,
    })),
  })),
}, null, 2));
