import { NextRequest, NextResponse } from 'next/server';
import { refreshGustoToken, getPayrolls, getEmployees, getPaySchedules, getNextPayroll } from '@/lib/gusto';
import { upsertRow, findRow, updateRow, appendRow } from '@/lib/sheets';

async function cacheValue(key: string, value: string) {
  const existing = await findRow('qbo_cache', 'key', key);
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
    await refreshGustoToken();

    const [payrolls, employees, schedules, nextPayroll] = await Promise.all([
      getPayrolls(),
      getEmployees(),
      getPaySchedules(),
      getNextPayroll(),
    ]);

    // Upsert payroll rows
    for (const p of payrolls) {
      const totals = p.totals ?? {};
      await upsertRow('payroll', 'pay_period_start', p.pay_period?.start_date ?? '', {
        pay_period_start: p.pay_period?.start_date ?? '',
        pay_period_end: p.pay_period?.end_date ?? '',
        check_date: p.check_date ?? '',
        gross_pay: String(parseFloat(totals.gross_pay ?? '0')),
        employer_taxes: String(parseFloat(totals.employer_taxes ?? '0')),
        employer_benefits: String(parseFloat(totals.employer_benefits_contributions ?? '0')),
        total_employer_cost: String(
          parseFloat(totals.gross_pay ?? '0') +
          parseFloat(totals.employer_taxes ?? '0') +
          parseFloat(totals.employer_benefits_contributions ?? '0')
        ),
        employee_count: String(p.employee_compensations?.length ?? 0),
        hours_total: '',
        status: p.processed ? 'processed' : 'unprocessed',
        notes: '',
      });
    }

    // Upsert employee rows
    for (const e of employees) {
      const job = e.jobs?.[0] ?? {};
      await upsertRow('employees', 'gusto_employee_id', e.uuid ?? '', {
        gusto_employee_id: e.uuid ?? '',
        name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
        role: job.title ?? '',
        employment_type: e.employment_status ?? '',
        hourly_rate: String(job.rate ?? ''),
        annual_salary: '',
        start_date: e.start_date ?? '',
        active: e.terminated ? 'false' : 'true',
        notes: '',
      });
    }

    // Cache next payroll
    if (nextPayroll) {
      await cacheValue('next_payroll', JSON.stringify(nextPayroll));
    }

    return NextResponse.json({
      ok: true,
      payrolls: payrolls.length,
      employees: employees.length,
      schedules: schedules.length,
      nextPayroll,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
