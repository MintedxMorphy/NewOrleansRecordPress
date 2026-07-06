import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { findRow, updateRow, appendRow, getSheet } from '@/lib/sheets';
import { getWorkspaceAuth, getOAuth2Auth, hasServiceAccount } from '@/lib/google-auth';
import { createVendorCostRows, type VendorCostRowInput } from '@/lib/airtable-vendor-costs';
import { extractPdfText as extractPdfTextFromBuffer } from '@/lib/pdf-text';
import {
  autoApplicableVendorInvoiceRows,
  parseVendorInvoiceTextWithAi,
  type VendorInvoiceParseResult,
} from '@/lib/vendor-invoice-import';

// Operational inboxes — forwarded emails land here too
const ALL_MAILBOXES = [
  'gregory@neworleansrecordpress.com',
  'scott@neworleansrecordpress.com',
  'brice@neworleansrecordpress.com',
  'patrick@neworleansrecordpress.com',
  'accounting@neworleansrecordpress.com',
];

// Personal Gmail account (uses OAuth2 refresh token, not DWD)
const PERSONAL_GMAIL = 'neworleansrecordpress@gmail.com';

const CLASSIFICATION_PROMPT = `You are an email classifier for New Orleans Record Press (NORP), a vinyl record pressing plant. Classify this email into exactly one category and extract relevant fields. Return ONLY valid JSON.

IMPORTANT CONTEXT: This plant presses vinyl records (LPs 12", 7" singles, colored vinyl, picture discs, test pressings) for independent labels and artists. Common emails include:
- Artists/labels placing or discussing pressing orders
- Status updates on jobs (mastering complete, lacquers cut, plates ready, pressing scheduled, test pressings sent, QC pass/fail, ready to ship)
- Vendor invoices from: PVC/compound suppliers (Shintech, Axiall, MRC), mastering labs, plating shops, sleeve/jacket printers, label printers, packaging suppliers
- Shipping confirmations and tracking from Priority1, UPS, FedEx, freight carriers
- Payment notifications (Stripe, ACH, wire, check)
- Internal team updates between gregory@, scott@, brice@, patrick@ about order status

CLASSIFICATION RULES (bias toward these categories — use 'other' sparingly):
- vendor_invoice: invoice, bill, PO, payment request from ANY supplier or vendor; includes mastering labs, plating, printing, PVC/compound
- quote_request: any label, band, artist, or manager asking about pressing costs, pricing, turnaround, or wanting to place a NEW order they haven't confirmed yet
- order_update: ANY of these — order confirmed, deposit paid, mastering started/done, lacquers cut, plates made, test pressings sent/approved/rejected, pressing started/done, QC pass/fail, order status questions, job number references, artist/title/format/quantity mentioned in context of an existing order, internal team updates about a job, emails FROM or TO labels/artists about their order progress
- shipping_update: tracking numbers, UPS/FedEx/freight notifications, delivery confirmations, shipping invoices
- payment_received: Stripe notification, ACH/wire received, check received, deposit confirmation, payment confirmation
- other: ONLY use for spam, newsletters, unrelated personal emails, system notifications unrelated to plant operations

When in doubt between 'order_update' and 'other', choose 'order_update' if the email mentions: an artist name, album/record title, vinyl format, pressing quantity, any NORP job number, mastering/plating/pressing/QC/test pressing, or any customer/label communication.

Required JSON response:
{
  "classification": "<category>",
  "confidence": <0.0-1.0>,
  "summary": "<one sentence describing what this email is about, including artist/label name and format if present>",
  "extracted": {
    "vendor_name": "<supplier name if vendor_invoice, else null>",
    "amount_usd": <number or null>,
    "invoice_number": "<invoice/PO number or null>",
    "due_date": "<YYYY-MM-DD or null>",
    "customer_name": "<artist, band, or label name if identifiable, else null>",
    "format": "<LP 12inch / 7inch / test pressing / picture disc / etc or null>",
    "quantity": <number or null>,
    "job_id": "<NORP job ID if mentioned e.g. NORP-20240115-1234, else null>",
    "tracking_number": "<tracking number if shipping_update, else null>"
  }
}

Email subject: {{SUBJECT}}
Email body: {{BODY}}`;

function decodeBase64Url(str: string): Buffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function extractBodyText(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data).toString('utf-8');
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data).toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }
  return '';
}

type PdfAttachment = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  text: string;
};

