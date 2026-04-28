import { getSheet } from '@/lib/sheets';
import { getNORPJobs, NORPJob } from '@/lib/norp-sheet';
import { getBankBalances, getARaging, getAPAging, getMTDRevenue } from '@/lib/qbo';
import { getNextPayroll } from '@/lib/gusto';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const [
    norpJobs,
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
    getNORPJobs(),
    getSheet('inventory'),
    getSheet('bills_inbox', 50),
    getSheet('briefings', 10),
    getSheet('compound_alerts', 20),
    getSheet('shipments', 50),
    getSheet('email_log', 100), // limit to recent 100 entries
    getBankBalances(),
    getARaging(),
    getAPAging(),
    getMTDRevenue(),
    getNextPayroll(),
  ]);

  // Map NORPJob to Record<string, string> for DashboardClient
  const mapNORPJob = (job: NORPJob): Record<string, string> => ({
    job_id: job.job_id,
    customer: job.customer,
    matrix: job.matrix,
    quantity: job.quantity,
    colors: job.colors,
    weight: job.weight,
    speed: job.speed,
    stage: job.stage,
    ship_date: job.ship_date,
    order_number: job.order_number,
    deposit: job.deposit,
    notes: job.notes,
    due_note: job.due_note,
    lacquer: job.lacquer,
    stampers: job.stampers,
    test_pressings_sent: job.test_pressings_sent,
    test_pressings_approved: job.test_pressings_approved,
    labels_arrived: job.labels_arrived,
    sleeves_arrived: job.sleeves_arrived,
    jackets_arrived: job.jackets_arrived,
  });

  const jobs = norpJobs.status === 'fulfilled' ? norpJobs.value.map(mapNORPJob) : [];

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
      jobs={jobs}
      inventory={resolve(inventory, [])}
      billsInbox={resolve(billsInbox, [])}
      latestBriefing={resolve(briefings, []).slice(-1)[0] ?? null}
      latestCompoundAlert={resolve(compoundAlerts, []).slice(-1)[0] ?? null}
      shipments={resolve(shipments, [])}
      emailLog={resolve(emailLog, [])}
    />
  );
}
