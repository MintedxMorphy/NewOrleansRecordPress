export const PVC_COST_PER_RECORD = 0.5;
export const PVC_COST_PER_RECORD_CLEAR_SPLATTER = 0.75;
export const SHOP_PAYROLL_BIWEEKLY = 11000;
export const MANAGEMENT_SALARY_BIWEEKLY = 8300;
export const WORKING_DAYS_PER_PAY_PERIOD = 10;
export const RECORDS_PRESSED_PER_DAY = 350;

const BIWEEKLY_OUTPUT_RECORDS = RECORDS_PRESSED_PER_DAY * WORKING_DAYS_PER_PAY_PERIOD;
export const SHOP_PAYROLL_PER_RECORD = SHOP_PAYROLL_BIWEEKLY / BIWEEKLY_OUTPUT_RECORDS;
export const MANAGEMENT_SALARY_PER_RECORD = MANAGEMENT_SALARY_BIWEEKLY / BIWEEKLY_OUTPUT_RECORDS;

export type PvcEstimateLine = {
  label: string;
  quantity: number;
  rate: number;
  cost: number;
  premium: boolean;
};

export type PvcEstimate = {
  lines: PvcEstimateLine[];
  total: number;
  quantity: number;
};

export type ClientInvoiceMatch = {
  id: string;
  docNumber: string;
  customerName: string;
  totalAmt: number;
  balance: number;
  amountPaid: number;
  txnDate: string;
  source: 'quickbooks' | 'airtable';
};

export type JobPnlLine = {
  key: string;
  label: string;
  amount: number;
  detail: string;
  kind: 'cost' | 'revenue';
};

export type JobPnl = {
  quantity: number;
  pvc: PvcEstimate | null;
  vendorCosts: number;
  shopPayroll: number;
  managementSalaries: number;
  freight: number;
  costs: JobPnlLine[];
  costTotal: number;
  clientInvoice: number;
  clientInvoices: ClientInvoiceMatch[];
  clientInvoiceSource: 'quickbooks' | 'airtable' | 'none';
  grossProfit: number | null;
  marginPct: number | null;
};

type JobLike = Record<string, unknown>;

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(' ');
  return String(value).trim();
}

