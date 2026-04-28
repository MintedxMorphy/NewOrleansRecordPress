'use client';

import { useState } from 'react';

const COLORS = {
  bg: '#0A0A0A', card: '#141414', elevated: '#1A1A1A',
  green: '#00E86A', purple: '#8B3FCF', gold: '#C9A84C',
  text: '#E8E8E8', muted: '#9A9A9A', border: '#2A2A2A',
  red: '#FF4444', yellow: '#FFB800',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
      <h2 style={{ color: COLORS.green, fontWeight: 700, fontSize: '15px', marginBottom: '16px', letterSpacing: '-0.2px' }}>{title}</h2>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: COLORS.elevated, border: `1px solid ${COLORS.border}`, borderRadius: '6px', padding: '8px 10px', color: COLORS.text, fontSize: '13px', outline: 'none' }}
      />
    </div>
  );
}

function Btn({ children, onClick, color = COLORS.green }: { children: React.ReactNode; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{ background: color + '22', border: `1px solid ${color}66`, borderRadius: '6px', padding: '8px 16px', color, fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
    >
      {children}
    </button>
  );
}

function CronTrigger({ label, path }: { label: string; path: string }) {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    setResult('Running...');
    try {
      const res = await fetch(path);
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(`Error: ${e?.message}`);
    }
    setLoading(false);
  };
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Btn onClick={run}>{loading ? 'Running...' : `Run ${label}`}</Btn>
        <span style={{ color: COLORS.muted, fontSize: '12px', fontFamily: 'monospace' }}>{path}</span>
      </div>
      {result && (
        <pre style={{ background: COLORS.elevated, border: `1px solid ${COLORS.border}`, borderRadius: '6px', padding: '10px', fontSize: '11px', color: COLORS.text, overflowX: 'auto', maxHeight: '200px', overflowY: 'auto' }}>
          {result}
        </pre>
      )}
    </div>
  );
}

const STAGES = ['quote','deposit','plates','test_pressing','approved','pressing','qc','pack','ship','paid'];
const STAGE_LABELS: Record<string, string> = {
  quote: 'Quote', deposit: 'Deposit', plates: 'Plates', test_pressing: 'Test Press',
  approved: 'Approved', pressing: 'Pressing', qc: 'QC', pack: 'Pack', ship: 'Ship', paid: 'Paid',
};

// ── Add Job Form ──────────────────────────────────────────────────────────────

function AddJobForm() {
  const [form, setForm] = useState({ customer: '', contact_email: '', format: '', quantity: '', color: '', stage: 'quote', notes: '' });
  const [status, setStatus] = useState('');
  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.customer) { setStatus('Customer name required'); return; }
    try {
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setStatus(data.ok ? `Created job ${data.job_id}` : `Error: ${data.error}`);
      if (data.ok) setForm({ customer: '', contact_email: '', format: '', quantity: '', color: '', stage: 'quote', notes: '' });
    } catch (e: any) { setStatus(`Error: ${e?.message}`); }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Input label="Customer / Artist / Label" value={form.customer} onChange={set('customer')} />
        <Input label="Contact Email" value={form.contact_email} onChange={set('contact_email')} type="email" />
        <Input label="Format (LP 12inch / 7inch / etc)" value={form.format} onChange={set('format')} />
        <Input label="Quantity" value={form.quantity} onChange={set('quantity')} type="number" />
        <Input label="Color / Vinyl Type" value={form.color} onChange={set('color')} />
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Stage</label>
          <select
            value={form.stage}
            onChange={e => set('stage')(e.target.value)}
            style={{ width: '100%', background: COLORS.elevated, border: `1px solid ${COLORS.border}`, borderRadius: '6px', padding: '8px 10px', color: COLORS.text, fontSize: '13px', outline: 'none' }}
          >
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Input label="Notes" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <Btn onClick={submit}>Add Job</Btn>
      {status && <div style={{ marginTop: '8px', fontSize: '12px', color: status.startsWith('Error') ? COLORS.red : COLORS.green }}>{status}</div>}
    </div>
  );
}

// ── Add Customer Form ──────────────────────────────────────────────────────────

function AddCustomerForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [status, setStatus] = useState('');
  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name) { setStatus('Name required'); return; }
    try {
      const res = await fetch('/api/admin/add-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: 'customers', row: { ...form, first_order_date: new Date().toISOString().split('T')[0] } }),
      });
      const data = await res.json();
      setStatus(data.ok ? 'Customer added' : `Error: ${data.error}`);
      if (data.ok) setForm({ name: '', email: '', phone: '', notes: '' });
    } catch (e: any) { setStatus(`Error: ${e?.message}`); }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Input label="Name" value={form.name} onChange={set('name')} />
        <Input label="Email" value={form.email} onChange={set('email')} type="email" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} />
        <Input label="Notes" value={form.notes} onChange={set('notes')} />
      </div>
      <Btn onClick={submit}>Add Customer</Btn>
      {status && <div style={{ marginTop: '8px', fontSize: '12px', color: status.startsWith('Error') ? COLORS.red : COLORS.green }}>{status}</div>}
    </div>
  );
}

