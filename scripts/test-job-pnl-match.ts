import {
  artistCoreFromCustomer,
  assignClientInvoices,
  clientInvoicesFromQbo,
  titleCoreFromCustomer,
} from '../lib/job-pnl.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

assert(artistCoreFromCustomer('Sam and The Soul Machine - Made In Chicago') === 'sam soul machine', 'artist core from Artist - Album');
assert(titleCoreFromCustomer('Sam and The Soul Machine - Made In Chicago') === 'made chicago', 'title core drops stopwords');
assert(artistCoreFromCustomer('Sam & The Soul Machine') === 'sam soul machine', '& normalizes to the same artist core');

const samJob = {
  job_id: 'SAM-001',
  customer: 'Sam and The Soul Machine - Made In Chicago',
  stage: 'now_pressing',
  quantity: 300,
};

const otherJob = {
  job_id: 'OTHER-009',
  customer: 'Preservation Hall Jazz Band - Live',
  stage: 'press_queue',
  quantity: 500,
};

const samInvoice = {
  id: 'inv-sam',
  docNumber: '1042',
  customerName: 'Sam & The Soul Machine',
  totalAmt: 4200,
  balance: 0,
  amountPaid: 4200,
  txnDate: '2026-08-01',
  searchText: '1042 Sam & The Soul Machine Made In Chicago vinyl pressing',
};

const assigned = assignClientInvoices([samJob, otherJob], [samInvoice]);
assert(assigned[0].length === 1 && assigned[0][0].id === 'inv-sam', 'Sam invoice attaches to Sam job without a matrix ID');
assert(assigned[1].length === 0, 'Sam invoice does not attach to an unrelated artist');
assert(Boolean(assigned[0][0].matchReason), 'match includes a reason');

const noMatrix = clientInvoicesFromQbo(
  { customer: 'Sam and The Soul Machine - Made In Chicago', stage: 'now_pressing' },
  [samInvoice],
);
assert(noMatrix.length === 1, 'single-job helper matches on artist/album only');

const oldMatcherWouldMiss = clientInvoicesFromQbo(
  { customer: 'Sam and The Soul Machine - Made In Chicago', matrix: '', job_id: 'x', order_number: '' },
  [{
    ...samInvoice,
    docNumber: 'Q-99',
    searchText: 'Q-99 Sam & The Soul Machine',
  }],
);
assert(oldMatcherWouldMiss.length === 1, '& vs and still matches the QBO customer name');

const twoSamJobs = assignClientInvoices(
  [
    { customer: 'Sam and The Soul Machine - Made In Chicago', stage: 'now_pressing' },
    { customer: 'Sam and The Soul Machine - Night Train', stage: 'press_queue' },
  ],
  [{
    id: 'inv-ambiguous',
    docNumber: '2001',
    customerName: 'Sam and The Soul Machine',
    totalAmt: 1000,
    balance: 0,
    amountPaid: 1000,
    txnDate: '2026-07-01',
    searchText: '2001 Sam and The Soul Machine',
  }],
);
assert(twoSamJobs[0].length === 0 && twoSamJobs[1].length === 0, 'same artist + two active albums stays unmatched without a title/matrix');

const titled = assignClientInvoices(
  [
    { customer: 'Sam and The Soul Machine - Made In Chicago', stage: 'now_pressing' },
    { customer: 'Sam and The Soul Machine - Night Train', stage: 'press_queue' },
  ],
  [{
    id: 'inv-chicago',
    docNumber: '2002',
    customerName: 'Sam and The Soul Machine',
    totalAmt: 1000,
    balance: 0,
    amountPaid: 1000,
    txnDate: '2026-07-01',
    searchText: '2002 Sam and The Soul Machine Made In Chicago 300 LP',
  }],
);
assert(titled[0].length === 1 && titled[1].length === 0, 'album title disambiguates two jobs for the same artist');

const activeVsCompleted = assignClientInvoices(
  [
    { customer: 'Sam and The Soul Machine - Made In Chicago', stage: 'now_pressing' },
    { customer: 'Sam and The Soul Machine - Old Record', stage: 'completed' },
  ],
  [{
    id: 'inv-active',
    docNumber: '2003',
    customerName: 'Sam and The Soul Machine',
    totalAmt: 800,
    balance: 100,
    amountPaid: 700,
    txnDate: '2026-08-10',
    searchText: '2003 Sam and The Soul Machine',
  }],
);
assert(activeVsCompleted[0].length === 1 && activeVsCompleted[1].length === 0, 'unique active artist wins over completed jobs for the same name');

const matrixWins = assignClientInvoices(
  [
    { customer: 'Random Client', matrix: 'NORP-4411', stage: 'pre_production' },
    { customer: 'Other Client', stage: 'press_queue' },
  ],
  [{
    id: 'inv-matrix',
    docNumber: '55',
    customerName: 'Some Label',
    totalAmt: 2500,
    balance: 2500,
    amountPaid: 0,
    txnDate: '2026-06-01',
    searchText: '55 Some Label NORP-4411 jackets',
  }],
);
assert(matrixWins[0].length === 1, 'matrix ID on the invoice still matches');

const oneInvoiceTwoJobs = assignClientInvoices(
  [
    { customer: 'Unrelated Label', matrix: 'SAMSOUL99', stage: 'pre_production' },
    { customer: 'Sam and The Soul Machine - Made In Chicago', stage: 'now_pressing' },
  ],
  [{
    ...samInvoice,
    searchText: '1042 Sam & The Soul Machine Made In Chicago SAMSOUL99',
  }],
);
const attached = oneInvoiceTwoJobs.flat();
assert(attached.length === 1 && attached[0].id === 'inv-sam', 'each invoice is assigned to at most one job');

if (process.exitCode) {
  console.error('job pnl matching tests failed');
  process.exit(1);
}
console.log('job pnl matching tests passed');
