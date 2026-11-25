import { assignClaims, assignClientInvoicesWithAi, buildInvoiceMatchRequest, claimsFromModelText } from '../lib/qbo-invoice-ai.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

const NOW = new Date('2026-11-25T00:00:00Z');
const dillon = {
  customer: 'Mike Dillon - Mike and Beignet go to the zoo',
  matrix: 'RPF 2616',
  job_id: 'RPF 2616',
};
const kevin = {
  id: '23963',
  docNumber: '3535',
  customerName: 'Kevin Calabro',
  totalAmt: 4827.85,
  balance: 0,
  amountPaid: 4827.85,
  txnDate: '2026-05-29',
  searchText: 'Kevin Calabro RPF total 2616 pressing',
};
const current = {
  id: '3801',
  docNumber: '3801',
  customerName: 'Mike Dillon',
  totalAmt: 4100,
  balance: 4100,
  amountPaid: 0,
  txnDate: '2026-09-12',
  searchText: 'Mike Dillon Beignet zoo RPF-2616',
};
const oldMike = {
  id: '14922',
  docNumber: '2579',
  customerName: 'Mike Dillon',
  totalAmt: 3537.4,
  balance: 0,
  amountPaid: 3537.4,
  txnDate: '2023-08-30',
  searchText: 'Mike Dillon Beignet zoo RPF 2616',
};

const invented = claimsFromModelText([dillon], [kevin, current], JSON.stringify({
  matches: [{
    jobKey: '0',
    invoiceId: '23963',
    confidence: 'high',
    evidence: ['RPF 2616', 'Mike Dillon', 'Beignet'],
  }],
}), 'gpt-5.5');
assert(invented.length === 0, 'a model quote that is not on the invoice is rejected');

const loose = claimsFromModelText([dillon], [kevin], JSON.stringify({
  matches: [{
    jobKey: '0',
    invoiceId: '23963',
    confidence: 'high',
    evidence: ['RPF total 2616'],
  }],
}), 'gpt-5.5');
assert(loose.length === 0, 'a split matrix number is not evidence');

const sure = claimsFromModelText([dillon], [current, kevin], JSON.stringify({
  matches: [{
    jobKey: '0',
    invoiceId: '3801',
    confidence: 'high',
    evidence: ['RPF-2616', 'Mike Dillon', 'Beignet zoo'],
  }, {
    jobKey: '0',
    invoiceId: '14922',
    confidence: 'high',
    evidence: ['RPF 2616', 'Mike Dillon', 'Beignet'],
  }],
}), 'gpt-5.5');
assert(sure.length === 1 && sure[0].invoice.id === '3801', 'only the invoice that was actually provided can match');
assert(sure[0].reason.includes('gpt-5.5') && sure[0].reason.includes('matrix ID') && sure[0].reason.includes('artist') && sure[0].reason.includes('album'), 'the card records the model and the clues');

const artistOnly = claimsFromModelText([dillon], [current], JSON.stringify({
  matches: [{ jobKey: '0', invoiceId: '3801', confidence: 'high', evidence: ['Mike Dillon'] }],
}), 'gpt-5.5');
assert(artistOnly.length === 0, 'the artist name alone is not enough');

const unsure = claimsFromModelText([dillon], [current], JSON.stringify({
  matches: [{ jobKey: '0', invoiceId: '3801', confidence: 'medium', evidence: ['RPF-2616', 'Beignet zoo', 'Mike Dillon'] }],
}), 'gpt-5.5');
assert(unsure.length === 0, 'a medium-confidence guess is not linked');

const sam = { customer: 'Sam and The Soul Machine - Made In Chicago', matrix: 'SAM-001', job_id: 'SAM-001' };
const other = { customer: 'Preservation Hall Jazz Band - Live', matrix: 'PH-9', job_id: 'PH-9' };
const shared = {
  id: 'sam-1',
  docNumber: '2003',
  customerName: 'Sam and The Soul Machine',
  totalAmt: 100,
  balance: 0,
  amountPaid: 100,
  txnDate: '2026-08-01',
  searchText: 'Sam and The Soul Machine Made In Chicago',
};
const both = claimsFromModelText([sam, other], [shared], JSON.stringify({
  matches: [
    { jobKey: '0', invoiceId: 'sam-1', confidence: 'high', evidence: ['Sam and The Soul Machine', 'Made In Chicago'] },
    { jobKey: '1', invoiceId: 'sam-1', confidence: 'high', evidence: ['Sam and The Soul Machine', 'Made In Chicago'] },
  ],
}), 'gpt-5.5');
const assigned = assignClaims(2, both);
assert(assigned[0].length === 1 && assigned[1].length === 0, 'one invoice goes to the job whose artist and album are both quoted');

const request = buildInvoiceMatchRequest([dillon], [current, kevin, oldMike]);
assert(request.system.includes('wrong link is worse'), 'the model is told a wrong link is worse than no link');
assert(request.user.includes('RPF 2616') && request.user.includes('3801'), 'the model sees the matrix and the invoice');

const linked = await assignClientInvoicesWithAi([dillon], [current, kevin, oldMike], {
  now: NOW,
  complete: async () => ({
    model: 'gpt-5.5',
    text: JSON.stringify({
      matches: [
        { jobKey: '0', invoiceId: '23963', confidence: 'high', evidence: ['RPF 2616', 'Mike Dillon', 'Beignet'] },
        { jobKey: '0', invoiceId: '3801', confidence: 'high', evidence: ['RPF-2616', 'Mike Dillon', 'Beignet zoo'] },
      ],
    }),
  }),
});
assert(linked.status === 'ready' && linked.model === 'gpt-5.5', 'the shop model runs the search');
assert(linked.assigned[0].length === 1 && linked.assigned[0][0].docNumber === '3801', 'Mike Dillon links to the invoice the model can prove');
assert(!linked.assigned[0].some(invoice => invoice.docNumber === '3535' || invoice.docNumber === '2579'), 'Kevin Calabro and the 2023 invoice stay unlinked');

const down = await assignClientInvoicesWithAi([dillon], [current], {
  now: NOW,
  complete: async () => {
    throw new Error('model down');
  },
});
assert(down.status === 'unavailable' && down.assigned[0].length === 0, 'a model failure links nothing');

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('qbo invoice model tests passed');
