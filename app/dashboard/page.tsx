import { getNORPJobs, NORPJob } from '@/lib/norp-sheet';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  // Only fetch jobs server-side — it's the critical Kanban data.
  // QBO, emails, bills, inventory are loaded client-side after page load.
  let jobs: Record<string, string>[] = [];
  try {
    const norpJobs = await getNORPJobs();
    jobs = norpJobs.map((job: NORPJob): Record<string, string> => ({
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
    }));
  } catch (e) {
    console.error('Failed to load NORP jobs:', e);
  }

  // Empty defaults — client side will load these via API
  const kpiData = {
    bankAccounts: [],
    arAging: { total: 0, buckets: { current: 0, days30: 0, days60: 0, days90plus: 0 } },
    apAging: { total: 0, pendingBills: 0 },
    mtdRevenue: 0,
    nextPayroll: null,
  };

  return (
    <DashboardClient
      kpiData={kpiData}
      jobs={jobs}
      inventory={[]}
      billsInbox={[]}
      latestBriefing={null}
      latestCompoundAlert={null}
      shipments={[]}
      emailLog={[]}
    />
  );
}
