import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

// Minimal server component — all data loads client-side via API calls
// This keeps the initial page response small and fast
export default function DashboardPage() {
  return <DashboardClient />;
}
