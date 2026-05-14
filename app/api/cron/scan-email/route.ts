import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { findRow, updateRow, appendRow, getSheet } from '@/lib/sheets';
import { getWorkspaceAuth, getOAuth2Auth, hasServiceAccount } from '@/lib/google-auth';

// Operational inboxes — forwarded emails land here too
const ALL_MAILBOXES = [
  'gregory@neworleansrecordpress.com',
  'scott@neworleansrecordpress.com',
  'brice@neworleansrecordpress.com',
  'patrick@neworleansrecordpress.com',
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

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    // Dynamic require avoids Next.js build-time module evaluation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse/lib/pdf-parse");
    const data = await pdfParse(buf);
    return (data.text ?? "").slice(0, 2000);
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

async function scanMailboxWithAuth(
  email: string,
  auth: any,
  afterDate: number,
  processedIds: Set<string>,
  anthropic: Anthropic
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const driveAuth = auth; // use same auth for drive
    return await scanMailboxCore(email, gmail, driveAuth, afterDate, processedIds, anthropic);
  } catch (e: any) {
    console.error(`[scanMailbox] Failed to scan ${email}:`, e?.message);
    return [];
  }
}

async function scanMailbox(
  email: string,
  afterDate: number,
  processedIds: Set<string>,
  anthropic: Anthropic
): Promise<ScanResult[]> {
  try {
    const auth = getWorkspaceAuth(email);
    const gmail = google.gmail({ version: 'v1', auth });
    const driveAuth = hasServiceAccount() ? getWorkspaceAuth('gregory@neworleansrecordpress.com') : getOAuth2Auth();
    return await scanMailboxCore(email, gmail, driveAuth, afterDate, processedIds, anthropic);
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
  anthropic: Anthropic
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
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
  try {
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

  // Always include personal Gmail if GOOGLE_PERSONAL_REFRESH_TOKEN is set
  const scanPersonalGmail = !!process.env.GOOGLE_PERSONAL_REFRESH_TOKEN;

  // Get last run timestamp
  const lastRunRow = await findRow('qbo_cache', 'key', 'email_last_run');
  // Allow manual lookback override via query param (e.g. ?lookback=7 for 7 days back)
  const lookbackDays = req.nextUrl?.searchParams?.get('lookback');
  let lastRunTs: number;
  if (lookbackDays) {
    lastRunTs = Date.now() - parseInt(lookbackDays) * 24 * 60 * 60 * 1000;
  } else if (lastRunRow) {
    lastRunTs = parseInt(lastRunRow.row.value);
  } else {
    // First run: default to 7 days back
    lastRunTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  }
  const afterDate = Math.floor(lastRunTs / 1000);

  // Load processed IDs from email_log to prevent duplicates
  const emailLog = await getSheet('email_log');
  const processedIds = new Set<string>(emailLog.map(r => r.email_id).filter((id): id is string => !!id));

  // Scan all mailboxes with concurrency limit of 3
  const limit = pLimit(3);
  const allResults = await limit(
    mailboxes.map(mb => () => scanMailbox(mb, afterDate, processedIds, anthropic))
  );

  // Also scan personal Gmail if token available
  if (scanPersonalGmail) {
    const personalAuth = getOAuth2Auth(process.env.GOOGLE_PERSONAL_REFRESH_TOKEN);
    const personalResults = await scanMailboxWithAuth(PERSONAL_GMAIL, personalAuth, afterDate, processedIds, anthropic);
    allResults.push(personalResults);
  }

  const flatResults = allResults.flat();
  const now = new Date();

  // Update last run timestamp
  const tsRow = { key: 'email_last_run', value: String(Date.now()), updated_at: now.toISOString() };
  const existing = await findRow('qbo_cache', 'key', 'email_last_run');
  if (existing) {
    await updateRow('qbo_cache', existing.rowIndex, tsRow);
  } else {
    await appendRow('qbo_cache', tsRow);
  }

  // ── Generate comprehensive brief and push to dashboard ────────────────────
  const processed = flatResults.filter(r => r.action !== 'mailbox_scan_failed' && r.action !== 'failed');
  const byClass: Record<string, ScanResult[]> = {};
  for (const r of processed) {
    if (!byClass[r.classification]) byClass[r.classification] = [];
    byClass[r.classification].push(r);
  }

  if (processed.length > 0) {
    try {
      // Pull summaries from the email log for richer context
      const recentLog = await getSheet('email_log');
      const cutoff = Date.now() - 12 * 60 * 60 * 1000; // last 12h
      const recentEntries = (recentLog as any[]).filter((e: any) => new Date(e.timestamp || 0).getTime() > cutoff);

      const emailDetail = recentEntries
        .map((e: any) => `[${e.inbox?.split('@')[0] ?? '?'}] ${e.classification} | ${e.from?.split('<')[0].trim().slice(0,40)} | ${e.subject?.slice(0,70)}${e.amount_usd ? ` | $${e.amount_usd}` : ''}${e.summary ? ` | ${e.summary}` : ''}`)
        .join('\n');

      // Pull last briefing to check for unresolved items to carry forward
      const prevBriefRows = await getSheet('briefings');
      const prevBrief = prevBriefRows.length > 0 ? prevBriefRows[prevBriefRows.length - 1]?.briefing_text ?? '' : '';

      const isAfternoon = now.getHours() >= 15; // UTC 21:00 = CDT 16:00
      const scanWindow = isAfternoon ? 'last 8 hours (since morning scan)' : 'last 12 hours';

      const briefPrompt = `You are the operations intelligence layer for New Orleans Record Press (NORP), a vinyl pressing plant in New Orleans. Write a ${isAfternoon ? '4 PM' : '8 AM'} update for Gregory, managing partner.

RULES:
- Direct and specific. No greetings, no filler.
- Plain text with ALL-CAPS section headers.
- Include names, dollar amounts, job numbers wherever available.
- IMPORTANT: If something urgent from the previous briefing (below) has NOT been resolved based on new email activity, repeat it prominently under STILL UNRESOLVED. Don't let things fall through the cracks.
- Only omit a section if there is truly nothing to report.
- Target: 500-700 words.

Sections:
EMAIL SCAN SUMMARY
STILL UNRESOLVED (carry forward urgent items from last brief that haven't been addressed)
NEW BUSINESS
ACTIVE ORDER UPDATES
VENDOR INVOICES & BILLS
PAYMENTS RECEIVED
SHIPPING & TRACKING
INTERNAL UPDATES
ACTION ITEMS

SCAN STATS (${scanWindow}):
- Emails this run: ${processed.length}
- Quote requests: ${(byClass.quote_request ?? []).length}
- Order updates: ${(byClass.order_update ?? []).length}
- Vendor invoices: ${(byClass.vendor_invoice ?? []).length}
- Payments received: ${(byClass.payment_received ?? []).length}
- Shipping updates: ${(byClass.shipping_update ?? []).length}

EMAIL DETAILS:
${emailDetail || '(no new emails)'}

PREVIOUS BRIEFING (check for unresolved items to carry forward):
${prevBrief ? prevBrief.slice(0, 2000) : '(none)'}

Time: ${now.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CDT`;

      const briefRes = await anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1500,
        messages: [{ role: 'user', content: briefPrompt }],
      });

      const briefText = (briefRes.content[0] as any).text?.trim() ?? '';
      const dateLabel = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' })} CDT`;

      // Write to qbo_cache for dashboard
      const upsert = async (key: string, value: string) => {
        const row = { key, value, updated_at: now.toISOString() };
        const found = await findRow('qbo_cache', 'key', key);
        if (found) { await updateRow('qbo_cache', found.rowIndex, row); }
        else { await appendRow('qbo_cache', row); }
      };

      await upsert('email_intel_summary', briefText); // cache for morning briefing to reference

      // Append to briefings history sheet (stacks up on dashboard — never overwrite)
      await appendRow('briefings', {
        date: dateLabel,
        briefing_text: briefText,
        source: 'email_scan',
      });

      // Send condensed version to Telegram
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID || '6912503868';
      if (botToken) {
        // Telegram message: header + first ~800 chars of brief
        const telegramMsg = `📬 *NORP Email Scan — ${dateLabel}*\n${processed.length} emails\n\n${briefText.slice(0, 3000)}`;
        const https = await import('https');
        await new Promise<void>((resolve) => {
          const body = JSON.stringify({ chat_id: chatId, text: telegramMsg, parse_mode: 'Markdown' });
          const req2 = https.default.request({
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          }, () => resolve());
          req2.on('error', () => resolve());
          req2.write(body);
          req2.end();
        });
      }
    } catch (briefErr: any) {
      console.error('[scan-email] Brief generation failed:', briefErr?.message);
    }
  }

  const summary = {
    ok: true,
    mode: hasServiceAccount() ? 'service_account_dwd' : 'oauth_fallback',
    mailboxesScanned: mailboxes.length,
    totalProcessed: processed.length,
    errors: flatResults.filter(r => r.error).length,
    results: flatResults,
  };

  return NextResponse.json(summary);
  } catch (e: any) {
    console.error('[scan-email] Fatal error:', e?.message, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error', stack: e?.stack?.slice(0,500) }, { status: 500 });
  }
}
