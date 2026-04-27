'use client';

import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/api/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#00E86A', fontFamily: 'monospace', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', color: '#E8E8E8', fontFamily: 'var(--font-sans, sans-serif)' }}>
      {/* Nav */}
      <nav style={{
        background: '#141414',
        borderBottom: '1px solid #2A2A2A',
        padding: '0 24px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#00E86A', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.5px' }}>
            NORP
          </span>
          <span style={{ color: '#2A2A2A' }}>|</span>
          <span style={{ color: '#9A9A9A', fontSize: '14px' }}>Operations Dashboard</span>
          <a href="/dashboard" style={{ color: '#9A9A9A', fontSize: '13px', marginLeft: '16px', textDecoration: 'none' }}>Home</a>
          <a href="/dashboard/admin" style={{ color: '#9A9A9A', fontSize: '13px', textDecoration: 'none' }}>Admin</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {session?.user?.image && (
            <img
              src={session.user.image}
              alt={session.user.name ?? ''}
              width={32}
              height={32}
              style={{ borderRadius: '50%', border: '2px solid #2A2A2A' }}
            />
          )}
          <span style={{ color: '#9A9A9A', fontSize: '13px' }}>{session?.user?.email}</span>
          <button
            onClick={() => signOut()}
            style={{
              background: 'transparent',
              border: '1px solid #2A2A2A',
              color: '#9A9A9A',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Sign out
          </button>
        </div>
      </nav>
      <main style={{ padding: '24px' }}>
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DashboardInner>{children}</DashboardInner>
    </SessionProvider>
  );
}
