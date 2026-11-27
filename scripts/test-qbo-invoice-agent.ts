import { runInvoiceAgentBatch, verifyAgentSubmissions } from '../lib/qbo-invoice-agent';
import { resolveInvoicesWithQboGraph } from '../lib/qbo-invoice-resolver';
import {
  buildJobDossier,
  executeQboTool,
  preIndexCandidatesForJob,
  type QboCrawlContext,
} from '../lib/qbo-invoice-tools';
import {
  selectJobsForAgentCrawl,
  verdictsToPersistedLinks,
  type PersistedJobInvoiceLink,
} from '../lib/qbo-invoice-store';
import type { QboCustomer, QboEstimate, QboInvoice } from '../lib/qbo';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

const NOW = new Date('2026-11-27T16:00:00Z');

const customers: QboCustomer[] = [
  {
    id: 'cust-kevin',
    displayName: 'Kevin Calabro',
    companyName: 'Royal Potato Family',
    givenName: 'Kevin',
    familyName: 'Calabro',
    email: 'kevin@royalpotatofamily.com',
    notes: 'RPF catalog pressings',
    parentId: '',
  },
  {
    id: 'cust-brennan',
    displayName: 'Brennan Courtney',
    companyName: 'Paradise Sound',
    givenName: 'Brennan',
    familyName: 'Courtney',
    email: 'brennan@paradise.fm',
    notes: '',
    parentId: '',
  },
  {
    id: 'cust-gray',
    displayName: 'Gray Willoughby',
    companyName: 'Dawn Richard Management',
    givenName: 'Gray',
    familyName: 'Willoughby',
    email: 'gray@mgmt.com',
    notes: '',
    parentId: '',
  },
];

const estimates: QboEstimate[] = [
  {
    id: 'est-900',
    docNumber: 'EST-900',
    customerId: 'cust-brennan',
    customerName: 'Brennan Courtney',
    totalAmt: 3900,
    txnDate: '2026-09-10',
    txnStatus: 'Closed',
    memo: 'Paradise Radio - Infinite Mystery 300x 12" LP',
    lines: [{ description: 'Paradise Radio - Infinite Mystery 12" Vinyl Pressing', itemName: '12" Pressing', qty: 300, unitPrice: 13, amount: 3900 }],
    linkedTxnIds: [{ txnId: 'inv-paradise', txnType: 'Invoice' }],
    searchText: 'EST-900 Brennan Courtney Paradise Radio - Infinite Mystery 12" Vinyl Pressing qty 300',
  },
];

