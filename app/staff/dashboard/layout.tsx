'use client';

import { SessionProvider } from 'next-auth/react';
import { StaffNav } from '@/components/staff-nav';

export default function StaffDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div style={{ background: '#090909', minHeight: '100vh' }}>
        <StaffNav activeHref="/staff/dashboard" />
        {children}
      </div>
    </SessionProvider>
  );
}