function numericValue(value: unknown) {
  const parsed = Number(stringValue(value).replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function jobRecords(value: unknown): JobLike[] {
  return Array.isArray(value)
    ? value.filter((item): item is JobLike => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function jobQuantity(job: JobLike) {
  for (const key of ['quantity', 'Quantity', 'Qty', 'Run Size']) {
    const amount = numericValue(job[key]);
    if (amount > 0) return amount;
  }
  return 0;
}

export function isClearOrSplatterColor(color: string) {
  const text = color.toLowerCase();
  return /\bsplatters?\b/.test(text)
    || /\bsplattered\b/.test(text)
    || /\bsplats?\b/.test(text)
    || /\bclears?\b/.test(text)
    || /\btransparent\b/.test(text);
}

export function pvcRateForColor(color: string) {
  return isClearOrSplatterColor(color) ? PVC_COST_PER_RECORD_CLEAR_SPLATTER : PVC_COST_PER_RECORD;
}

export function formatPvcRate(rate: number) {
  return `$${rate.toFixed(2)} / record`;
}

export function estimatePvcCompound(job: JobLike): PvcEstimate | null {
  const variants = jobRecords(job.variants);
  const lines: PvcEstimateLine[] = [];

  if (variants.length > 1) {
    for (const variant of variants) {
      const quantity = numericValue(variant.quantity);
      if (quantity <= 0) continue;
      const label = stringValue(variant.colors || variant.run_label) || 'Variant';
      const rate = pvcRateForColor(label);
      lines.push({
        label,
        quantity,
        rate,
        cost: quantity * rate,
        premium: rate === PVC_COST_PER_RECORD_CLEAR_SPLATTER,
      });
    }
  }

  if (!lines.length) {
    const quantity = jobQuantity(job);
    if (quantity <= 0) return null;
    const label = stringValue(job.colors || job.Colors || job.color || job.Color || job['Vinyl Color']) || 'Vinyl';
    const rate = pvcRateForColor(label);
    lines.push({
      label,
      quantity,
      rate,
      cost: quantity * rate,
      premium: rate === PVC_COST_PER_RECORD_CLEAR_SPLATTER,
    });
  }

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.cost, 0),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

function compact(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function jobMatchTokens(job: JobLike) {
  return [
    job.matrix,
    job.MATRIX,
    job.job_id,
    job['Job ID'],
    job.order_number,
    job['Order Number'],
    job['ORDER NUMBER'],
  ]
    .map(value => compact(stringValue(value)))
    .filter(token => token.length >= 4);
}

export function invoiceMatchesJob(job: JobLike, invoiceText: string, docNumber = '') {
  const order = compact(stringValue(job.order_number || job['Order Number'] || job['ORDER NUMBER']));
  const doc = compact(docNumber);
  if (order.length >= 4 && doc.length >= 4 && (order === doc || doc.includes(order) || order.includes(doc))) {
    return true;
  }

  const haystack = compact(invoiceText);
  if (haystack.length < 4) return false;
  return jobMatchTokens(job).some(token => {
    if (token.length < 4) return false;
    if (haystack.includes(token)) return true;
    return token.length >= 10 && token.includes(haystack);
  });
}

export function clientInvoicesFromQbo(
  job: JobLike,
  invoices: Array<{
    id: string;
    docNumber: string;
    customerName: string;
    totalAmt: number;
    balance: number;
    amountPaid: number;
    txnDate: string;
    searchText: string;
  }>,
): ClientInvoiceMatch[] {
  return invoices
    .filter(invoice => invoice.totalAmt > 0 && invoiceMatchesJob(job, invoice.searchText, invoice.docNumber))
    .map(invoice => ({
      id: invoice.id,
      docNumber: invoice.docNumber,
      customerName: invoice.customerName,
      totalAmt: invoice.totalAmt,
      balance: invoice.balance,
      amountPaid: invoice.amountPaid,
      txnDate: invoice.txnDate,
      source: 'quickbooks' as const,
    }));
}

function vendorCostTotal(job: JobLike) {
  const summary = job.vendor_cost_summary;
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    const total = numericValue((summary as { total?: unknown }).total);
    if (total) return total;
  }
  return numericValue(job.vendor_cost_total);
}

function freightTotal(job: JobLike) {
  const shipments = job.shipments;
  if (!Array.isArray(shipments)) return 0;
  return shipments.reduce((sum, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return sum;
    return sum + numericValue((item as { total_cost?: unknown }).total_cost);
  }, 0);
}

function airtableInvoiceTotal(job: JobLike) {
  return numericValue(
    job.invoice_total
    || job['Invoice Total']
    || job.client_invoice_total
    || job['Client Invoice']
    || job.total_price
    || job['Total Price']
    || job.quote_total
    || job['Quote Total'],
  );
}

export function buildJobPnl(job: JobLike, invoices: ClientInvoiceMatch[] = []): JobPnl {
  const pvc = estimatePvcCompound(job);
  const quantity = pvc?.quantity || jobQuantity(job);
  const vendorCosts = vendorCostTotal(job);
  const shopPayroll = quantity * SHOP_PAYROLL_PER_RECORD;
  const managementSalaries = quantity * MANAGEMENT_SALARY_PER_RECORD;
  const freight = freightTotal(job);

  const costs: JobPnlLine[] = [
    {
      key: 'pvc',
      label: 'PVC compound',
      amount: pvc?.total || 0,
      detail: pvc
        ? `${pvc.quantity.toLocaleString()} records · ${formatPvcRate(PVC_COST_PER_RECORD)} standard / ${formatPvcRate(PVC_COST_PER_RECORD_CLEAR_SPLATTER)} clear & splatter`
        : 'Need a quantity to estimate',
      kind: 'cost',
    },
    {
      key: 'vendor',
      label: 'Vendor costs',
      amount: vendorCosts,
      detail: vendorCosts ? 'Imported supplier invoices matched to this job' : 'No vendor invoices matched yet',
      kind: 'cost',
    },
    {
      key: 'shop_payroll',
      label: 'Shop payroll',
      amount: shopPayroll,
      detail: `$${SHOP_PAYROLL_BIWEEKLY.toLocaleString()} every 2 weeks ÷ ${BIWEEKLY_OUTPUT_RECORDS.toLocaleString()} records (${RECORDS_PRESSED_PER_DAY}/day × ${WORKING_DAYS_PER_PAY_PERIOD} workdays) = ${formatPvcRate(SHOP_PAYROLL_PER_RECORD)}`,
      kind: 'cost',
    },
    {
      key: 'management',
      label: 'Management salaries',
      amount: managementSalaries,
      detail: `$${MANAGEMENT_SALARY_BIWEEKLY.toLocaleString()} every 2 weeks ÷ ${BIWEEKLY_OUTPUT_RECORDS.toLocaleString()} records = ${formatPvcRate(MANAGEMENT_SALARY_PER_RECORD)}`,
      kind: 'cost',
    },
    {
      key: 'freight',
      label: 'Freight / tracking',
      amount: freight,
      detail: freight ? 'Known shipment costs on this job' : 'No shipment costs on the board yet',
      kind: 'cost',
    },
  ];

  const costTotal = costs.reduce((sum, line) => sum + line.amount, 0);
  const qboTotal = invoices.reduce((sum, invoice) => sum + invoice.totalAmt, 0);
  const airtableTotal = airtableInvoiceTotal(job);
  const clientInvoice = qboTotal || airtableTotal;
  const clientInvoiceSource = qboTotal ? 'quickbooks' : airtableTotal ? 'airtable' : 'none';
  const grossProfit = clientInvoice ? clientInvoice - costTotal : null;
  const marginPct = clientInvoice && grossProfit !== null ? (grossProfit / clientInvoice) * 100 : null;

  return {
    quantity,
    pvc,
    vendorCosts,
    shopPayroll,
    managementSalaries,
    freight,
    costs,
    costTotal,
    clientInvoice,
    clientInvoices: invoices,
    clientInvoiceSource,
    grossProfit,
    marginPct,
  };
}