const invoices: QboInvoice[] = [
  {
    id: '23963',
    docNumber: '3535',
    customerId: 'cust-kevin',
    customerName: 'Kevin Calabro',
    customerCompany: 'Royal Potato Family',
    customerEmail: 'kevin@royalpotatofamily.com',
    customerNotes: 'RPF catalog pressings',
    totalAmt: 4827.85,
    balance: 0,
    amountPaid: 4827.85,
    txnDate: '2026-05-29',
    dueDate: '2026-06-28',
    memo: 'Mike Dillon - Mike and Beignet Go to the Zoo (RPF 2616)',
    privateNote: '500x 180g trans red',
    billEmail: 'kevin@royalpotatofamily.com',
    shipTo: 'Royal Potato Family, Brooklyn, NY',
    customFields: [{ name: 'Matrix', value: 'RPF 2616' }],
    lines: [{ description: '500x 12" 180g Trans Red - Mike Dillon Beignet RPF 2616', itemName: '12" Pressing', qty: 500, unitPrice: 9.65, amount: 4827.85 }],
    linkedTxnIds: [],
    searchText: '3535 Kevin Calabro Royal Potato Family RPF 2616 Mike Dillon Mike and Beignet Go to the Zoo 500x trans red',
  },
  {
    id: '14922',
    docNumber: '2579',
    customerId: 'cust-mike-old',
    customerName: 'Mike Dillon',
    customerCompany: '',
    customerEmail: '',
    customerNotes: '',
    totalAmt: 3537.4,
    balance: 0,
    amountPaid: 3537.4,
    txnDate: '2023-08-30',
    dueDate: '2023-09-30',
    memo: 'Mike Dillon old 2023 pressing',
    privateNote: '',
    billEmail: '',
    shipTo: '',
    customFields: [],
    lines: [{ description: 'Mike Dillon - Mike and Beignet RPF 2616 old', itemName: '12" Pressing', qty: 500, unitPrice: 7, amount: 3537.4 }],
    linkedTxnIds: [],
    searchText: '2579 Mike Dillon old 2023 pressing Mike and Beignet RPF 2616',
  },
  {
    id: 'inv-paradise',
    docNumber: '3705',
    customerId: 'cust-brennan',
    customerName: 'Brennan Courtney',
    customerCompany: 'Paradise Sound',
    customerEmail: 'brennan@paradise.fm',
    customerNotes: '',
    totalAmt: 3900,
    balance: 1950,
    amountPaid: 1950,
    txnDate: '2026-10-04',
    dueDate: '2026-11-04',
    memo: 'Per Estimate EST-900',
    privateNote: '',
    billEmail: 'brennan@paradise.fm',
    shipTo: '',
    customFields: [],
    lines: [{ description: '50% deposit for vinyl pressing', itemName: 'Pressing Deposit', qty: 300, unitPrice: 13, amount: 3900 }],
    linkedTxnIds: [{ txnId: 'est-900', txnType: 'Estimate' }],
    searchText: '3705 Brennan Courtney Paradise Sound Per Estimate EST-900 50% deposit qty 300',
  },
  {
    id: 'inv-dawn-1-dep',
    docNumber: '3613',
    customerId: 'cust-gray',
    customerName: 'Gray Willoughby',
    customerCompany: 'Dawn Richard Management',
    customerEmail: 'gray@mgmt.com',
    customerNotes: '',
    totalAmt: 2500,
    balance: 0,
    amountPaid: 2500,
    txnDate: '2026-08-06',
    dueDate: '2026-08-20',
    memo: 'Dawn Richard - Black Heart Deposit (DAWN-BLACK-LP)',
    privateNote: '',
    billEmail: 'gray@mgmt.com',
    shipTo: '',
    customFields: [],
    lines: [{ description: 'Deposit 50% - Dawn Richard Black Heart DAWN-BLACK-LP', itemName: '2LP Pressing', qty: 300, unitPrice: 8.33, amount: 2500 }],
    linkedTxnIds: [],
    searchText: '3613 Gray Willoughby Dawn Richard Black Heart DAWN-BLACK-LP Deposit',
  },
  {
    id: 'inv-dawn-1-fin',
    docNumber: '3710',
    customerId: 'cust-gray',
    customerName: 'Gray Willoughby',
    customerCompany: 'Dawn Richard Management',
    customerEmail: 'gray@mgmt.com',
    customerNotes: '',
    totalAmt: 2600,
    balance: 2600,
    amountPaid: 0,
    txnDate: '2026-11-12',
    dueDate: '2026-12-12',
    memo: 'Dawn Richard - Black Heart Final Balance (DAWN-BLACK-LP)',
    privateNote: '',
    billEmail: 'gray@mgmt.com',
    shipTo: '',
    customFields: [],
    lines: [{ description: 'Final balance - Dawn Richard Black Heart DAWN-BLACK-LP', itemName: '2LP Pressing', qty: 300, unitPrice: 8.67, amount: 2600 }],
    linkedTxnIds: [],
    searchText: '3710 Gray Willoughby Dawn Richard Black Heart DAWN-BLACK-LP Final balance',
  },
  {
    id: 'inv-dawn-2',
    docNumber: '3614',
    customerId: 'cust-gray',
    customerName: 'Gray Willoughby',
    customerCompany: 'Dawn Richard Management',
    customerEmail: 'gray@mgmt.com',
    customerNotes: '',
    totalAmt: 5000,
    balance: 0,
    amountPaid: 5000,
    txnDate: '2026-08-06',
    dueDate: '2026-08-20',
    memo: 'Dawn Richard - Goldenheart (DAWN-GOLD-LP)',
    privateNote: '',
    billEmail: 'gray@mgmt.com',
    shipTo: '',
    customFields: [],
    lines: [{ description: 'Dawn Richard Goldenheart DAWN-GOLD-LP', itemName: '2LP Pressing', qty: 300, unitPrice: 16.66, amount: 5000 }],
    linkedTxnIds: [],
    searchText: '3614 Gray Willoughby Dawn Richard Goldenheart DAWN-GOLD-LP',
  },
  {
    id: 'inv-artist-only',
    docNumber: '3720',
    customerId: 'cust-unmatched',
    customerName: 'Scott Satterwhite',
    customerCompany: '',
    customerEmail: '',
    customerNotes: '',
    totalAmt: 250,
    balance: 0,
    amountPaid: 250,
    txnDate: '2026-10-15',
    dueDate: '2026-10-30',
    memo: 'Misc shipping fee',
    privateNote: '',
    billEmail: '',
    shipTo: '',
    customFields: [],
    lines: [{ description: 'Shipping boxes', itemName: 'Shipping', qty: 5, unitPrice: 50, amount: 250 }],
    linkedTxnIds: [],
    searchText: '3720 Scott Satterwhite Misc shipping fee',
  },
];

