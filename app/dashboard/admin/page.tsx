import { redirect } from 'next/navigation';

export default function DashboardAdminRedirect() {
  redirect('/admin?tab=shipments');
}