async function collectPdfAttachments(gmail: any, messageId: string, parts: any[]): Promise<PdfAttachment[]> {
  const attachments: PdfAttachment[] = [];

  const processParts = async (partList: any[]) => {
    for (const part of partList) {
      if (part.filename && part.body?.attachmentId &&
          (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf'))) {
        try {
          const att = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: part.body.attachmentId,
          });
          if (att.data.data) {
            const buffer = decodeBase64Url(att.data.data);
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType ?? 'application/pdf',
              buffer,
              text: await extractPdfTextFromBuffer(buffer),
            });
          }
        } catch (e) {
          console.error(`[collectPdfAttachments] Failed to extract ${part.filename}:`, e);
        }
      }
      if (part.parts) {
        await processParts(part.parts);
      }
    }
  };

  await processParts(parts);
  return attachments;
}

async function uploadToDrive(drive: any, content: Buffer, filename: string, mimeType: string, year: string, month: string): Promise<string> {
  const findOrCreate = async (name: string, parentId: string | null): Promise<string> => {
    const q = parentId
      ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files?.length > 0) return res.data.files[0].id;
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined },
      fields: 'id',
    });
    return created.data.id!;
  };

  const rootId = await findOrCreate('NORP_Bills', null);
  const yearId = await findOrCreate(year, rootId);
  const monthId = await findOrCreate(month, yearId);

  const { Readable } = await import('stream');
  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  const uploaded = await drive.files.create({
    requestBody: { name: filename, parents: [monthId] },
    media: { mimeType, body: stream },
    fields: 'id,webViewLink',
  });
  return uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${uploaded.data.id}/view`;
}

interface ScanResult {
  emailId: string;
  inbox: string;
  classification: string;
  action: string;
  error?: string;
}

type ScanOptions = {
  beforeDate?: number;
  vendorCostBackfillOnly?: boolean;
};

type ScanBatch = {
  backfill_days: number;
  batch_days: number;
  batch_index: number;
  total_batches: number;
  batch_anchor_epoch_seconds: number;
  window_start_epoch_seconds: number;
  window_end_epoch_seconds: number;
  next_batch_index: number | null;
};

type VendorBackfillTask = [number, number, number, number]; // after, before, inbox index, attempt

type VendorBackfillState = {
  run_id: string;
  status: 'running' | 'completed' | 'paused';
  started_at: string;
  updated_at: string;
  anchor_epoch_seconds: number;
  window_hours: number;
  inboxes: string[];
  cursor: number;
  queue: VendorBackfillTask[];
  in_progress?: {
    cursor: number;
    task: VendorBackfillTask;
    started_at: string;
  };
  totals: {
    completed_tasks: number;
    failed_tasks: number;
    split_tasks: number;
    total_processed: number;
    vendor_costs_backfilled: number;
    vendor_costs_duplicate: number;
    vendor_invoices_for_review: number;
    action_counts: Record<string, number>;
  };
  failures: Array<{
    task: VendorBackfillTask;
    inbox: string;
    error: string;
    failed_at: string;
  }>;
};

const VENDOR_COST_BACKFILL_STATE_KEY = 'vendor_cost_backfill_state';
const VENDOR_COST_BACKFILL_INBOXES = [
  'gregory@neworleansrecordpress.com',
  'scott@neworleansrecordpress.com',
  'brice@neworleansrecordpress.com',
  'patrick@neworleansrecordpress.com',
  'accounting@neworleansrecordpress.com',
];
const VENDOR_BACKFILL_STALE_MS = 3 * 60 * 1000;

function vendorCostRowsFromInvoiceResult(
  result: VendorInvoiceParseResult,
  sourceFile: string,
): VendorCostRowInput[] {
  return autoApplicableVendorInvoiceRows(result).map(line => ({
    invoice_number: result.invoice.invoice_number,
    vendor: result.invoice.vendor,
    category: line.category || 'Other',
    matrix: line.matrix,
    customer: line.matched_job?.customer || '',
    job_id: line.matched_job?.job_id || '',
    description: line.description,
    quantity: line.quantity,
    unit_cost: line.unit_cost,
    amount: line.amount,
    invoice_date: result.invoice.invoice_date,
    source_file: sourceFile || result.invoice.source_file,
    raw_line: line.raw_line || line.description,
    match_confidence: line.confidence,
  }));
}

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid number: ${value}`);
  return number;
}