// ── Add Vendor / Inventory ─────────────────────────────────────────────────────

function AddInventoryForm() {
  const [form, setForm] = useState({ material: '', sku: '', on_hand_qty: '', unit: '', reorder_point: '', supplier: '', unit_cost: '', notes: '' });
  const [status, setStatus] = useState('');
  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.material) { setStatus('Material required'); return; }
    try {
      const res = await fetch('/api/admin/add-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: 'inventory', row: form }),
      });
      const data = await res.json();
      setStatus(data.ok ? 'Inventory row added' : `Error: ${data.error}`);
      if (data.ok) setForm({ material: '', sku: '', on_hand_qty: '', unit: '', reorder_point: '', supplier: '', unit_cost: '', notes: '' });
    } catch (e: any) { setStatus(`Error: ${e?.message}`); }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Input label="Material" value={form.material} onChange={set('material')} />
        <Input label="SKU" value={form.sku} onChange={set('sku')} />
        <Input label="On Hand Qty" value={form.on_hand_qty} onChange={set('on_hand_qty')} type="number" />
        <Input label="Unit (kg/ea/etc)" value={form.unit} onChange={set('unit')} />
        <Input label="Reorder Point" value={form.reorder_point} onChange={set('reorder_point')} type="number" />
        <Input label="Supplier" value={form.supplier} onChange={set('supplier')} />
        <Input label="Unit Cost" value={form.unit_cost} onChange={set('unit_cost')} type="number" />
        <Input label="Notes" value={form.notes} onChange={set('notes')} />
      </div>
      <Btn onClick={submit}>Add Inventory</Btn>
      {status && <div style={{ marginTop: '8px', fontSize: '12px', color: status.startsWith('Error') ? COLORS.red : COLORS.green }}>{status}</div>}
    </div>
  );
}

// ── Token refresh ──────────────────────────────────────────────────────────────

function TokenRefresh({ label, path, method = 'POST' }: { label: string; path: string; method?: string }) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(path, { method });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) { setResult(`Error: ${e?.message}`); }
    setLoading(false);
  };
  return (
    <div style={{ marginBottom: '12px' }}>
      <Btn onClick={run} color={COLORS.gold}>{loading ? 'Refreshing...' : label}</Btn>
      {result && (
        <pre style={{ background: COLORS.elevated, border: `1px solid ${COLORS.border}`, borderRadius: '6px', padding: '8px', fontSize: '11px', color: COLORS.text, marginTop: '8px', overflowX: 'auto' }}>
          {result}
        </pre>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ color: COLORS.text, fontWeight: 700, fontSize: '22px', marginBottom: '24px', letterSpacing: '-0.5px' }}>
        Admin Panel
      </h1>

      <Card title="Add Job">
        <AddJobForm />
      </Card>

      <Card title="Add Customer">
        <AddCustomerForm />
      </Card>

      <Card title="Add / Update Inventory">
        <AddInventoryForm />
      </Card>

      <Card title="Trigger Cron Jobs">
        <CronTrigger label="Scan Email" path="/api/cron/scan-email" />
        <CronTrigger label="Seed Jobs from Email History" path="/api/cron/seed-jobs" />
        <CronTrigger label="QBO Sync" path="/api/cron/qbo-sync" />
        <CronTrigger label="Compound Check" path="/api/cron/compound-check" />
        <CronTrigger label="UPS Tracking" path="/api/cron/ups-tracking" />
        <CronTrigger label="Gusto Sync" path="/api/cron/gusto-sync" />
        <CronTrigger label="Morning Briefing" path="/api/cron/morning-briefing" />
      </Card>

      <Card title="Token Management">
        <TokenRefresh label="Refresh QBO Token" path="/api/qbo/refresh" />
        <TokenRefresh label="Refresh Gusto Token" path="/api/gusto/refresh" />
      </Card>

      <Card title="Google OAuth">
        <p style={{ color: COLORS.muted, fontSize: '13px', marginBottom: '12px' }}>
          Connect Google to authorize Sheets, Drive, and Gmail access. After connecting, copy the refresh token from Vercel logs and set it as <code style={{ background: COLORS.elevated, padding: '1px 4px', borderRadius: '3px' }}>GOOGLE_REFRESH_TOKEN</code>.
        </p>
        <a href="/api/auth/google/connect" style={{ display: 'inline-block', background: COLORS.green + '22', border: `1px solid ${COLORS.green}66`, borderRadius: '6px', padding: '8px 16px', color: COLORS.green, fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          Connect Google Drive &amp; Sheets
        </a>
      </Card>

      <Card title="Claude API Usage">
        <div style={{ color: COLORS.muted, fontSize: '13px' }}>
          Claude API usage is not available via API at this time.
          <br />
          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.green, textDecoration: 'none' }}>
            Check Anthropic Console →
          </a>
        </div>
      </Card>
    </div>
  );
}
