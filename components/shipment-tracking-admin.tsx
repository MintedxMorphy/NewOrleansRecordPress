'use client';

import { useEffect, useState } from 'react';

type Props = {
  password?: string;
  showPasswordField?: boolean;
};

export function ShipmentTrackingAdmin({ password: passwordProp = '', showPasswordField = true }: Props) {
  const [password, setPassword] = useState(passwordProp);
  const [apiKey, setApiKey] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState('');
  const [lastAction, setLastAction] = useState('No run yet');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPassword(passwordProp);
  }, [passwordProp]);

  const effectivePassword = passwordProp || password;

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/admin/shipment-tracking');
      const data = await res.json();
      if (!res.ok) {
        setStatus({ error: data.error || `HTTP ${res.status}`, deploy_pending: res.status === 404 });
        return;
      }
      setStatus(data);
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const call = async (body: Record<string, unknown>) => {
    if (!effectivePassword) {
      setResult('Admin password required');
      setLastAction('Blocked');
      return;
    }
    setLoading(true);
    setLastAction(String(body.action || 'run'));
    setResult('Running...');
    try {
      const res = await fetch('/api/admin/shipment-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: effectivePassword, ...body }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
      await loadStatus();
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
        Uses GPT 5.5 to parse shipping emails/PDFs, registers real trackings in AfterShip, and writes live status to the{' '}
        <code style={{ background: '#1a1a1a', padding: '1px 4px', borderRadius: 3 }}>shipments</code> tab in NORP_OPS_DB.
      </p>

      {status?.deploy_pending && (
        <div style={{ background: '#2a2200', border: '1px solid #665500', borderRadius: 8, color: '#FFB800', fontSize: 13, marginBottom: 12, padding: '10px 12px' }}>
          Deploy still in progress — this panel is in the latest code but the API route is not live yet. Refresh in a minute or two.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: showPasswordField ? '1fr 1fr' : '1fr 1fr', marginBottom: 12 }}>
        {showPasswordField && (
          <div>
            <label style={{ color: '#888', display: 'block', fontSize: 11, letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#F0ECE2', fontSize: 13, padding: '8px 10px', width: '100%' }}
            />
          </div>
        )}
        <div>
          <label style={{ color: '#888', display: 'block', fontSize: 11, letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>AfterShip API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#F0ECE2', fontSize: 13, padding: '8px 10px', width: '100%' }}
          />
        </div>
        <div>
          <label style={{ color: '#888', display: 'block', fontSize: 11, letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>GPT / OpenAI API Key</label>
          <input
            type="password"
            value={aiApiKey}
            onChange={event => setAiApiKey(event.target.value)}
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#F0ECE2', fontSize: 13, padding: '8px 10px', width: '100%' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => void loadStatus()} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          Refresh Status
        </button>
        <button type="button" disabled={loading} onClick={() => void call({ action: 'save_key', aftership_api_key: apiKey })} style={{ background: '#2a2200', border: '1px solid #665500', borderRadius: 8, color: '#C9A84C', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          {loading ? 'Saving...' : 'Save API Key'}
        </button>
        <button type="button" disabled={loading} onClick={() => void call({ action: 'save_ai_key', shipment_ai_api_key: aiApiKey })} style={{ background: '#2a2200', border: '1px solid #665500', borderRadius: 8, color: '#C9A84C', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          {loading ? 'Saving...' : 'Save GPT Key'}
        </button>
        <button type="button" disabled={loading} onClick={() => void call({ action: 'test' })} style={{ background: '#1a1a2a', border: '1px solid #3a3a5a', borderRadius: 8, color: '#aaaaee', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          Test AfterShip
        </button>
        <button type="button" disabled={loading} onClick={() => void call({ action: 'run', dry_run: true, lookback_hours: 36 })} style={{ background: '#1A53FF22', border: '1px solid #1A53FF66', borderRadius: 8, color: '#1A53FF', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          {loading ? 'Running...' : 'Dry Run (36h)'}
        </button>
        <button type="button" disabled={loading} onClick={() => void call({ action: 'run', dry_run: true, backfill: 30 })} style={{ background: '#1A53FF22', border: '1px solid #1A53FF66', borderRadius: 8, color: '#1A53FF', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          {loading ? 'Running...' : 'Dry Run (30d)'}
        </button>
        <button type="button" disabled={loading} onClick={() => void call({ action: 'run', dry_run: false, lookback_hours: 36 })} style={{ background: '#2a2200', border: '1px solid #665500', borderRadius: 8, color: '#FFB800', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '8px 16px' }}>
          {loading ? 'Running...' : 'Run Live (36h)'}
        </button>
      </div>

      <div style={{ background: '#101826', border: '1px solid #1A53FF66', borderRadius: 8, marginBottom: 12, padding: 12 }}>
        <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <strong style={{ color: '#F0ECE2', fontSize: 14 }}>Run Output</strong>
          <span style={{ color: loading ? '#FFB800' : '#888', fontSize: 12 }}>
            {loading ? 'Running now...' : lastAction}
          </span>
        </div>
        <pre style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#F0ECE2', fontSize: 11, margin: 0, maxHeight: 420, minHeight: 72, overflow: 'auto', padding: 10, whiteSpace: 'pre-wrap' }}>
          {result || 'No run yet. Click Dry Run (36h) to scan recent shipping emails without creating AfterShip trackings.'}
        </pre>
      </div>

      <details open style={{ marginTop: 12 }}>
        <summary style={{ color: '#888', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>Connection Status</summary>
        {status && (
          <pre style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#F0ECE2', fontSize: 11, marginBottom: 12, overflowX: 'auto', padding: 10 }}>
            {JSON.stringify(status, null, 2)}
          </pre>
        )}
      </details>
    </div>
  );
}