function resolveEmailScanBatch(input: {
  backfillDays: number;
  batchDays: number;
  batchIndex?: number;
  batchAnchorEpochSeconds?: number;
}): ScanBatch {
  const backfillDays = Math.max(1, Math.floor(input.backfillDays));
  const batchDays = Math.max(1, Math.floor(input.batchDays));
  const batchIndex = Math.max(0, Math.floor(input.batchIndex || 0));
  const batchAnchor = input.batchAnchorEpochSeconds || Math.floor(Date.now() / 1000);
  const daySeconds = 24 * 60 * 60;
  const totalBatches = Math.ceil(backfillDays / batchDays);
  const backfillStart = batchAnchor - backfillDays * daySeconds;
  const windowEnd = batchAnchor - batchIndex * batchDays * daySeconds;
  const windowStart = Math.max(backfillStart, windowEnd - batchDays * daySeconds);

  return {
    backfill_days: backfillDays,
    batch_days: batchDays,
    batch_index: batchIndex,
    total_batches: totalBatches,
    batch_anchor_epoch_seconds: batchAnchor,
    window_start_epoch_seconds: windowStart,
    window_end_epoch_seconds: windowEnd,
    next_batch_index: batchIndex + 1 < totalBatches ? batchIndex + 1 : null,
  };
}

function nextBatchUrl(req: NextRequest, batch: ScanBatch) {
  if (batch.next_batch_index === null) return undefined;
  const url = req.nextUrl.clone();
  url.searchParams.set('batch', String(batch.next_batch_index));
  url.searchParams.set('batch_anchor', String(batch.batch_anchor_epoch_seconds));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

async function loadVendorBackfillState(): Promise<VendorBackfillState | null> {
  const row = await findRow('qbo_cache', 'key', VENDOR_COST_BACKFILL_STATE_KEY);
  if (!row?.row.value) return null;
  return JSON.parse(row.row.value) as VendorBackfillState;
}

async function saveVendorBackfillState(state: VendorBackfillState) {
  state.updated_at = new Date().toISOString();
  const row = {
    key: VENDOR_COST_BACKFILL_STATE_KEY,
    value: JSON.stringify(state),
    updated_at: state.updated_at,
  };
  const existing = await findRow('qbo_cache', 'key', VENDOR_COST_BACKFILL_STATE_KEY);
  if (existing) await updateRow('qbo_cache', existing.rowIndex, row);
  else await appendRow('qbo_cache', row);
}

function buildVendorBackfillQueue(input: {
  days: number;
  windowHours: number;
  anchorEpochSeconds: number;
  inboxes: string[];
}) {
  const queue: VendorBackfillTask[] = [];
  const windowSeconds = Math.max(1, input.windowHours) * 60 * 60;
  const totalWindows = Math.ceil((input.days * 24 * 60 * 60) / windowSeconds);

  for (let windowIndex = 0; windowIndex < totalWindows; windowIndex += 1) {
    const before = input.anchorEpochSeconds - windowIndex * windowSeconds;
    const after = Math.max(input.anchorEpochSeconds - input.days * 24 * 60 * 60, before - windowSeconds);
    for (let inboxIndex = 0; inboxIndex < input.inboxes.length; inboxIndex += 1) {
      queue.push([after, before, inboxIndex, 0]);
    }
  }

  return queue;
}

function summarizeVendorBackfillState(state: VendorBackfillState | null) {
  if (!state) return { exists: false };
  return {
    exists: true,
    run_id: state.run_id,
    status: state.status,
    started_at: state.started_at,
    updated_at: state.updated_at,
    window_hours: state.window_hours,
    inboxes: state.inboxes,
    cursor: state.cursor,
    queue_length: state.queue.length,
    remaining_tasks: Math.max(0, state.queue.length - state.cursor),
    in_progress: state.in_progress ? {
      cursor: state.in_progress.cursor,
      inbox: state.inboxes[state.in_progress.task[2]] || '',
      after: state.in_progress.task[0],
      before: state.in_progress.task[1],
      attempt: state.in_progress.task[3],
      started_at: state.in_progress.started_at,
    } : null,
    totals: state.totals,
    recent_failures: state.failures.slice(-10).map(failure => ({
      ...failure,
      inbox: failure.inbox,
      after: failure.task[0],
      before: failure.task[1],
      attempt: failure.task[3],
    })),
  };
}

function actionCounts(results: ScanResult[]) {
  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result.action] = (counts[result.action] || 0) + 1;
  }
  return counts;
}

function addActionCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [action, count] of Object.entries(source)) {
    target[action] = (target[action] || 0) + count;
  }
}

function markVendorBackfillFailure(state: VendorBackfillState, task: VendorBackfillTask, error: string) {
  const [after, before, inboxIndex, attempt] = task;
  const duration = before - after;
  if (duration > 60 * 60 && attempt < 4) {
    const mid = Math.floor((after + before) / 2);
    state.queue.push([after, mid, inboxIndex, attempt + 1]);
    state.queue.push([mid, before, inboxIndex, attempt + 1]);
    state.totals.split_tasks += 1;
    return 'split';
  }

  state.totals.failed_tasks += 1;
  state.failures.push({
    task,
    inbox: state.inboxes[inboxIndex] || '',
    error,
    failed_at: new Date().toISOString(),
  });
  state.failures = state.failures.slice(-100);
  return 'failed';
}

