import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheet, findRow, appendRow } from '@/lib/sheets';

const BRIEFING_SYSTEM = `You are NORP's COO writing a 2-paragraph morning briefing for three partners of a vinyl record pressing plant. Be direct. Lead with urgent items: cash crunch, payroll runway under 2 paychecks, shipment exceptions, AR over 60 days. End with one specific suggested priority for the day. No greetings. No sign-offs.`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch cached QBO data
    const qboCache = await getSheet('qbo_cache');
    const getCache = (key: string) => qboCache.find(r => r.key === key)?.value ?? '';

    const bankBalancesRaw = getCache('bank_balances');
    const arAgingRaw = getCache('ar_aging');
    const apAgingRaw = getCache('ap_aging');
    const mtdRevenueRaw = getCache('mtd_revenue');
    const nextPayrollRaw = getCache('next_payroll');

    let bankBalances: any[] = [];
    let arAging: any = {};
    let apAging: any = {};
    let mtdRevenue = 0;
    let nextPayroll: any = null;

    try { bankBalances = JSON.parse(bankBalancesRaw); } catch {}
    try { arAging = JSON.parse(arAgingRaw); } catch {}
    try { apAging = JSON.parse(apAgingRaw); } catch {}
    try { mtdRevenue = parseFloat(mtdRevenueRaw) || 0; } catch {}
    try { nextPayroll = JSON.parse(nextPayrollRaw); } catch {}

    const cashTotal = bankBalances.reduce((s: number, a: any) => s + (a.balance ?? 0), 0);

    // Read sheets
    const [jobs, inventory, emailLog, compoundAlerts] = await Promise.all([
      getSheet('jobs'),
      getSheet('inventory'),
      getSheet('email_log'),
      getSheet('compound_alerts'),
    ]);

    const activeJobs = jobs.filter(j => j.stage !== 'paid');
    const stageBreakdown = ['quote','deposit','plates','test_pressing','approved','pressing','qc','pack','ship','paid']
      .map(s => `${s}: ${jobs.filter(j => j.stage === s).length}`)
      .join(', ');

    const lowStock = inventory.filter(r => parseFloat(r.on_hand_qty ?? '0') < parseFloat(r.reorder_point ?? '0'));

    const now = new Date();
    const last24h = now.getTime() - 24 * 60 * 60 * 1000;
    const recentEmails = emailLog.filter(e => new Date(e.timestamp || 0).getTime() > last24h);

    const latestAlert = compoundAlerts.length > 0 ? compoundAlerts[compoundAlerts.length - 1] : null;

    const payrollRunway = nextPayroll && cashTotal > 0
      ? (cashTotal / nextPayroll.totalEmployerCost).toFixed(1)
      : 'N/A';

    const shipments = await getSheet('shipments');
    const exceptions = shipments.filter(s =>
      !['delivered','returned'].includes(s.status?.toLowerCase() ?? '') &&
      s.status?.toLowerCase().includes('exception')
    );

    const dataContext = `
DATE: ${now.toISOString().split('T')[0]}

FINANCIALS:
- Cash position: $${cashTotal.toFixed(0)} across ${bankBalances.length} accounts
- AR total: $${(arAging.total ?? 0).toFixed(0)} (60d+: $${((arAging.buckets?.days60 ?? 0) + (arAging.buckets?.days90plus ?? 0)).toFixed(0)})
- AP total: $${(apAging.total ?? 0).toFixed(0)}
- MTD revenue: $${mtdRevenue.toFixed(0)}

PAYROLL:
- Next check date: ${nextPayroll?.checkDate ?? 'N/A'}
- Total employer cost: $${nextPayroll?.totalEmployerCost?.toFixed(0) ?? 'N/A'}
- Days until payroll: ${nextPayroll?.daysUntil ?? 'N/A'}
- Payroll runway (# of paychecks cash can cover): ${payrollRunway}

JOBS (${activeJobs.length} active):
${stageBreakdown}

INVENTORY:
- Low stock items: ${lowStock.length} (${lowStock.map(r => r.material).join(', ')})

EMAILS (last 24h): ${recentEmails.length} processed
- Classifications: ${recentEmails.map(e => e.classification).join(', ') || 'none'}

SHIPMENTS:
- In transit: ${shipments.filter(s => !['delivered','returned'].includes(s.status?.toLowerCase() ?? '')).length}
- Exceptions: ${exceptions.length}${exceptions.length > 0 ? ' — ' + exceptions.map(s => s.tracking_number).join(', ') : ''}

COMPOUND PRICING:
${latestAlert ? `MBR1: $${latestAlert.mbr1_value}, WLK: $${latestAlert.wlk_value}, OLN: $${latestAlert.oln_value}, CL1: $${latestAlert.cl1_value} — Level: ${latestAlert.alert_level}` : 'No data'}
`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: BRIEFING_SYSTEM,
      messages: [{ role: 'user', content: dataContext }],
    });

    const briefingText = (response.content[0] as any).text ?? '';

    await appendRow('briefings', {
      date: now.toISOString().split('T')[0],
      briefing_text: briefingText,
      cash_total: String(cashTotal.toFixed(0)),
      ar_total: String((arAging.total ?? 0).toFixed(0)),
      ap_total: String((apAging.total ?? 0).toFixed(0)),
      active_jobs_count: String(activeJobs.length),
      low_inventory_count: String(lowStock.length),
      days_to_next_payroll: String(nextPayroll?.daysUntil ?? ''),
      next_payroll_amount: String(nextPayroll?.totalEmployerCost?.toFixed(0) ?? ''),
      payroll_covered: payrollRunway,
    });

    return NextResponse.json({ ok: true, date: now.toISOString().split('T')[0], briefing: briefingText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
