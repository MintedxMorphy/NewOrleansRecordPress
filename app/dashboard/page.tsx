import { getSheet } from '@/lib/sheets';
import { getBankBalances, getARaging, getAPAging, getMTDRevenue } from '@/lib/qbo';
import { getNextPayroll } from '@/lib/gusto';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const [
    jobs,
    inventory,
    billsInbox,
    briefings,
    compoundAlerts,
    shipments,
    emailLog,
    bankAccounts,
    arAging,
    apAging,
    mtdRevenue,
    nextPayroll,
  ] = await Promise.allSettled([
    getSheet('jobs'),
    getSheet('inventory'),
    getSheet('bills_inbox'),
    getSheet('briefings'),
    getSheet('compound_alerts'),
    getSheet('shipments'),
    getSheet('email_log'),
    getBankBalances(),
    getARaging(),
    getAPAging(),
    getMTDRevenue(),
    getNextPayroll(),
  ]);

  const resolve = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const kpiData = {
    bankAccounts: resolve(bankAccounts, []),
    arAging: resolve(arAging, { total: 0, buckets: { current: 0, days30: 0, days60: 0, days90plus: 0 } }),
    apAging: resolve(apAging, { total: 0, pendingBills: 0 }),
    mtdRevenue: resolve(mtdRevenue, 0),
    nextPayroll: resolve(nextPayroll, null),
  };

  return (
    <DashboardClient
      kpiData={kpiData}
      jobs={resolve(jobs, [])}
      inventory={resolve(inventory, [])}
      billsInbox={resolve(billsInbox, [])}
      latestBriefing={resolve(briefings, []).slice(-1)[0] ?? null}
      latestCompoundAlert={resolve(compoundAlerts, []).slice(-1)[0] ?? null}
      shipments={resolve(shipments, [])}
      emailLog={resolve(emailLog, [])}
    />
  );
}