async function startVendorCostBackfill(req: NextRequest) {
  const days = Math.max(1, Math.floor(optionalNumber(req.nextUrl.searchParams.get('days')) || 30));
  const windowHours = Math.max(1, Math.floor(optionalNumber(req.nextUrl.searchParams.get('window_hours')) || 6));
  const anchor = optionalNumber(req.nextUrl.searchParams.get('anchor')) || Math.floor(Date.now() / 1000);
  const inboxParam = req.nextUrl.searchParams.get('inboxes');
  const inboxes = inboxParam
    ? inboxParam.split(',').map(inbox => inbox.trim()).filter(Boolean)
    : VENDOR_COST_BACKFILL_INBOXES;
  const now = new Date().toISOString();
  const state: VendorBackfillState = {
    run_id: `vendor-cost-backfill-${now}`,
    status: 'running',
    started_at: now,
    updated_at: now,
    anchor_epoch_seconds: anchor,
    window_hours: windowHours,
    inboxes,
    cursor: 0,
    queue: buildVendorBackfillQueue({ days, windowHours, anchorEpochSeconds: anchor, inboxes }),
    totals: {
      completed_tasks: 0,
      failed_tasks: 0,
      split_tasks: 0,
      total_processed: 0,
      vendor_costs_backfilled: 0,
      vendor_costs_duplicate: 0,
      vendor_invoices_for_review: 0,
      action_counts: {},
    },
    failures: [],
  };
  await saveVendorBackfillState(state);
  return state;
}

async function processVendorCostBackfillNext(anthropic: Anthropic) {
  const state = await loadVendorBackfillState();
  if (!state) return { error: 'No vendor cost backfill state exists. Start one first.' };
  if (state.status !== 'running') return { state: summarizeVendorBackfillState(state), processed: null };

  if (state.in_progress) {
    const started = Date.parse(state.in_progress.started_at);
    if (Number.isFinite(started) && Date.now() - started > VENDOR_BACKFILL_STALE_MS) {
      const recoveredTask = state.in_progress.task;
      const recovered = markVendorBackfillFailure(state, recoveredTask, 'Recovered stale in-progress task');
      state.cursor = Math.max(state.cursor, state.in_progress.cursor + 1);
      state.in_progress = undefined;
      await saveVendorBackfillState(state);
      return { recovered_stale_task: recovered, state: summarizeVendorBackfillState(state), processed: null };
    }
    return { state: summarizeVendorBackfillState(state), processed: null };
  }

  const task = state.queue[state.cursor];
  if (!task) {
    state.status = 'completed';
    await saveVendorBackfillState(state);
    return { state: summarizeVendorBackfillState(state), processed: null };
  }

  state.in_progress = {
    cursor: state.cursor,
    task,
    started_at: new Date().toISOString(),
  };
  await saveVendorBackfillState(state);

  const [after, before, inboxIndex] = task;
  const inbox = state.inboxes[inboxIndex];
  let processed: Record<string, unknown>;

  try {
    const results = await scanMailbox(inbox, after, new Set(), anthropic, {
      beforeDate: before,
      vendorCostBackfillOnly: true,
    });
    const counts = actionCounts(results);
    const errors = results.filter(result => result.error).length;
    const failed = errors > 0 && results.every(result => result.error);

    if (failed) {
      const failureAction = markVendorBackfillFailure(state, task, results.map(result => result.error).filter(Boolean).join('; ') || 'Mailbox scan failed');
      processed = { inbox, after, before, status: failureAction, errors, actions: counts };
    } else {
      state.totals.completed_tasks += 1;
      state.totals.total_processed += results.length;
      state.totals.vendor_costs_backfilled += counts.vendor_costs_backfilled || 0;
      state.totals.vendor_costs_duplicate += counts.vendor_costs_backfill_duplicate || 0;
      state.totals.vendor_invoices_for_review += counts.vendor_costs_backfill_review || 0;
      addActionCounts(state.totals.action_counts, counts);
      processed = { inbox, after, before, status: 'completed', errors, actions: counts };
    }
  } catch (error) {
    const failureAction = markVendorBackfillFailure(state, task, error instanceof Error ? error.message : String(error));
    processed = { inbox, after, before, status: failureAction, error: error instanceof Error ? error.message : String(error) };
  }

  state.cursor += 1;
  state.in_progress = undefined;
  if (state.cursor >= state.queue.length) state.status = 'completed';
  await saveVendorBackfillState(state);

  return { state: summarizeVendorBackfillState(state), processed };
}

