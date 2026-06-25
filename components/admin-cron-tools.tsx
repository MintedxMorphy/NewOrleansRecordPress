'use client';

import { useState } from 'react';

const btnStyle = {
  background: '#1A53FF22',
  border: '1px solid #1A53FF66',
  borderRadius: 8,
  color: '#1A53FF',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 16px',
} as const;

function CronTrigger({ label, path }: { label: string; path: string }) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult('Running...');
    try {
      const res = await fetch(path);
      const text = await res.text();
      try {
        setResult(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResult(text.slice(0, 2000));
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <button type="button" onClick={run} style={btnStyle}>{loading ? 'Running...' : `Run ${label}`}</button>
        <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{path}</span>
      </div>
      {result && (
        <pre style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#F0ECE2', fontSize: 11, maxHeight: 200, overflow: 'auto', padding: 10 }}>
          {result}
        </pre>
      )}
    </div>
  );
}

export function AdminCronTools() {
  return (
    <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #2a2a2a' }}>
      <h3 style={{ color: '#F0ECE2', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Manual Cron Triggers</h3>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Ops tools — normally run on schedule via Vercel.</p>
      <CronTrigger label="Shipment Tracking (dry run)" path="/api/cron/shipment-tracking?dry_run=1" />
      <CronTrigger label="Scan Email" path="/api/cron/scan-email" />
      <CronTrigger label="QBO Sync" path="/api/cron/qbo-sync" />
      <CronTrigger label="UPS Tracking" path="/api/cron/ups-tracking" />
      <CronTrigger label="Morning Briefing" path="/api/cron/morning-briefing" />
    </div>
  );
}
