import {
  completedFieldsFromProductionRecord,
  copyValueForCompletedField,
  fieldCreatePayload,
  writableFieldsMissingOnCompleted,
  type AirtableCopyField,
  type AirtableCopyTable,
} from '../lib/airtable-job-copy.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

function field(name: string, type: string, extra: Partial<AirtableCopyField> = {}): AirtableCopyField {
  return { id: `fld${name.replace(/\s+/g, '')}`, name, type, ...extra };
}

const production: AirtableCopyTable = {
  id: 'tblProduction',
  name: 'Production',
  fields: [
    field('Job ID', 'singleLineText'),
    field('Customer', 'singleLineText'),
    field('Matrix', 'singleLineText'),
    field('Quantity', 'number', { options: { precision: 0 } }),
    field('Lacquer', 'singleLineText'),
    field('Stampers', 'singleLineText'),
    field('Invoice Total', 'currency', { options: { precision: 2, symbol: '$' } }),
    field('Labels Arrived', 'checkbox', { options: { color: 'greenBright', icon: 'check' } }),
    field('Art', 'multipleAttachments'),
    field('Vendor', 'multipleRecordLinks', { options: { linkedTableId: 'tblVendors' } }),
    field('Owner', 'multipleCollaborators'),
    field('Formula Qty', 'formula'),
  ],
};

const matchingCompleted: AirtableCopyTable = {
  id: 'tblCompleted',
  name: 'Completed',
  fields: production.fields.map(item => ({ ...item, id: `${item.id}C` })),
};

const skinnyCompleted: AirtableCopyTable = {
  id: 'tblCompleted',
  name: 'Completed',
  fields: [
    field('Job ID', 'singleLineText'),
    field('Customer', 'singleLineText'),
    field('Matrix', 'singleLineText'),
    field('Quantity', 'number', { options: { precision: 0 } }),
    field('Order Number', 'singleLineText'),
    field('Notes', 'multilineText'),
    field('Dash Notes', 'multilineText'),
  ],
};

const record = {
  id: 'recJob',
  fields: {
    'Job ID': 'JOB-100',
    Customer: 'Sam and The Soul Machine',
    Matrix: '',
    Quantity: 500,
    Lacquer: 'ordered',
    Stampers: 'done',
    'Invoice Total': 4200,
    'Labels Arrived': true,
    Art: [{ id: 'att1', url: 'https://example.com/label.pdf', filename: 'label.pdf' }],
    Vendor: [{ id: 'recVendor', name: 'Finebilt' }],
    Owner: [{ id: 'usrGreg', email: 'greg@example.com', name: 'Greg' }],
    'Formula Qty': 500,
  },
};

const fullCopy = completedFieldsFromProductionRecord(record, production, matchingCompleted);
assert(fullCopy.dropped.length === 0, 'matching schemas copy without dropping valued fields');
assert(fullCopy.fields['Job ID'] === 'JOB-100', 'copies Job ID by exact name');
assert(fullCopy.fields.Customer === 'Sam and The Soul Machine', 'copies Customer by exact name');
assert(fullCopy.fields.Quantity === 500, 'copies Quantity as a number');
assert(fullCopy.fields.Lacquer === 'ordered', 'copies Lacquer, which the old 7-field fallback dropped');
assert(fullCopy.fields.Stampers === 'done', 'copies Stampers');
assert(fullCopy.fields['Invoice Total'] === 4200, 'copies Invoice Total');
assert(fullCopy.fields['Labels Arrived'] === true, 'copies checkbox true');
assert(
  JSON.stringify(fullCopy.fields.Art) === JSON.stringify([{ url: 'https://example.com/label.pdf', filename: 'label.pdf' }]),
  'copies attachments as url + filename',
);
assert(JSON.stringify(fullCopy.fields.Vendor) === JSON.stringify(['recVendor']), 'copies linked records as ids');
assert(JSON.stringify(fullCopy.fields.Owner) === JSON.stringify(['usrGreg']), 'copies collaborators as ids');
assert(!('Formula Qty' in fullCopy.fields), 'does not write formula values');
assert(fullCopy.fields.Matrix === undefined, 'does not invent a Matrix value from Job ID');

const lossy = completedFieldsFromProductionRecord(record, production, skinnyCompleted);
assert(
  lossy.dropped.some(item => item.name === 'Lacquer' && item.reason === 'missing on Completed'),
  'reports Lacquer as missing on a skinny Completed table',
);
assert(
  lossy.dropped.some(item => item.name === 'Art'),
  'reports attachments as dropped when Completed has no Art column',
);
assert(
  !lossy.dropped.some(item => item.name === 'Matrix'),
  'empty Matrix is not treated as data loss',
);
assert(lossy.fields['Job ID'] === 'JOB-100', 'still copies exact-name fields that exist on Completed');
assert(lossy.fields.Matrix === undefined, 'does not alias Job ID into Matrix');

const missing = writableFieldsMissingOnCompleted(production, skinnyCompleted).map(field => field.name);
assert(missing.includes('Lacquer'), 'schema diff includes Lacquer');
assert(missing.includes('Art'), 'schema diff includes Art');
assert(!missing.includes('Job ID'), 'schema diff omits fields Completed already has');
assert(!missing.includes('Formula Qty'), 'schema diff omits computed Production fields');

const selectPayload = fieldCreatePayload(field('Dashboard Stage', 'singleSelect', {
  options: {
    choices: [
      { id: 'sel1', name: 'Shipping', color: 'blueBright' },
      { id: 'sel2', name: 'Completed', color: 'greenBright' },
    ],
  },
}));
assert(selectPayload?.type === 'singleSelect', 'can create a matching single select');
assert(
  JSON.stringify(selectPayload?.options) === JSON.stringify({
    choices: [
      { name: 'Shipping', color: 'blueBright' },
      { name: 'Completed', color: 'greenBright' },
    ],
  }),
  'strips Airtable choice ids before creating Completed columns',
);

const linkPayload = fieldCreatePayload(field('Vendor', 'multipleRecordLinks', {
  options: { linkedTableId: 'tblVendors', inverseLinkFieldId: 'fldSkip' },
}));
assert(
  JSON.stringify(linkPayload?.options) === JSON.stringify({ linkedTableId: 'tblVendors' }),
  'creates linked fields with the same linked table and without inverse ids',
);

assert(fieldCreatePayload(field('Formula Qty', 'formula')) === null, 'does not try to create formula columns');
assert(
  copyValueForCompletedField(field('Notes', 'multilineText'), 'keep me') === 'keep me',
  'copies long text as-is',
);

if (process.exitCode) {
  console.error('airtable complete-copy tests failed');
} else {
  console.log('airtable complete-copy tests passed');
}