// Concurrency limiter
function pLimit(concurrency: number) {
  const queue: (() => Promise<void>)[] = [];
  let active = 0;

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const fn = queue.shift()!;
    fn().finally(() => {
      active--;
      next();
    });
  };

  return <T>(tasks: (() => Promise<T>)[]): Promise<T[]> => {
    return Promise.all(
      tasks.map(task => new Promise<T>((resolve, reject) => {
        queue.push(async () => {
          try {
            resolve(await task());
          } catch (e) {
            reject(e);
          }
        });
        next();
      }))
    );
  };
}

async function scanMailboxWithAuth(
  email: string,
  auth: any,
  afterDate: number,
  processedIds: Set<string>,
  anthropic: Anthropic,
  options: ScanOptions = {},
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const driveAuth = auth; // use same auth for drive
    return await scanMailboxCore(email, gmail, driveAuth, afterDate, processedIds, anthropic, options);
  } catch (e: any) {
    console.error(`[scanMailbox] Failed to scan ${email}:`, e?.message);
    return [];
  }
}

async function scanMailbox(
  email: string,
  afterDate: number,
  processedIds: Set<string>,
  anthropic: Anthropic,
  options: ScanOptions = {},
): Promise<ScanResult[]> {
  try {
    const auth = getWorkspaceAuth(email);
    const gmail = google.gmail({ version: 'v1', auth });
    const driveAuth = hasServiceAccount() ? getWorkspaceAuth('gregory@neworleansrecordpress.com') : getOAuth2Auth();
    return await scanMailboxCore(email, gmail, driveAuth, afterDate, processedIds, anthropic, options);
  } catch (e: any) {
    console.error(`[scanMailbox] Failed to scan ${email}:`, e?.message);
    return [{ emailId: 'N/A', inbox: email, classification: 'error', action: 'mailbox_scan_failed', error: e?.message }];
  }
}

