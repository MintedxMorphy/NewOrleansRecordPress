import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { findRow, updateRow, appendRow, getSheet } from '@/lib/sheets';
import { getWorkspaceAuth, getOAuth2Auth, hasServiceAccount } from '@/lib/google-auth';

// pdf-parse v1.1.0 - CommonJS module without types
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

const ALL_MAILBOXES = [
  'gregory@neworleansrecordpress.com',
  'scott@neworleansrecordpress.com',
  'brice@neworleansrecordpress.com',
  'patrick@neworleansrecordpress.com',
  'accounting@neworleansrecordpress.com',
  'info@neworleansrecordpress.com',
  'orders@neworleansrecordpress.com',
  'designs@neworleansrecordpress.com',
  'audio@neworleansrecordpress.com',
];

const CLASSIFICATION_PROMPT = `You are an email classifier for a vinyl record pressing plant. Classify this email into exactly one category and extract relevant fields. Return ONLY valid JSON.

Categories:
- vendor_invoice: contains an invoice, bill, or payment request from a supplier
- quote_request: a label or artist asking for pressing quotes or pricing
- order_update: update on an existing order (mastering, plating, pressing status)
- shipping_update: tracking info, delivery notification, shipping confirmation
- payment_received: ACH, wire, check, or card payment notification
- other: everything else

Required JSON response:
{
  "classification": "<category>",
  "confidence": <0.0-1.0>,
  "summary": "<one sentence>",
  "extracted": {
    "vendor_name": "<if vendor_invoice>",
    "amount_usd": <number or null>,
    "invoice_number": "<or null>",
    "due_date": "<YYYY-MM-DD or null>",
    "customer_name": "<if quote_request>",
    "format": "<LP/7inch/etc or null>",
    "quantity": <number or null>,
    "job_id": "<if references existing job or null>",
    "tracking_number": "<if shipping_update or null>"
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

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buf);
    return data.text.slice(0, 2000); // limit to prevent token explosion
  } catch {
    return '';
  }
}

// Find all PDF attachments and extract text
async function extractAllPdfText(gmail: any, messageId: string, parts: any[]): Promise<string> {
  const pdfTexts: string[] = [];

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
            const buf = decodeBase64Url(att.data.data);
            const text = await extractPdfText(buf);
            if (text) pdfTexts.push(`[PDF: ${part.filename}]\n${text}`);
          }
        } catch (e) {
          console.error(`[extractAllPdfText] Failed to extract ${part.filename}:`, e);
        }
      }
      // Recurse into nested parts
      if (part.parts) {
        await processParts(part.parts);
      }
    }
  };

  await processParts(parts);
  return pdfTexts.join('\n\n');
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

async function scanMailbox(
  email: string,
  afterDate: number,
  processedIds: Set<string>,
  anthropic: Anthropic
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    const auth = getWorkspaceAuth(email);
    const gmail = google.gmail({ version: 'v1', auth });
    // Use OAuth2 for Drive operations (more reliable for shared folders)
    const driveAuth = hasServiceAccount() ? getWorkspaceAuth('gregory@neworleansrecordpress.com') : getOAuth2Auth();
    const drive = google.drive({ version: 'v3', auth: driveAuth });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${afterDate} -in:sent -in:draft`,
      maxResults: 50,
    });

    const messages = listRes.data.messages ?? [];

    for (const msg of messages) {
      if (!msg.id) continue;

      // Skip if already processed (dedup across mailboxes)
      if (processedIds.has(msg.id)) {
        continue;
      }
      processedIds.add(msg.id);

      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const headers = full.data.payload?.headers ?? [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value ?? '(no subject)';
        const from = headers.find((h: any) => h.name === 'From')?.value ?? '';
        let bodyText = extractBodyText(full.data.payload);

        // Extract PDF text for ALL email categories
        const parts = full.data.payload?.parts ?? [];
        const pdfText = await extractAllPdfText(gmail, msg.id, parts.length > 0 ? parts : [full.data.payload]);
        if (pdfText) {
          bodyText = `${bodyText}\n\n--- ATTACHED PDF CONTENT ---\n${pdfText}`;
        }

        // Classify with Claude
        const prompt = CLASSIFICATION_PROMPT
          .replace('{{SUBJECT}}', subject)
          .replace('{{BODY}}', bodyText.slice(0, 4000)); // Increased limit for PDF content

        const claudeRes = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        });

        let classification: any = {};
        try {
          const raw = (claudeRes.content[0] as any).text ?? '';
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          classification = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
          classification = { classification: 'other', confidence: 0.5, summary: 'Parse error', extracted: {} };
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
          for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
              const att = await gmail.users.messages.attachments.get({
                userId: 'me', messageId: msg.id, id: part.body.attachmentId,
              });
              if (att.data.data) {
                const buf = decodeBase64Url(att.data.data);
                pdfUrl = await uploadToDrive(drive, buf, part.filename, part.mimeType ?? 'application/pdf', year, month);
              }
            }
          }

          billId = `BILL-${msg.id}`;
          await appendRow('bills_inbox', {
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
            notes: `Classified by Claude (${(classification.confidence * 100).toFixed(0)}%) from ${email}: ${classification.summary}`,
          });
          actionTaken = 'added_to_bills_inbox';

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
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Determine which mailboxes to scan
  const mailboxes = hasServiceAccount()
    ? ALL_MAILBOXES
    : ['gregory@neworleansrecordpress.com']; // fallback to OAuth token holder

  if (!hasServiceAccount()) {
    console.warn('[scan-email] GOOGLE_SERVICE_ACCOUNT_KEY not set — scanning gregory@ only (fallback mode)');
  }

  // Get last run timestamp
  const lastRunRow = await findRow('qbo_cache', 'key', 'email_last_run');
  const lastRunTs = lastRunRow ? parseInt(lastRunRow.row.value) : Date.now() - 30 * 60 * 1000;
  const afterDate = Math.floor(lastRunTs / 1000);

  // Load processed IDs from email_log to prevent duplicates
  const emailLog = await getSheet('email_log');
  const processedIds = new Set<string>(emailLog.map(r => r.email_id).filter((id): id is string => !!id));

  // Scan all mailboxes with concurrency limit of 3
  const limit = pLimit(3);
  const allResults = await limit(
    mailboxes.map(mb => () => scanMailbox(mb, afterDate, processedIds, anthropic))
  );
  const flatResults = allResults.flat();

  // Update last run timestamp
  const tsRow = { key: 'email_last_run', value: String(Date.now()), updated_at: new Date().toISOString() };
  const existing = await findRow('qbo_cache', 'key', 'email_last_run');
  if (existing) {
    await updateRow('qbo_cache', existing.rowIndex, tsRow);
  } else {
    await appendRow('qbo_cache', tsRow);
  }

  const summary = {
    ok: true,
    mode: hasServiceAccount() ? 'service_account_dwd' : 'oauth_fallback',
    mailboxesScanned: mailboxes.length,
    totalProcessed: flatResults.filter(r => r.action !== 'mailbox_scan_failed').length,
    errors: flatResults.filter(r => r.error).length,
    results: flatResults,
  };

  return NextResponse.json(summary);
}
