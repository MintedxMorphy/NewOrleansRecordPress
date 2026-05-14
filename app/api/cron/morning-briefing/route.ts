import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheet, findRow, appendRow, updateRow } from '@/lib/sheets';

const BRIEFING_SYSTEM = `You are NORP's COO writing a comprehensive daily intelligence report for Gregory, managing partner of New Orleans Record Press, a vinyl record pressing plant. 

Be direct, specific, and operational. No filler, no greetings, no sign-offs. Use plain text with ALL-CAPS section headers. Use dollar signs, numbers, and concrete details wherever possible.

Structure your report with these sections (use exactly these headers):

FINANCIAL SNAPSHOT
PRODUCTION PIPELINE
EMAIL INTELLIGENCE
CASH FLOW & PAYROLL
OPEN RECEIVABLES
OPEN PAYABLES
INVENTORY & SUPPLY
SHIPMENTS & LOGISTICS
RISK FLAGS
PRIORITY ACTIONS FOR TODAY

Each section should be substantive. Total length: 600-800 words. Lead with the most urgent/actionable items in each section. If data is missing or zero for a section, say so briefly and move on — don't pad.`;

async function upsertCache(key: string, value: string, cache: any[]) {
  const existing = cache.find((r: any) => r.key === key);
  const row = { key, value, updated_at: new Date().toISOString() };
  if (existing) {
    await updateRow('qbo_cache', existing.rowIndex, row);
  } else {
    await appendRow('qbo_cache', row);
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // Fetch all data sources in parallel
    const [qboCache, jobs, inventory, emailLog, compoundAlerts, shipments, billsInbox] = await Promise.all([
      getSheet('qbo_cache'),
      getSheet('jobs').catch(() => []),
      getSheet('inventory').catch(() => []),
      getSheet('email_log').catch(() => []),
      getSheet('compound_alerts').catch(() => []),
      getSheet('shipments').catch(() => []),
      getSheet('bills_inbox').catch(() => []),
    ]);

    const getCache = (key: string) => qboCache.find((r: any) => r.key === key)?.value ?? '';

    // Parse QBO cached data
    let bankBalances: any[] = [];
    let arAging: any = {};
    let apAging: any = {};
    let mtdRevenue = 0;
    let nextPayroll: any = null;

    try { bankBalances = JSON.parse(getCache('bank_balances')); } catch {}
    try { arAging = JSON.parse(getCache('ar_aging')); } catch {}
    try { apAging = JSON.parse(getCache('ap_aging')); } catch {}
    try { mtdRevenue = parseFloat(getCache('mtd_revenue')) || 0; } catch {}
    try { nextPayroll = JSON.parse(getCache('next_payroll')); } catch {}

    const cashTotal = bankBalances.reduce((s: number, a: any) => s + (a.balance ?? 0), 0);
    const payrollRunway = nextPayroll?.totalEmployerCost
      ? (cashTotal / nextPayroll.totalEmployerCost).toFixed(1)
      : 'N/A';

    // Jobs analysis
    const activeJobs = (jobs as any[]).filter((j: any) => j.stage !== 'paid');
    const stageBreakdown = ['quote','deposit','plates','test_pressing','approved','pressing','qc','pack','ship']
      .map(s => `${s}: ${(jobs as any[]).filter((j: any) => j.stage === s).length}`)
      .filter(s => !s.endsWith(': 0'))
      .join(' | ');

    // Email intel (last 48h for morning brief)
    const last48h = now.getTime() - 48 * 60 * 60 * 1000;
    const recentEmails = (emailLog as any[]).filter((e: any) => new Date(e.timestamp || 0).getTime() > last48h);
    const emailByClass: Record<string, any[]> = {};
    for (const e of recentEmails) {
      const c = e.classification ?? 'other';
      if (!emailByClass[c]) emailByClass[c] = [];
      emailByClass[c].push(e);
    }

    // Inventory low stock
    const lowStock = (inventory as any[]).filter((r: any) =>
      parseFloat(r.on_hand_qty ?? '0') < parseFloat(r.reorder_point ?? '0')
    );

    // Shipment exceptions
    const inTransit = (shipments as any[]).filter((s: any) =>
      !['delivered','returned'].includes((s.status ?? '').toLowerCase())
    );
    const exceptions = inTransit.filter((s: any) =>
      (s.status ?? '').toLowerCase().includes('exception')
    );

    // Bills inbox
    const newBills = (billsInbox as any[]).filter((b: any) => b.status === 'new');
    const billsTotal = newBills.reduce((s: number, b: any) => s + (parseFloat(b.amount_usd) || 0), 0);

    // Compound data
    const latestAlert = (compoundAlerts as any[]).slice(-1)[0] ?? null;

    // Get latest email brief if available (from recent scan)
    const emailBriefCache = getCache('email_intel_summary');

    const dataContext = `
DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' })} CDT

=== FINANCIAL DATA ===
Bank accounts: ${bankBalances.map((a: any) => `${a.accountName}: $${a.balance?.toFixed(0)}`).join(', ') || 'No data'}
Total cash: $${cashTotal.toFixed(0)}
AR total: $${(arAging.total ?? 0).toFixed(0)}
  - Current: $${(arAging.buckets?.current ?? 0).toFixed(0)}
  - 30d: $${(arAging.buckets?.days30 ?? 0).toFixed(0)}
  - 60d: $${(arAging.buckets?.days60 ?? 0).toFixed(0)}
  - 90d+: $${(arAging.buckets?.days90plus ?? 0).toFixed(0)}
AP total: $${(apAging.total ?? 0).toFixed(0)} (${apAging.pendingBills ?? 0} open bills)
MTD revenue: $${mtdRevenue.toFixed(0)}
Next payroll: ${nextPayroll?.checkDate ?? 'N/A'} | Amount: $${nextPayroll?.totalEmployerCost?.toFixed(0) ?? 'N/A'} | Days away: ${nextPayroll?.daysUntil ?? 'N/A'}
Payroll runway: ${payrollRunway} paychecks

=== JOBS ===
Total active: ${activeJobs.length}
Stage breakdown: ${stageBreakdown || 'No active jobs'}
Recent jobs (last 5): ${activeJobs.slice(-5).map((j: any) => `${j.job_id} (${j.customer}, ${j.format}, ${j.stage})`).join(' | ') || 'none'}

=== EMAIL INTELLIGENCE (last 48h) ===
Total processed: ${recentEmails.length}
Quote requests: ${(emailByClass.quote_request ?? []).length}${(emailByClass.quote_request ?? []).length > 0 ? ' — ' + (emailByClass.quote_request ?? []).map((e: any) => e.summary).join(' | ') : ''}
Order updates: ${(emailByClass.order_update ?? []).length}${(emailByClass.order_update ?? []).length > 0 ? ' — ' + (emailByClass.order_update ?? []).slice(0, 5).map((e: any) => e.summary).join(' | ') : ''}
Vendor invoices: ${(emailByClass.vendor_invoice ?? []).length}${(emailByClass.vendor_invoice ?? []).length > 0 ? ' — ' + (emailByClass.vendor_invoice ?? []).map((e: any) => `${e.summary} ($${e.amount_usd ?? '?'})`).join(' | ') : ''}
Payments received: ${(emailByClass.payment_received ?? []).length}${(emailByClass.payment_received ?? []).length > 0 ? ' — ' + (emailByClass.payment_received ?? []).map((e: any) => e.summary).join(' | ') : ''}
Shipping updates: ${(emailByClass.shipping_update ?? []).length}
${emailBriefCache ? `\nRECENT EMAIL SCAN SUMMARY:\n${emailBriefCache}` : ''}

=== BILLS INBOX ===
New unreviewed bills: ${newBills.length} totaling $${billsTotal.toFixed(0)}
${newBills.slice(0, 5).map((b: any) => `  - ${b.vendor_guess || b.sender}: $${b.amount_usd} due ${b.due_date || 'N/A'}`).join('\n') || '  None pending'}

=== INVENTORY ===
Low stock items: ${lowStock.length}
${lowStock.map((r: any) => `  - ${r.material}: ${r.on_hand_qty} on hand (reorder at ${r.reorder_point})`).join('\n') || '  All stock levels OK'}

=== SHIPMENTS ===
In transit: ${inTransit.length}
Exceptions: ${exceptions.length}${exceptions.length > 0 ? ' — ' + exceptions.map((s: any) => s.tracking_number).join(', ') : ''}

=== COMPOUND PRICING ===
${latestAlert ? `MBR1: $${latestAlert.mbr1_value} | WLK: $${latestAlert.wlk_value} | OLN: $${latestAlert.oln_value} | CL1: $${latestAlert.cl1_value} | Alert level: ${latestAlert.alert_level}` : 'No compound data available'}
`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: BRIEFING_SYSTEM,
      messages: [{ role: 'user', content: dataContext }],
    });

    const briefingText = (response.content[0] as any).text ?? '';
    const dateStr = now.toISOString().split('T')[0];

    // Write to qbo_cache for dashboard
    const freshCache = await getSheet('qbo_cache');
    await Promise.all([
      upsertCache('latest_briefing_text', briefingText, freshCache),
      upsertCache('latest_briefing_date', `${dateStr} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' })} CDT`, freshCache),
      upsertCache('latest_briefing_source', 'morning_briefing', freshCache),
    ]);

    // Append to briefings history sheet (never overwrite — stacks up for dashboard history)
    await appendRow('briefings', {
      date: `${dateStr} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' })} CDT`,
      briefing_text: briefingText,
      source: 'morning_briefing',
      cash_total: String(cashTotal.toFixed(0)),
      ar_total: String((arAging.total ?? 0).toFixed(0)),
      ap_total: String((apAging.total ?? 0).toFixed(0)),
      active_jobs_count: String(activeJobs.length),
      low_inventory_count: String(lowStock.length),
      days_to_next_payroll: String(nextPayroll?.daysUntil ?? ''),
      next_payroll_amount: String(nextPayroll?.totalEmployerCost?.toFixed(0) ?? ''),
      payroll_covered: payrollRunway,
    });

    return NextResponse.json({ ok: true, date: dateStr, briefing: briefingText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