async function scanMailboxCore(
  email: string,
  gmail: any,
  driveAuth: any,
  afterDate: number,
  processedIds: Set<string>,
  anthropic: Anthropic,
  options: ScanOptions = {},
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    const drive = google.drive({ version: 'v3', auth: driveAuth });

    const query = [
      `after:${afterDate}`,
      options.beforeDate ? `before:${options.beforeDate}` : '',
      options.vendorCostBackfillOnly ? '(invoice OR invoices OR bill OR billing OR receipt OR statement OR "amount due" OR "balance due") filename:pdf' : '',
      '-in:sent',
      '-in:draft',
    ].filter(Boolean).join(' ');

    const messages: Array<{ id?: string }> = [];
    let pageToken: string | undefined;
    do {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100,
        pageToken,
      });
      messages.push(...(listRes.data.messages ?? []));
      pageToken = listRes.data.nextPageToken || undefined;
    } while (pageToken);

    for (const msg of messages) {
      if (!msg.id) continue;

      // Skip if already processed during normal scans. Vendor-cost backfills
      // intentionally revisit older invoice emails, relying on Vendor Costs
      // duplicate keys to prevent double cost writes.
      if (processedIds.has(msg.id) && !options.vendorCostBackfillOnly) {
        continue;
      }
      if (!options.vendorCostBackfillOnly) processedIds.add(msg.id);

      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const headers = full.data.payload?.headers ?? [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value ?? '(no subject)';
        const from = headers.find((h: any) => h.name === 'From')?.value ?? '';
        let bodyText = extractBodyText(full.data.payload);

        const parts = full.data.payload?.parts ?? [];
        const partsToScan = parts.length > 0 ? parts : [full.data.payload];
        const pdfAttachments = await collectPdfAttachments(gmail, msg.id, partsToScan);
        const pdfText = pdfAttachments
          .filter(attachment => attachment.text)
          .map(attachment => `[PDF: ${attachment.filename}]\n${attachment.text}`)
          .join('\n\n');
        if (pdfText) {
          bodyText = `${bodyText}\n\n--- ATTACHED PDF CONTENT ---\n${pdfText}`;
        }

        let classification: any = {};
        if (options.vendorCostBackfillOnly) {
          classification = {
            classification: 'vendor_invoice',
            confidence: 1,
            summary: 'Vendor cost backfill candidate',
            extracted: {},
          };
        } else {
          // Classify with Claude
          const prompt = CLASSIFICATION_PROMPT
            .replace('{{SUBJECT}}', subject)
            .replace('{{BODY}}', bodyText.slice(0, 4000)); // Increased limit for PDF content

          const claudeRes = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          });

          try {
            const raw = (claudeRes.content[0] as any).text ?? '';
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            classification = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
          } catch {
            classification = { classification: 'other', confidence: 0.5, summary: 'Parse error', extracted: {} };
          }
        }

        const { extracted = {} } = classification;
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');

        let actionTaken = 'logged';
        let jobId = extracted.job_id ?? '';
        let billId = '';

        // Route by classification
        if (classification.classification === 'vendor_invoice') {
          // Download PDF attachments and upload to Drive
          let pdfUrl = '';
          if (!options.vendorCostBackfillOnly) {
            for (const attachment of pdfAttachments) {
              pdfUrl = await uploadToDrive(drive, attachment.buffer, attachment.filename, attachment.mimeType, year, month);
            }
          }

          billId = `BILL-${msg.id}`;
          let vendorCostNote = '';
          let shouldWriteBillRow = !options.vendorCostBackfillOnly;
          try {
            const parsedInvoice = await parseVendorInvoiceTextWithAi({
              text: bodyText,
              vendorHint: extracted.vendor_name ?? '',
              sourceFile: pdfUrl || subject,
            });
            const rows = vendorCostRowsFromInvoiceResult(parsedInvoice, pdfUrl || subject);
            const reviewCount = parsedInvoice.line_items.length - rows.length;
            shouldWriteBillRow = shouldWriteBillRow || parsedInvoice.line_items.length > 0;

            if (rows.length) {
              const vendorCostResult = await createVendorCostRows(rows);
              vendorCostNote = ` Vendor costs: parsed ${parsedInvoice.line_items.length} line(s), auto-applied ${vendorCostResult.created.length}, skipped duplicate ${vendorCostResult.skipped.length}, review ${reviewCount}.`;
              actionTaken = vendorCostResult.created.length
                ? (options.vendorCostBackfillOnly ? 'vendor_costs_backfilled' : 'added_to_bills_inbox_and_vendor_costs')
                : (options.vendorCostBackfillOnly ? 'vendor_costs_backfill_duplicate' : 'added_to_bills_inbox_vendor_costs_duplicate');
            } else if (parsedInvoice.line_items.length) {
              vendorCostNote = ` Vendor costs: parsed ${parsedInvoice.line_items.length} line(s), none auto-applied; review ${reviewCount}.`;
              if (options.vendorCostBackfillOnly) actionTaken = 'vendor_costs_backfill_review';
            } else {
              vendorCostNote = ' Vendor costs: no line-item costs found.';
              if (options.vendorCostBackfillOnly) actionTaken = 'vendor_costs_backfill_no_line_items';
            }
          } catch (e) {
            vendorCostNote = ` Vendor cost parse/apply failed: ${e instanceof Error ? e.message : String(e)}.`;
            if (options.vendorCostBackfillOnly) actionTaken = 'vendor_costs_backfill_parse_failed';
          }

          const billRow = {
            email_id: msg.id,
            date_received: new Date().toISOString(),
            sender: from,
            vendor_guess: extracted.vendor_name ?? '',
            amount_usd: String(extracted.amount_usd ?? ''),
            due_date: extracted.due_date ?? '',
            invoice_number: extracted.invoice_number ?? '',
            status: 'new',
            pdf_drive_url: pdfUrl,
            qbo_bill_id: '',
            notes: `${options.vendorCostBackfillOnly ? 'Vendor cost backfill' : `Classified by Claude (${(classification.confidence * 100).toFixed(0)}%)`} from ${email}: ${classification.summary}${vendorCostNote}`,
          };

          if (options.vendorCostBackfillOnly) {
            if (shouldWriteBillRow) {
              const existingBill = await findRow('bills_inbox', 'email_id', msg.id);
              if (existingBill) {
                await updateRow('bills_inbox', existingBill.rowIndex, {
                  ...existingBill.row,
                  ...billRow,
                  pdf_drive_url: existingBill.row.pdf_drive_url || pdfUrl,
                  notes: `${existingBill.row.notes || ''}\n[Vendor cost backfill ${new Date().toISOString()}]${vendorCostNote}`.trim(),
                });
              } else {
                await appendRow('bills_inbox', billRow);
              }
            } else {
              billId = '';
            }
          } else {
            await appendRow('bills_inbox', billRow);
          }
          if (actionTaken === 'logged') actionTaken = 'added_to_bills_inbox';

        } else if (options.vendorCostBackfillOnly) {
          actionTaken = 'ignored_not_vendor_invoice_backfill';

        } else if (classification.classification === 'quote_request') {
          const newJobId = `NORP-${year}${month}${String(now.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
          await appendRow('jobs', {
            job_id: newJobId,
            customer: extracted.customer_name ?? from,
            contact_email: from.match(/<([^>]+)>/)?.[1] ?? from,
            format: extracted.format ?? '',
            quantity: String(extracted.quantity ?? ''),
            color: '', weight_g: '', package_type: '', stage: 'quote',
            quote_date: now.toISOString().split('T')[0],
            deposit_date: '', ship_date_target: '', pvc_kg_needed: '',
            sleeves_needed: '', jackets_needed: '', labels_needed: '',
            total_price: '', deposit_received: '', balance_due: '',
            assigned_press: '', tracking_number: '', ups_service: '',
            shipping_cost: '', ship_status: '', delivery_date: '',
            notes: `Auto-created from email (${email}): ${subject}`,
          });
          jobId = newJobId;
          actionTaken = 'created_job';

        } else if (['order_update', 'shipping_update'].includes(classification.classification)) {
          if (extracted.job_id) {
            const found = await findRow('jobs', 'job_id', extracted.job_id);
            if (found) {
              await updateRow('jobs', found.rowIndex, {
                ...found.row,
                notes: `${found.row.notes}\n[${now.toISOString()}] (via ${email}) ${classification.summary}`.trim(),
              });
              actionTaken = 'updated_job_notes';
            }
          } else if (extracted.tracking_number) {
            const found = await findRow('jobs', 'tracking_number', extracted.tracking_number);
            if (found) {
              await updateRow('jobs', found.rowIndex, {
                ...found.row,
                notes: `${found.row.notes}\n[${now.toISOString()}] (via ${email}) ${classification.summary}`.trim(),
              });
              actionTaken = 'updated_job_notes_by_tracking';
            }
          }

        } else if (classification.classification === 'payment_received') {
          const jobs = await getSheet('jobs');
          const match = jobs.find(j =>
            (extracted.customer_name && j.customer?.toLowerCase().includes(extracted.customer_name.toLowerCase())) ||
            (extracted.amount_usd && parseFloat(j.balance_due || '0') === extracted.amount_usd)
          );
          if (match) {
            const found = await findRow('jobs', 'job_id', match.job_id);
            if (found) {
              const depositRcvd = parseFloat(found.row.deposit_received || '0') + (extracted.amount_usd ?? 0);
              const totalPrice = parseFloat(found.row.total_price || '0');
              await updateRow('jobs', found.rowIndex, {
                ...found.row,
                deposit_received: String(depositRcvd),
                balance_due: String(Math.max(0, totalPrice - depositRcvd)),
              });
              jobId = match.job_id;
              actionTaken = 'updated_payment';
            }
          }
        }

        if (!options.vendorCostBackfillOnly) {
          // Log to email_log with inbox field
          await appendRow('email_log', {
            email_id: msg.id,
            timestamp: now.toISOString(),
            inbox: email,
            from,
            subject,
            classification: classification.classification ?? 'other',
            confidence: String(classification.confidence ?? ''),
            summary: classification.summary ?? '',
            action_taken: actionTaken,
            job_id: jobId,
            bill_id: billId,
          });
        }

        results.push({
          emailId: msg.id,
          inbox: email,
          classification: classification.classification ?? 'other',
          action: actionTaken,
        });
      } catch (e: any) {
        results.push({
          emailId: msg.id,
          inbox: email,
          classification: 'error',
          action: 'failed',
          error: e?.message,
        });
      }
    }
  } catch (e: any) {
    console.error(`[scanMailbox] Failed to scan ${email}:`, e?.message);
    results.push({
      emailId: 'N/A',
      inbox: email,
      classification: 'error',
      action: 'mailbox_scan_failed',
      error: e?.message,
    });
  }

  return results;
}

export async function GET(req: NextRequest) {
  try {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  if (req.nextUrl?.searchParams?.get('vendor_cost_backfill_queue') === '1') {
    const action = req.nextUrl.searchParams.get('action') || 'status';
    if (action === 'start') {
      const state = await startVendorCostBackfill(req);
      return NextResponse.json({ ok: true, action, state: summarizeVendorBackfillState(state) });
    }
    if (action === 'next') {
      const result = await processVendorCostBackfillNext(anthropic);
      return NextResponse.json({ ok: !('error' in result), action, ...result });
    }
    const state = await loadVendorBackfillState();
    return NextResponse.json({ ok: true, action: 'status', state: summarizeVendorBackfillState(state) });
  }

  const requestedInbox = req.nextUrl?.searchParams?.get('inbox') || '';

  // Determine which mailboxes to scan
  const mailboxes = requestedInbox === PERSONAL_GMAIL
    ? []
    : requestedInbox
    ? [requestedInbox]
    : hasServiceAccount()
      ? ALL_MAILBOXES
      : ['gregory@neworleansrecordpress.com']; // fallback to OAuth token holder

  if (!hasServiceAccount()) {
    console.warn('[scan-email] GOOGLE_SERVICE_ACCOUNT_KEY not set — scanning gregory@ only (fallback mode)');
  }

  // Always include personal Gmail if GOOGLE_PERSONAL_REFRESH_TOKEN is set
  const scanPersonalGmail = !!process.env.GOOGLE_PERSONAL_REFRESH_TOKEN;

  const vendorCostBackfillOnly = req.nextUrl?.searchParams?.get('vendor_cost_backfill') === '1';
  const lookbackDays = optionalNumber(req.nextUrl?.searchParams?.get('lookback'));
  const batchDays = optionalNumber(req.nextUrl?.searchParams?.get('batch_days'));
  const batchIndex = optionalNumber(req.nextUrl?.searchParams?.get('batch'));
  const batchAnchor = optionalNumber(req.nextUrl?.searchParams?.get('batch_anchor'));
  const explicitAfter = optionalNumber(req.nextUrl?.searchParams?.get('after'));
  const explicitBefore = optionalNumber(req.nextUrl?.searchParams?.get('before'));
  const batch = batchDays !== undefined
    ? resolveEmailScanBatch({
      backfillDays: lookbackDays ?? 30,
      batchDays,
      batchIndex,
      batchAnchorEpochSeconds: batchAnchor,
    })
    : undefined;

  // Get last run timestamp unless this call explicitly bounds the scan.
  const lastRunRow = batch || explicitAfter
    ? null
    : await findRow('qbo_cache', 'key', 'email_last_run');
  let lastRunTs: number;
  if (batch) {
    lastRunTs = batch.window_start_epoch_seconds * 1000;
  } else if (explicitAfter) {
    lastRunTs = explicitAfter * 1000;
  } else if (lookbackDays) {
    lastRunTs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  } else if (lastRunRow) {
    lastRunTs = parseInt(lastRunRow.row.value);
  } else {
    // First run: default to 7 days back
    lastRunTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  }
  const afterDate = Math.floor(lastRunTs / 1000);
  const beforeDate = batch?.window_end_epoch_seconds || explicitBefore;
  const scanOptions: ScanOptions = {
    beforeDate,
    vendorCostBackfillOnly,
  };

  // Load processed IDs from email_log to prevent duplicates
  const emailLog = await getSheet('email_log');
  const processedIds = new Set<string>(emailLog.map(r => r.email_id).filter((id): id is string => !!id));

  // Scan all mailboxes with concurrency limit of 3
  const limit = pLimit(3);
  const allResults = await limit(
    mailboxes.map(mb => () => scanMailbox(mb, afterDate, processedIds, anthropic, scanOptions))
  );

  // Also scan personal Gmail if token available
  if (scanPersonalGmail && (!requestedInbox || requestedInbox === PERSONAL_GMAIL)) {
    const personalAuth = getOAuth2Auth(process.env.GOOGLE_PERSONAL_REFRESH_TOKEN);
    const personalResults = await scanMailboxWithAuth(PERSONAL_GMAIL, personalAuth, afterDate, processedIds, anthropic, scanOptions);
    allResults.push(personalResults);
  }

  const flatResults = allResults.flat();
  const now = new Date();

  // Update last run timestamp only for normal forward scans.
  if (!vendorCostBackfillOnly && !batch && !explicitAfter && !explicitBefore) {
    const tsRow = { key: 'email_last_run', value: String(Date.now()), updated_at: now.toISOString() };
    const existing = await findRow('qbo_cache', 'key', 'email_last_run');
    if (existing) {
      await updateRow('qbo_cache', existing.rowIndex, tsRow);
    } else {
      await appendRow('qbo_cache', tsRow);
    }
  }

  const processed = flatResults.filter(r => r.action !== 'mailbox_scan_failed' && r.action !== 'failed');

  const summary = {
    ok: true,
    mode: hasServiceAccount() ? 'service_account_dwd' : 'oauth_fallback',
    vendorCostBackfillOnly,
    mailboxesScanned: mailboxes.length,
    afterDate,
    beforeDate,
    batch,
    next_batch_url: batch ? nextBatchUrl(req, batch) : undefined,
    totalProcessed: processed.length,
    vendorCostsBackfilled: flatResults.filter(r => r.action === 'vendor_costs_backfilled').length,
    vendorCostsDuplicate: flatResults.filter(r => r.action === 'vendor_costs_backfill_duplicate').length,
    vendorInvoicesForReview: flatResults.filter(r => r.action === 'added_to_bills_inbox' && vendorCostBackfillOnly).length,
    errors: flatResults.filter(r => r.error).length,
    results: flatResults,
  };

  return NextResponse.json(summary);
  } catch (e: any) {
    console.error('[scan-email] Fatal error:', e?.message, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error', stack: e?.stack?.slice(0,500) }, { status: 500 });
  }
}
