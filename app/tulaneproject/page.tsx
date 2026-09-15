import type { Metadata } from 'next';
import DashboardClient from '../dashboard/DashboardClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Production Board — New Orleans Record Press',
  description: 'Public read-only production board for the Tulane student case study.',
};

export default function TulaneProjectPage() {
  return <DashboardClient readOnly />;
}
