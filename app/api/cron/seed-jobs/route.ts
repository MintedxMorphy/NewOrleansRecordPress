import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheet, appendRow } from '@/lib/sheets';

const SEED_PROMPT = `You are analyzing email logs from New Orleans Record Press (NORP), a vinyl record pressing plant. Based on these email summaries, identify distinct pressing orders/jobs that appear to be active or recent.

For each distinct job you identify, extract:
- customer_name: the artist, band, or label name
- format: LP 12inch, 7inch, test pressing, picture disc, colored vinyl, etc.
- quantity: number of records if mentioned (as integer)
- stage: best guess at current stage from: quote, deposit, plates, test_pressing, approved, pressing, qc, pack, ship, paid
- notes: relevant details (album title, color, special instructions, etc.)
- contact_email: sender email address if it appears to be from the customer

Rules:
- Only create ONE job entry per distinct pressing order (deduplicate)
- Skip if it's clearly a vendor invoice or shipping notification (no customer job)
- If unsure about quantity or format, leave as null
- Estimate the stage based on context clues (e.g. "test pressings approved" → approved, "mastering complete" → plates, "order received" → deposit)
- Focus on emails classified as order_update or quote_request

Return a JSON array of jobs (can be empty if no jobs found):
[
  {
    "customer_name": "string",
    "format": "string or null",
    "quantity": number or null,
    "stage": "quote|deposit|plates|test_pressing|approved|pressing|qc|pack|ship|paid",
    "notes": "string",
    "contact_email": "string or null"
  }
]

Email log entries (subject, summary, from, classification, timestamp):
{{EMAIL_LOG}}`;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Read email_log — focus on order_update and quote_request entries
    const emailLog = await getSheet('email_log');
    const relevant = emailLog.filter(e =>
      ['order_update', 'quote_request', 'shipping_update'].includes(e.classification)
    );

    if (relevant.length === 0) {
      return NextResponse.json({ ok: true, message: 'No relevant emails found in email_log to seed from', created: 0 });
    }

    // Format email log for the prompt (cap at 100 entries to stay within token limits)
    const entries = relevant.slice(-100).map(e =>
      `[${e.timestamp?.slice(0, 10) ?? '?'}] FROM: ${e.from} | SUBJECT: ${e.subject} | CLASS: ${e.classification} | SUMMARY: ${e.summary}`
    ).join('\n');

    const prompt = SEED_PROMPT.replace('{{EMAIL_LOG}}', entries);

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (claudeRes.content[0] as any).text ?? '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: 'Claude returned no valid JSON array', raw: raw.slice(0, 500) });
    }

    const inferredJobs: any[] = JSON.parse(jsonMatch[0]);

    // Load existing jobs to avoid duplicates
    const existingJobs = await getSheet('jobs');
    const existingCustomers = new Set(
      existingJobs.map(j => j.customer?.toLowerCase().trim()).filter(Boolean)
    );

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const created: string[] = [];
    const skipped: string[] = [];

    for (const job of inferredJobs) {
      if (!job.customer_name) continue;

      const normalizedName = job.customer_name.toLowerCase().trim();

      // Skip if a job for this customer already exists
      if (existingCustomers.has(normalizedName)) {
        skipped.push(job.customer_name);
        continue;
      }

      const jobId = `NORP-${year}${month}${day}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

      await appendRow('jobs', {
        job_id: jobId,
        customer: job.customer_name,
        contact_email: job.contact_email ?? '',
        format: job.format ?? '',
        quantity: job.quantity != null ? String(job.quantity) : '',
        color: '', weight_g: '', package_type: '',
        stage: job.stage ?? 'quote',
        quote_date: now.toISOString().split('T')[0],
        deposit_date: '', ship_date_target: '', pvc_kg_needed: '',
        sleeves_needed: '', jackets_needed: '', labels_needed: '',
        total_price: '', deposit_received: '', balance_due: '',
        assigned_press: '', tracking_number: '', ups_service: '',
        shipping_cost: '', ship_status: '', delivery_date: '',
        notes: `[Seeded from email history] ${job.notes ?? ''}`.trim(),
      });

      existingCustomers.add(normalizedName);
      created.push(`${jobId}: ${job.customer_name} (${job.format ?? '?'} × ${job.quantity ?? '?'}) → ${job.stage}`);
    }

    return NextResponse.json({
      ok: true,
      emailsAnalyzed: relevant.length,
      jobsInferred: inferredJobs.length,
      created: created.length,
      skipped: skipped.length,
      createdJobs: created,
      skippedCustomers: skipped,
    });

  } catch (e: any) {
    console.error('[seed-jobs] Fatal error:', e?.message, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
