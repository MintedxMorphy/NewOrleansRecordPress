import { getAirtableJobs, isAirtableConfigured } from '@/lib/airtable';
import { getNORPJobs } from '@/lib/norp-sheet';
import { getShipmentAiApiKey, getShipmentAiModel } from '@/lib/shipment-ai-config';

const MAX_JOB_CONTEXT = 700;

type ProductionJob = Record<string, unknown>;

export type VendorInvoiceMatchedJob = {
  record_id?: string;
  job_id?: string;
  matrix?: string;
  customer?: string;
  order_number?: string;
};

export type VendorInvoiceLineItem = {
  id: string;
  description: string;
  matrix: string;
  category: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  confidence: string;
  raw_line: string;
  matched_job?: VendorInvoiceMatchedJob | null;
  skipped?: boolean;
};

export type VendorInvoiceParseResult = {
  invoice: {
    invoice_number: string;
    vendor: string;
    invoice_date: string;
    total: number;
    source_file: string;
  };
  line_items: VendorInvoiceLineItem[];
  matches: {
    matched: number;
    unmatched: number;
  };
  text_excerpt: string;
};

type JobContext = Required<VendorInvoiceMatchedJob>;

type AiLineItem = {
  description?: string;
  matrix?: string;
  category?: string;
  quantity?: number | string;
  unit_cost?: number | string;
  amount?: number | string;
  confidence?: string;
  raw_line?: string;
};

type AiInvoiceResponse = {
  invoice?: {
    invoice_number?: string;
    vendor?: string;
    invoice_date?: string;
    total?: number | string;
  };
  line_items?: AiLineItem[];
};

export function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function value(job: ProductionJob, keys: string[]) {
  for (const key of keys) {
    const found = job[key];
    if (found !== null && found !== undefined && found !== '') return stringValue(found);
  }
  return '';
}

export function matrixKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = stringValue(value).replace(/[$,]/g, '').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonObject(text: string): AiInvoiceResponse {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return {};
  return JSON.parse(cleaned.slice(start, end + 1)) as AiInvoiceResponse;
}

function textFromOpenAi(data: unknown) {
  const shaped = data as {
    output_text?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof shaped.output_text === 'string') return shaped.output_text;
  const chatText = shaped.choices?.[0]?.message?.content;
  if (typeof chatText === 'string') return chatText;
  if (Array.isArray(shaped.output)) {
    return shaped.output
      .flatMap(item => item.content || [])
      .map(content => typeof content.text === 'string' ? content.text : '')
      .join('\n');
  }
  return '';
}

function jobContext(job: ProductionJob): JobContext {
  return {
    record_id: value(job, ['airtable_record_id']),
    job_id: value(job, ['job_id', 'Job ID', 'Matrix']),
    matrix: value(job, ['matrix', 'MATRIX', 'Matrix ID', 'job_id']),
    customer: value(job, ['customer', 'Job Name', 'Customer', 'Customer Name', 'Artist', 'Title', '1']),
    order_number: value(job, ['order_number', 'ORDER NUMBER', 'Order Number']),
  };
}

export async function loadProductionJobsForVendorInvoices() {
  const jobs = isAirtableConfigured()
    ? await getAirtableJobs({ syncCompleted: false })
    : await getNORPJobs();

  return jobs.map(job => jobContext(job as unknown as ProductionJob)).filter(job => job.matrix || job.job_id || job.customer);
}

export function findMatchingVendorInvoiceJob(
  line: { matrix: string; description: string },
  jobs: JobContext[],
) {
  const explicitKey = matrixKey(line.matrix);
  if (explicitKey) {
    const exact = jobs.find(job => matrixKey(job.matrix || job.job_id) === explicitKey);
    if (exact) return exact;
  }

  const searchable = matrixKey(`${line.matrix} ${line.description}`);
  if (!searchable) return null;

  const candidates = jobs
    .filter(job => {
      const key = matrixKey(job.matrix || job.job_id);
      return key.length >= 4 && searchable.includes(key);
    })
    .sort((a, b) => matrixKey(b.matrix || b.job_id).length - matrixKey(a.matrix || a.job_id).length);

  return candidates[0] || null;
}