const ctx: QboCrawlContext = { invoices, customers, estimates, now: NOW };

const dillonJob = {
  detail_key: 'recDillon',
  customer: 'Mike Dillon - Mike and Beignet go to the zoo',
  matrix: 'RPF 2616',
  job_id: 'RPF 2616',
  quantity: 500,
  colors: 'trans red',
  stage: 'assembly',
};
const paradiseJob = {
  detail_key: 'recParadise',
  customer: 'Paradise Radio - Infinite Mystery (Brennan Courtney)',
  matrix: 'TBC',
  quantity: 300,
  stage: 'pre_production',
};
const dawnBlackJob = {
  detail_key: 'recDawnBlack',
  customer: 'Dawn Richard - Black Heart **2LP - 300 sets**',
  matrix: 'DAWN-BLACK-LP',
  quantity: 300,
  stage: 'pre_production',
};
const dawnGoldJob = {
  detail_key: 'recDawnGold',
  customer: 'Dawn Richard - Goldenheart **2LP - 300 sets**',
  matrix: 'DAWN-GOLD-LP',
  quantity: 300,
  stage: 'pre_production',
};
const scottJob = {
  detail_key: 'recScott',
  customer: 'Scott Satterwhite',
  matrix: 'TBC',
  quantity: 500,
  stage: 'pre_production',
};

// 1. Test MCP-style QuickBooks tools
const custHit = executeQboTool(ctx, 'search_customers', { query: 'RPF' }) as { customers: Array<{ displayName: string; companyName?: string }> };
assert(custHit.customers.some(c => c.displayName === 'Kevin Calabro' && c.companyName === 'Royal Potato Family'), 'search_customers expands RPF acronym to Royal Potato Family (Kevin Calabro)');

const estHit = executeQboTool(ctx, 'search_estimates', { query: 'Infinite Mystery' }) as { estimates: Array<{ linkedInvoiceIds: string[] }> };
assert(estHit.estimates.length === 1 && estHit.estimates[0].linkedInvoiceIds[0] === 'inv-paradise', 'search_estimates bridges Infinite Mystery to its linked invoice');

const detailHit = executeQboTool(ctx, 'get_invoice_details', { invoice_id: 'inv-paradise' }) as { linkedEstimates: Array<{ docNumber: string }> };
assert(detailHit.linkedEstimates.length === 1 && detailHit.linkedEstimates[0].docNumber === 'EST-900', 'get_invoice_details includes linked estimate details');

const grayInvs = executeQboTool(ctx, 'list_customer_invoices', { customer_id: 'cust-gray' }) as { invoices: Array<{ docNumber: string }> };
assert(grayInvs.invoices.length === 3 && grayInvs.invoices[0].docNumber === '3710', 'list_customer_invoices returns all recent albums newest first');

const paradiseDossier = buildJobDossier(paradiseJob);
assert(paradiseDossier.contacts.includes('Brennan Courtney'), 'buildJobDossier extracts parenthetical contact Brennan Courtney');

