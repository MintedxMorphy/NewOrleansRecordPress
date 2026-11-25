import { RECORDS_PER_WEEK } from '../lib/press-capacity.ts';
import {
  artistCoreFromCustomer,
  assignClientInvoices,
  buildJobPnl,
  clientInvoicesFromQbo,
  estimatePvcCompound,
  formatPvcRate,
  pvcPoundsForRecords,
  pvcRateForColor,
  quickBooksInvoiceUrl,
  quickBooksInvoicesForJob,
  quickBooksInvoicesFromJob,
  translucentPoundSplit,
  translucentPvcRate,
  SHOP_PAYROLL_BIWEEKLY,
  SHOP_PAYROLL_PER_RECORD,
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

assert(
  Math.abs(SHOP_PAYROLL_PER_RECORD - (SHOP_PAYROLL_BIWEEKLY / (RECORDS_PER_WEEK * 2))) < 0.000001,
  'shop payroll uses the board average of 4,000 records a week',
);

const payrollJob = buildJobPnl({
  quantity: 1000,
  colors: 'black',
  shipments: [{ total_cost: 250 }],
  invoice_total: 5000,
});
const payrollLine = payrollJob.costs.find(line => line.key === 'shop_payroll');
assert(Boolean(payrollLine), 'shop payroll is on the card');
assert(Math.abs((payrollLine?.amount || 0) - 1375) < 0.001, '1,000 records of shop payroll is $1,375');
assert(payrollLine?.detail.includes('4,000/week') === true, 'payroll detail uses 4,000 records a week');
assert(payrollJob.costs.every(line => line.key !== 'management' && line.key !== 'freight'), 'management salaries and freight are off the P&L');
assert(Math.abs(payrollJob.costTotal - (500 + 1375)) < 0.001, 'projected cost is PVC plus shop payroll only');
assert(payrollJob.grossProfit === 5000 - payrollJob.costTotal, 'gross profit ignores the shipment cost');

const blackPounds = pvcPoundsForRecords(1000);
assert(Math.abs(blackPounds - (1000 / 0.85 / 2)) < 0.000001, '1,000 records use a half pound each after 15% rejection');
assert(Math.round(blackPounds) === 588, '1,000 records round to 588 lbs');

const split = estimatePvcCompound({
  quantity: 1000,
  colors: 'Black (700) · Clear Splatter (300)',
  variants: [
    { colors: 'Black', quantity: '700' },
    { colors: 'Clear Splatter', quantity: '300' },
  ],
});
assert(split?.lines.length === 2, 'compound use is split by color');
assert(split?.lines[0].label === 'Black' && Math.round(split.lines[0].pounds) === 412, '700 black records use 412 lbs');
assert(split?.lines[1].label === 'Clear Splatter' && Math.round(split.lines[1].pounds) === 176, '300 clear splatter records use 176 lbs');
assert(Math.round(split.lines[0].pounds) + Math.round(split.lines[1].pounds) === 588, 'color pounds add up to the job');
assert(split.lines[0].cost === 350 && split.lines[1].cost === 225, 'compound cost stays on the ordered record count');

const transRate = translucentPvcRate();
assert(Math.abs(transRate - ((20 * 0.75 + 0.5) / 21)) < 0.000001, 'translucent compound is 20 parts clear and 1 part color');
assert(pvcRateForColor('black') === 0.5, 'solid black stays at $0.50');
assert(pvcRateForColor('Clear') === 0.75, 'clear stays at $0.75');
assert(pvcRateForColor('translucent red') === transRate, 'translucent red uses the clear-heavy mix');
assert(pvcRateForColor('Trans Red') === transRate, 'trans red uses the same mix');
assert(pvcRateForColor('translucent blue') === transRate, 'every translucent color uses the mix');
assert(formatPvcRate(transRate) === '$0.738 / record', 'the card shows the blended translucent rate');

const dillon = estimatePvcCompound({ quantity: 1000, colors: 'translucent red' });
const dillonLine = dillon?.lines[0];
assert(dillonLine?.colorant === 'red' && dillonLine.clearParts === 20 && dillonLine.colorParts === 1, 'translucent red names the color part');
assert(Math.abs((dillonLine?.cost || 0) - 1000 * transRate) < 0.001, 'translucent red cost follows the mix, not $0.50');
const dillonSplit = translucentPoundSplit(dillonLine?.pounds || 0);
assert(dillonSplit.clear === 560 && dillonSplit.color === 28 && dillonSplit.total === 588, '1,000 translucent records split into 560 lbs clear and 28 lbs red');

assert(quickBooksInvoiceUrl('145') === 'https://app.qbo.intuit.com/app/invoice?txnId=145', 'QuickBooks invoice link uses the invoice id');
assert(quickBooksInvoiceUrl('  ') === '', 'a blank invoice id does not make a link');
const linked = quickBooksInvoicesFromJob({
  pnl: {
    clientInvoices: [
      { id: '145', docNumber: '1042', customerName: 'Mike Dillon', totalAmt: 5000, balance: 0, amountPaid: 5000, txnDate: '2026-01-01', source: 'quickbooks' },
      { id: 'airtable-1', docNumber: '9', customerName: 'Someone', totalAmt: 10, balance: 0, amountPaid: 10, txnDate: '', source: 'airtable' },
    ],
  },
});
assert(linked.length === 1 && linked[0].id === '145' && linked[0].docNumber === '1042', 'only the matched QuickBooks invoice is linked');
assert(quickBooksInvoicesFromJob({}).length === 0, 'a job with no invoice match has no QuickBooks link');

const dillonInvoices = quickBooksInvoicesForJob({
  customer: 'Mike Dillon - Mike and Beignet go to the zoo',
  pnl: {
    clientInvoices: [
      { id: '23963', docNumber: '3535', customerName: 'Kevin Calabro', totalAmt: 4827.85, balance: 0, amountPaid: 4827.85, txnDate: '2026-05-29', source: 'quickbooks', matchReason: 'matrix / job ID on invoice · unique customer / artist · album title' },
      { id: '14922', docNumber: '2579', customerName: 'Mike Dillon', totalAmt: 3537.4, balance: 0, amountPaid: 3537.4, txnDate: '2023-08-30', source: 'quickbooks', matchReason: 'unique customer / artist · album / title words' },
      { id: '10140', docNumber: '2117', customerName: 'Kevin Calabro', totalAmt: 5579.85, balance: 0, amountPaid: 5579.85, txnDate: '2022-06-08', source: 'quickbooks', matchReason: 'unique customer / artist · album / title words' },
    ],
  },
});
assert(dillonInvoices.length === 1 && dillonInvoices[0].docNumber === '2579', 'Mike Dillon links to his invoice, not another customer');

if (process.exitCode) {
  console.error('job pnl matching tests failed');
  process.exit(1);
}
console.log('job pnl matching tests passed');