export async function parseVendorInvoiceTextWithAi(input: {
  text: string;
  vendorHint?: string;
  categoryHint?: string;
  sourceFile?: string;
  jobs?: JobContext[];
}): Promise<VendorInvoiceParseResult> {
  const apiKey = await getShipmentAiApiKey();
  if (!apiKey) throw new Error('OpenAI/GPT key is not configured');

  const jobs = input.jobs || await loadProductionJobsForVendorInvoices();
  const model = await getShipmentAiModel();
  const jobList = jobs.slice(0, MAX_JOB_CONTEXT).map(job => ({
    matrix: job.matrix || job.job_id,
    customer: job.customer,
    order_number: job.order_number,
  }));

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You extract vendor invoice costs for a record pressing production board.',
            'Return ONLY JSON with this shape: {"invoice":{"invoice_number":"","vendor":"","invoice_date":"","total":0},"line_items":[{"description":"","matrix":"","category":"","quantity":0,"unit_cost":0,"amount":0,"confidence":"high|medium|low","raw_line":""}]}',
            'Each line item should be a production-job cost, not payment terms, subtotals, taxes, balances, or freight totals unless those are real vendor line charges.',
            'Prefer matrix/catalog/job IDs that match the provided production jobs. Leave matrix empty when unsure.',
            'Categories should be short labels like Jackets, Labels, Stampers, Lacquers, Printing, Parts, Shipping, Labor, Other.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `Vendor hint: ${input.vendorHint || '(none)'}`,
            `Category hint: ${input.categoryHint || '(none)'}`,
            `Production jobs JSON: ${JSON.stringify(jobList)}`,
            'Invoice text:',
            input.text.slice(0, 50000),
          ].join('\n\n'),
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: { message?: string } }).error?.message || `GPT invoice parser failed (${res.status})`;
    throw new Error(message);
  }

  const parsed = parseJsonObject(textFromOpenAi(data));
  const invoice = {
    invoice_number: String(parsed.invoice?.invoice_number || '').trim(),
    vendor: String(parsed.invoice?.vendor || input.vendorHint || '').trim(),
    invoice_date: String(parsed.invoice?.invoice_date || '').trim(),
    total: parseNumber(parsed.invoice?.total),
    source_file: input.sourceFile || '',
  };

  const line_items = (parsed.line_items || []).map((line, index) => {
    const description = String(line.description || '').trim();
    const explicitMatrix = String(line.matrix || '').trim();
    const matched = findMatchingVendorInvoiceJob({ matrix: explicitMatrix, description }, jobs);
    const matrix = matched?.matrix || explicitMatrix;

    return {
      id: `line-${index + 1}`,
      description,
      matrix,
      category: String(line.category || input.categoryHint || 'Other').trim(),
      quantity: parseNumber(line.quantity),
      unit_cost: parseNumber(line.unit_cost),
      amount: parseNumber(line.amount),
      confidence: String(line.confidence || (matched ? 'medium' : 'low')).trim(),
      raw_line: String(line.raw_line || description).trim(),
      matched_job: matched,
      skipped: !matched,
    };
  }).filter(line => line.description || line.matrix || line.amount);

  return {
    invoice,
    line_items,
    matches: {
      matched: line_items.filter(line => line.matched_job).length,
      unmatched: line_items.filter(line => !line.matched_job).length,
    },
    text_excerpt: input.text.slice(0, 1200),
  };
}

export function autoApplicableVendorInvoiceRows(result: VendorInvoiceParseResult) {
  return result.line_items.filter(line => (
    !line.skipped
    && Boolean(line.matched_job)
    && Boolean(line.matrix)
    && line.amount > 0
    && line.confidence.toLowerCase() === 'high'
  ));
}