const dillonLeads = preIndexCandidatesForJob(buildJobDossier(dillonJob), ctx);
assert(dillonLeads.some(lead => lead.id === '23963') && !dillonLeads.some(lead => lead.id === '14922'), 'warm pre-index surfaces May 2026 RPF 2616 and excludes 2023 invoice');

// 2. Test full multi-turn agent loop with simulated tool calls
async function main() {
  const ran = await runInvoiceAgentBatch(
    [dillonJob, paradiseJob, dawnBlackJob, dawnGoldJob, scottJob],
    ctx,
    {
      customRunner: async ({ executeTool }) => {
        // Simulate real multi-turn agent investigation using tools
        executeTool('search_customers', { query: 'RPF' });
        executeTool('get_invoice_details', { invoice_id: '23963' });
        executeTool('search_customers', { query: 'Brennan Courtney' });
        executeTool('get_invoice_details', { invoice_id: 'inv-paradise' });
        executeTool('list_customer_invoices', { customer_name: 'Gray Willoughby' });
        return {
          model: 'claude-sonnet-4-6',
          turns: 3,
          toolCalls: 6,
          submissions: [
            {
              job_key: 'recDillon',
              invoice_ids: ['23963', '14922'], // include old 2023 invoice to prove guardrail drops it!
              confidence: 'high',
              evidence: ['RPF 2616', 'Mike Dillon - Mike and Beignet Go to the Zoo'],
              reason: 'Matrix RPF 2616 and Mike Dillon Beignet on Royal Potato Family invoice',
            },
            {
              job_key: 'recParadise',
              invoice_ids: ['inv-paradise'],
              confidence: 'high',
              evidence: ['Brennan Courtney', 'Paradise Radio - Infinite Mystery'],
              reason: 'Linked estimate EST-900 confirms Paradise Radio Infinite Mystery for Brennan Courtney',
            },
            {
              job_key: 'recDawnBlack',
              invoice_ids: ['inv-dawn-1-dep', 'inv-dawn-1-fin'],
              confidence: 'high',
              evidence: ['DAWN-BLACK-LP', 'Dawn Richard Black Heart'],
              reason: 'Deposit + final balance invoices for DAWN-BLACK-LP',
            },
            {
              job_key: 'recDawnGold',
              invoice_ids: ['inv-dawn-2'],
              confidence: 'high',
              evidence: ['DAWN-GOLD-LP', 'Dawn Richard Goldenheart'],
              reason: 'Exact matrix DAWN-GOLD-LP for Goldenheart',
            },
            {
              job_key: 'recScott',
              invoice_ids: ['inv-artist-only'], // artist name only on $250 shipping fee -> guardrail MUST reject!
              confidence: 'high',
              evidence: ['Scott Satterwhite'],
              reason: 'Name matches',
            },
          ],
        };
      },
    },
  );

  assert(ran.ok && ran.model === 'claude-sonnet-4-6' && ran.turns === 3 && ran.toolCalls === 6, 'multi-turn agent loop tracks model, turns, and tool calls');
  const byKey = new Map(ran.verdicts.map(v => [v.jobKey, v]));

  const dillonVerdict = byKey.get('recDillon')!;
  assert(dillonVerdict.status === 'matched' && dillonVerdict.invoices.length === 1 && dillonVerdict.invoices[0].docNumber === '3535', 'Mike Dillon links to Royal Potato Family May 2026 #3535 and drops 2023 #2579');

  const paradiseVerdict = byKey.get('recParadise')!;
  assert(paradiseVerdict.status === 'matched' && paradiseVerdict.invoices[0].docNumber === '3705', 'Paradise Radio links via parenthetical contact + linked Estimate EST-900');

  const dawnBlackVerdict = byKey.get('recDawnBlack')!;
  assert(dawnBlackVerdict.status === 'matched' && dawnBlackVerdict.invoices.length === 2, 'Dawn Richard Black Heart keeps both deposit and final balance invoices');

  const dawnGoldVerdict = byKey.get('recDawnGold')!;
  assert(dawnGoldVerdict.status === 'matched' && dawnGoldVerdict.invoices[0].docNumber === '3614', 'Dawn Richard Goldenheart gets its own distinct invoice');

  const scottVerdict = byKey.get('recScott')!;
  assert(scottVerdict.status === 'unmatched' && scottVerdict.invoices.length === 0, 'artist-only misc shipping invoice without album/matrix/qty is rejected by guardrails');

  // 3. Test hallucination + medium confidence rejection
  const badChecks = verifyAgentSubmissions(
    [dillonJob],
    [{
      job_key: 'recDillon',
      invoice_ids: ['nonexistent-id'],
      confidence: 'high',
      evidence: ['RPF 2616'],
      reason: 'invented',
    }],
    ctx,
    'claude-sonnet-4-6',
  );
  assert(badChecks[0].status === 'unmatched', 'hallucinated invoice ID is rejected');

  const medChecks = verifyAgentSubmissions(
    [dillonJob],
    [{
      job_key: 'recDillon',
      invoice_ids: ['23963'],
      confidence: 'medium',
      evidence: ['RPF 2616'],
      reason: 'unsure',
    }],
    ctx,
    'claude-sonnet-4-6',
  );
  assert(medChecks[0].status === 'unmatched', 'medium confidence guess is not linked');

  // 4. Test durable crawl queue prioritization & staleness
  const persistedList = verdictsToPersistedLinks(
    [dillonJob, paradiseJob, dawnBlackJob, dawnGoldJob, scottJob],
    ran.verdicts,
    '2026-11-23',
    NOW,
  );
  const persistedMap = new Map<string, PersistedJobInvoiceLink>(persistedList.map(item => [item.jobKey, item]));

  // Nothing new on the board -> 0 pending (even if QBO date moves forward; only new jobs or manual resync run!)
  const steady = selectJobsForAgentCrawl([dillonJob, paradiseJob, scottJob], persistedMap, '2026-11-23', { now: NOW });
  assert(steady.totalPending === 0, 'already-crawled jobs are skipped when no new jobs are loaded');

  const stillSteady = selectJobsForAgentCrawl([dillonJob, paradiseJob, scottJob], persistedMap, '2026-11-27', { now: NOW });
  assert(stillSteady.totalPending === 0, 'existing checked jobs stay cached without re-running until manual resync or job change');

  // Brand-new job loaded into the production board queues immediately!
  const brandNewJob = { detail_key: 'recNew', customer: 'New Band - Debut', matrix: 'NEW-01' };
  const withNew = selectJobsForAgentCrawl([scottJob, brandNewJob], persistedMap, '2026-11-27', { now: NOW });
  assert(withNew.totalPending === 1 && withNew.batch[0].detail_key === 'recNew', 'newly loaded production board job is queued immediately');

  // Card signature update (e.g., matrix TBC -> real matrix) also triggers automatic check
  const scottUpdated = { ...scottJob, matrix: 'SS-2026' };
  const withSigChange = selectJobsForAgentCrawl([dillonJob, scottUpdated], persistedMap, '2026-11-27', { now: NOW });
  assert(withSigChange.totalPending === 1 && withSigChange.batch[0].detail_key === 'recScott', 'job whose matrix changed from TBC to a real code re-queues automatically');

  // Force single-job re-search works even on an already-matched job
  const forcedSingle = selectJobsForAgentCrawl([dillonJob, scottJob], persistedMap, '2026-11-23', { now: NOW, jobKey: 'recDillon', force: true });
  assert(forcedSingle.batch.length === 1 && forcedSingle.batch[0].detail_key === 'recDillon', 'forced single-job re-search targets that exact card');

  // 5. Test zero-credit QBO Graph Resolver end-to-end (no LLM API keys or credits required!)
  const califiaJob = { detail_key: 'recCalifia', customer: 'Califia Farms', matrix: 'TBC', quantity: 500, stage: 'pre_production' };
  const heatherJob = { detail_key: 'recHeather', customer: 'Heather Littlefield - Wildflowers **2 VARIANTS**', matrix: 'HL-005', quantity: 250, stage: 'pre_production' };
  const kenny1Job = { detail_key: 'recKenny1', customer: 'Kenny Sasaki & The Tiki Boys — Tiki Moon (Madison Mead)', matrix: 'AWR-019', quantity: 500, stage: 'pre_production' };
  const kenny2Job = { detail_key: 'recKenny2', customer: 'Kenny Sasaki & The Tiki Boys — Music for Tiki Bars (Madison Mead)', matrix: 'AWR-020', quantity: 500, stage: 'pre_production' };
  const oxfordJob = { detail_key: 'recOxford', customer: 'Oxford American NO Music', matrix: 'OA-003 (OA135)', quantity: 4000, stage: 'now_pressing' };
  const boJob = { detail_key: 'recBo', customer: 'Bo Dollis - My Name Is Bo - REPRESS', matrix: 'BD-02', quantity: 500, stage: 'pre_production' };

  const graphCustomers: QboCustomer[] = [
    ...customers,
    { id: 'cust-califia', displayName: 'Califia Farms', companyName: 'Califia Farms LLC', givenName: '', familyName: '', email: 'orders@califiafarms.com', notes: '', parentId: '' },
    { id: 'cust-heather', displayName: 'Heather Littlefield', companyName: '', givenName: 'Heather', familyName: 'Littlefield', email: 'heather@example.com', notes: '', parentId: '' },
    { id: 'cust-madison', displayName: 'Madison Mead', companyName: 'Aloha Wax Records', givenName: 'Madison', familyName: 'Mead', email: 'madison@alohawax.com', notes: '', parentId: '' },
  ];

  const graphInvoices: QboInvoice[] = [
    ...invoices,
    {
      id: 'inv-califia',
      docNumber: '3801',
      customerId: 'cust-califia',
      customerName: 'Califia Farms',
      customerCompany: 'Califia Farms LLC',
      customerEmail: 'orders@califiafarms.com',
      customerNotes: '',
      totalAmt: 4200,
      balance: 2100,
      amountPaid: 2100,
      txnDate: '2026-10-20',
      dueDate: '2026-11-20',
      memo: '12" Vinyl Pressing 500 pcs',
      privateNote: '',
      billEmail: 'orders@califiafarms.com',
      shipTo: '',
      customFields: [],
      lines: [{ description: '12" Custom Vinyl Pressing', itemName: 'Vinyl Pressing', qty: 500, unitPrice: 8.4, amount: 4200 }],
      linkedTxnIds: [],
      searchText: '3801 Califia Farms 12" Custom Vinyl Pressing qty 500',
    },
    {
      id: 'inv-heather',
      docNumber: '3802',
      customerId: 'cust-heather',
      customerName: 'Heather Littlefield',
      customerCompany: '',
      customerEmail: 'heather@example.com',
      customerNotes: '',
      totalAmt: 2650,
      balance: 0,
      amountPaid: 2650,
      txnDate: '2026-10-12',
      dueDate: '2026-10-27',
      memo: '50% pressing deposit',
      privateNote: '',
      billEmail: 'heather@example.com',
      shipTo: '',
      customFields: [],
      lines: [{ description: '12" Vinyl Pressing - 2 variants', itemName: 'Vinyl Pressing', qty: 250, unitPrice: 10.6, amount: 2650 }],
      linkedTxnIds: [],
      searchText: '3802 Heather Littlefield 12" Vinyl Pressing qty 250',
    },
    {
      id: 'inv-kenny-moon',
      docNumber: '3803',
      customerId: 'cust-madison',
      customerName: 'Madison Mead',
      customerCompany: 'Aloha Wax Records',
      customerEmail: 'madison@alohawax.com',
      customerNotes: '',
      totalAmt: 3100,
      balance: 0,
      amountPaid: 3100,
      txnDate: '2026-10-01',
      dueDate: '2026-10-16',
      memo: 'Tiki Moon pressing',
      privateNote: '',
      billEmail: 'madison@alohawax.com',
      shipTo: '',
      customFields: [],
      lines: [{ description: 'Kenny Sasaki Tiki Moon 500 LP', itemName: '12" LP Pressing', qty: 500, unitPrice: 6.2, amount: 3100 }],
      linkedTxnIds: [],
      searchText: '3803 Madison Mead Aloha Wax Records Kenny Sasaki Tiki Moon',
    },
    {
      id: 'inv-oxford',
      docNumber: '3804',
      customerId: 'cust-oxford',
      customerName: 'Oxford American',
      customerCompany: 'Oxford American',
      customerEmail: '',
      customerNotes: '',
      totalAmt: 14000,
      balance: 7000,
      amountPaid: 7000,
      txnDate: '2026-09-18',
      dueDate: '2026-10-18',
      memo: 'Issue OA135 pressing',
      privateNote: '',
      billEmail: '',
      shipTo: '',
      customFields: [],
      lines: [{ description: 'OA135 Vinyl Pressing', itemName: 'Vinyl Pressing', qty: 4000, unitPrice: 3.5, amount: 14000 }],
      linkedTxnIds: [],
      searchText: '3804 Oxford American OA135 Vinyl Pressing',
    },
    {
      id: 'inv-bo',
      docNumber: '3805',
      customerId: 'cust-bo',
      customerName: 'Wild Magnolias Music',
      customerCompany: '',
      customerEmail: '',
      customerNotes: '',
      totalAmt: 3400,
      balance: 0,
      amountPaid: 3400,
      txnDate: '2026-09-10',
      dueDate: '2026-09-25',
      memo: 'Matrix BD-02 repress',
      privateNote: '',
      billEmail: '',
      shipTo: '',
      customFields: [],
      lines: [{ description: 'BD-02 12" vinyl repress', itemName: 'Vinyl Pressing', qty: 500, unitPrice: 6.8, amount: 3400 }],
      linkedTxnIds: [],
      searchText: '3805 Wild Magnolias Music BD-02 12" vinyl repress',
    },
  ];

  const allGraphJobs = [
    dillonJob, paradiseJob, dawnBlackJob, dawnGoldJob, scottJob,
    califiaJob, heatherJob, kenny1Job, kenny2Job, oxfordJob, boJob,
  ];
  const graphResult = resolveInvoicesWithQboGraph(
    allGraphJobs,
    allGraphJobs,
    { invoices: graphInvoices, customers: graphCustomers, estimates, now: NOW },
  );
  assert(graphResult.ok && graphResult.provider === 'local-qbo-graph', 'zero-credit QBO graph resolver runs cleanly with zero API keys');
  const gByKey = new Map(graphResult.verdicts.map(v => [v.jobKey, v]));

  assert(gByKey.get('recDillon')?.invoices.length === 1 && gByKey.get('recDillon')?.invoices[0].docNumber === '3535', 'graph resolver links Mike Dillon to May 2026 #3535 and skips 2023 #2579');
  assert(gByKey.get('recParadise')?.invoices[0]?.docNumber === '3705', 'graph resolver links Paradise Radio via Brennan Courtney + Estimate EST-900');
  assert(gByKey.get('recDawnBlack')?.invoices.length === 2, 'graph resolver links both deposit and balance invoices for Dawn Richard Black Heart');
  assert(gByKey.get('recDawnGold')?.invoices.length === 1 && gByKey.get('recDawnGold')?.invoices[0].docNumber === '3614', 'graph resolver isolates Dawn Richard Goldenheart invoice');
  assert(gByKey.get('recScott')?.status === 'unmatched', 'graph resolver rejects $250 misc shipping fee for Scott Satterwhite');
  assert(gByKey.get('recCalifia')?.invoices[0]?.docNumber === '3801', 'graph resolver links single-entity pressing job Califia Farms');
  assert(gByKey.get('recHeather')?.invoices[0]?.docNumber === '3802', 'graph resolver links Heather Littlefield via unique artist + pressing qty 250');
  assert(gByKey.get('recKenny1')?.invoices[0]?.docNumber === '3803' && gByKey.get('recKenny2')?.status === 'unmatched', 'graph resolver assigns Tiki Moon to Kenny1 and does not leak it to Music for Tiki Bars');
  assert(gByKey.get('recOxford')?.invoices[0]?.docNumber === '3804', 'graph resolver matches parenthetical secondary matrix OA135 from OA-003 (OA135)');
  assert(gByKey.get('recBo')?.invoices[0]?.docNumber === '3805', 'graph resolver matches 4-character alphanumeric matrix BD-02');

  if (process.exitCode) process.exit(process.exitCode);
  console.log('qbo invoice agent tests passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
