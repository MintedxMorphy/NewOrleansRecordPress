'use client';

import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { format, parseISO, isValid } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankAccount { accountName: string; balance: number }
interface ARBuckets { current: number; days30: number; days60: number; days90plus: number }
interface ARData { total: number; buckets: ARBuckets }
interface APData { total: number; pendingBills: number }
interface NextPayroll { checkDate: string; grossPay: number; employerTaxes: number; employerBenefits: number; totalEmployerCost: number; daysUntil: number }

interface KpiData {
  bankAccounts: BankAccount[];
  arAging: ARData;
  apAging: APData;
  mtdRevenue: number;
  nextPayroll: NextPayroll | null;
}

interface Job { [key: string]: string }
interface InventoryRow { [key: string]: string }
interface BillRow { [key: string]: string }
interface ShipmentRow { [key: string]: string }
interface EmailLogRow { [key: string]: string }

interface Props {
  // All props are now optional — data loads client-side via API
  kpiData?: KpiData;
  jobs?: Job[];
  inventory?: InventoryRow[];
  billsInbox?: BillRow[];
  latestBriefing?: Record<string, string> | null;
  latestCompoundAlert?: Record<string, string> | null;
  shipments?: ShipmentRow[];
  emailLog?: EmailLogRow[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGES = ['quote','deposit','plates','test_pressing','approved','pressing','qc','pack','ship','paid'] as const;
type Stage = typeof STAGES[number];

const STAGE_LABELS: Record<Stage, string> = {
  quote: 'Quote', deposit: 'Deposit', plates: 'Plates', test_pressing: 'Test Press',
  approved: 'Approved', pressing: 'Pressing', qc: 'QC', pack: 'Pack', ship: 'Ship', paid: 'Paid',
};

const COLORS = {
  bg: '#0A0A0A', card: '#141414', elevated: '#1A1A1A',
  green: '#00E86A', purple: '#8B3FCF', gold: '#C9A84C',
  text: '#E8E8E8', muted: '#9A9A9A', border: '#2A2A2A',
  red: '#FF4444', yellow: '#FFB800', orange: '#FF8C00',
};

const fmt$ = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

// ── Card wrapper ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '10px',
      padding: '16px', ...style,
    }}>
      {children}
    </div>
  );
}

function KpiLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{children}</div>;
}

function BigNumber({ value, color }: { value: string; color?: string }) {
  return <div style={{ fontSize: '32px', fontWeight: 700, color: color ?? COLORS.text, lineHeight: 1.1 }}>{value}</div>;
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────

function CashCard({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const total = bankAccounts.reduce((s, a) => s + a.balance, 0);
  return (
    <Card>
      <KpiLabel>Cash Position</KpiLabel>
      <BigNumber value={fmt$(total)} color={total >= 0 ? COLORS.green : COLORS.red} />
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {bankAccounts.map((a) => (
          <div key={a.accountName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: COLORS.muted }}>{a.accountName}</span>
            <span style={{ color: a.balance >= 0 ? COLORS.text : COLORS.red }}>{fmt$(a.balance)}</span>
          </div>
        ))}
        {bankAccounts.length === 0 && <span style={{ color: COLORS.muted, fontSize: '12px' }}>No accounts synced</span>}
      </div>
    </Card>
  );
}

function ARCard({ arAging }: { arAging: ARData }) {
  const { total, buckets } = arAging;
  const badgeColors = [COLORS.green, COLORS.yellow, COLORS.orange, COLORS.red];
  const labels = ['Current', '30d', '60d', '90d+'];
  const vals = [buckets.current, buckets.days30, buckets.days60, buckets.days90plus];
  return (
    <Card>
      <KpiLabel>AR Aging</KpiLabel>
      <BigNumber value={fmt$(total)} />
      <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {labels.map((l, i) => (
          <div key={l} style={{ background: badgeColors[i] + '22', border: `1px solid ${badgeColors[i]}44`, borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>
            <span style={{ color: badgeColors[i], fontWeight: 600 }}>{l}</span>
            <span style={{ color: COLORS.text, marginLeft: '4px' }}>{fmt$(vals[i])}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BillsCard({ billsInbox }: { billsInbox: BillRow[] }) {
  const newBills = billsInbox.filter(b => b.status === 'new');
  const totalValue = newBills.reduce((s, b) => s + (parseFloat(b.amount_usd) || 0), 0);
  const isHigh = newBills.length > 5;
  return (
    <Card style={{ borderColor: isHigh ? COLORS.red + '66' : COLORS.border }}>
      <KpiLabel>Bills Awaiting Approval</KpiLabel>
      <BigNumber value={String(newBills.length)} color={isHigh ? COLORS.red : COLORS.text} />
      <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.muted }}>
        Total value: <span style={{ color: COLORS.text }}>{fmt$(totalValue)}</span>
      </div>
    </Card>
  );
}

function ActiveJobsCard({ jobs, inventory }: { jobs: Job[]; inventory: InventoryRow[] }) {
  const activeJobs = jobs.filter(j => j.stage !== 'paid');
  const pvcRow = inventory.find(i => i.material?.toLowerCase().includes('pvc') || i.sku?.toLowerCase().includes('pvc'));
  const pvcOnHand = parseFloat(pvcRow?.on_hand_qty ?? '999999');
  const atRisk = activeJobs.filter(j => parseFloat(j.pvc_kg_needed || '0') > pvcOnHand).length;
  return (
    <Card>
      <KpiLabel>Active Jobs</KpiLabel>
      <BigNumber value={String(activeJobs.length)} />
      {atRisk > 0 && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.red }}>{atRisk} job{atRisk > 1 ? 's' : ''} at risk — low PVC</div>
      )}
    </Card>
  );
}

function ShipmentsCard({ shipments }: { shipments: ShipmentRow[] }) {
  const inTransit = shipments.filter(s => !['delivered','returned'].includes(s.status?.toLowerCase() ?? ''));
  const exceptions = inTransit.filter(s => s.exception && s.exception !== '');
  return (
    <Card>
      <KpiLabel>Shipments In Transit</KpiLabel>
      <BigNumber value={String(inTransit.length)} />
      {exceptions.length > 0 && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.red }}>{exceptions.length} exception{exceptions.length > 1 ? 's' : ''}</div>
      )}
    </Card>
  );
}

function ShippingCostCard({ shipments, mtdRevenue }: { shipments: ShipmentRow[]; mtdRevenue: number }) {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mtdShipments = shipments.filter(s => (s.shipped_date ?? '').startsWith(monthStr));
  const mtdCost = mtdShipments.reduce((s, sh) => s + (parseFloat(sh.total_cost) || 0), 0);
  const pct = mtdRevenue > 0 ? (mtdCost / mtdRevenue) * 100 : 0;
  const pctColor = pct > 12 ? COLORS.red : pct > 8 ? COLORS.yellow : COLORS.text;
  return (
    <Card>
      <KpiLabel>Shipping Cost MTD</KpiLabel>
      <BigNumber value={fmt$(mtdCost)} />
      <div style={{ marginTop: '6px', fontSize: '12px', color: pctColor }}>
        {pct.toFixed(1)}% of MTD revenue ({fmt$(mtdRevenue)})
      </div>
    </Card>
  );
}

function PayrollCard({ nextPayroll, bankAccounts }: { nextPayroll: NextPayroll | null; bankAccounts: BankAccount[] }) {
  const cash = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const isTight = nextPayroll ? cash < nextPayroll.totalEmployerCost * 1.5 : false;
  return (
    <Card style={{ border: isTight ? `1px solid ${COLORS.red}` : `1px solid ${COLORS.border}`, boxShadow: isTight ? `0 0 12px ${COLORS.red}44` : undefined }}>
      <KpiLabel>Next Payroll</KpiLabel>
      {nextPayroll ? (
        <>
          <BigNumber value={fmt$(nextPayroll.totalEmployerCost)} color={isTight ? COLORS.red : COLORS.text} />
          <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.muted }}>
            Due: <span style={{ color: COLORS.text }}>{nextPayroll.checkDate}</span>
            <span style={{ marginLeft: '8px', color: isTight ? COLORS.red : COLORS.muted }}>({nextPayroll.daysUntil}d away)</span>
          </div>
        </>
      ) : (
        <div style={{ color: COLORS.muted, fontSize: '13px', marginTop: '8px' }}>No payroll data</div>
      )}
    </Card>
  );
}

// ── Kanban ─────────────────────────────────────────────────────────────────────

const POST_PLATES_STAGES = new Set(['plates','test_pressing','approved','pressing','qc','pack','ship','paid']);

function JobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const isShipping = job.stage === 'ship';
  const customerDisplay = job.customer?.length > 50 ? job.customer.slice(0, 50) + '…' : job.customer;
  const artExt = job as unknown as { art_received?: boolean; art_received_date?: string; art_sides?: string };
  const artReceived = !!artExt.art_received;
  const artDate = artExt.art_received_date ?? '';
  const artSides = artExt.art_sides ?? '';
  const showNoArtWarning = !artReceived && POST_PLATES_STAGES.has(job.stage);

  return (
    <div
      onClick={onClick}
      style={{
        background: COLORS.elevated, border: `1px solid ${COLORS.border}`, borderRadius: '8px',
        padding: '10px', marginBottom: '6px', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = COLORS.green + '66')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = COLORS.border)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ color: COLORS.green, fontWeight: 700, fontSize: '13px' }}>{customerDisplay}</span>
      </div>
      {job.matrix && (
        <div style={{ fontSize: '11px', color: COLORS.muted, marginTop: '2px', fontFamily: 'monospace' }}>{job.matrix}</div>
      )}
      <div style={{ fontSize: '12px', color: COLORS.text, marginTop: '4px' }}>
        {job.quantity && <span>{job.quantity}</span>}
        {job.quantity && job.colors && <span style={{ color: COLORS.muted }}> × </span>}
        {job.colors && <span style={{ color: COLORS.gold }}>{job.colors}</span>}
      </div>
      {artReceived && (
        <div style={{ marginTop: '4px', background: COLORS.green + '22', border: `1px solid ${COLORS.green}66`, borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: COLORS.green, fontWeight: 600 }}>
          🎨 Art {artSides && <span style={{ color: COLORS.text }}>{artSides}</span>}{artDate && <span style={{ color: COLORS.muted, marginLeft: '4px' }}>{artDate}</span>}
        </div>
      )}
      {showNoArtWarning && (
        <div style={{ marginTop: '4px', background: COLORS.yellow + '22', border: `1px solid ${COLORS.yellow}66`, borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: COLORS.yellow, fontWeight: 600 }}>
          ⚠️ No art
        </div>
      )}
      {job.due_note && (
        <div style={{ marginTop: '4px', background: COLORS.red + '22', border: `1px solid ${COLORS.red}66`, borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: COLORS.red, fontWeight: 600 }}>
          {job.due_note}
        </div>
      )}
      {isShipping && job.ship_date && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: COLORS.muted }}>Shipped: {job.ship_date}</div>
      )}
    </div>
  );
}

function KanbanBoard({ jobs, onJobUpdate, onJobClick }: {
  jobs: Job[];
  onJobUpdate: (jobs: Job[]) => void;
  onJobClick: (job: Job) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div style={{ color: '#9A9A9A', padding: '20px', fontSize: '13px' }}>Loading board...</div>;

  const byStage = (stage: Stage) => jobs.filter(j => j.stage === stage);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const jobId = result.draggableId;
    const newStage = result.destination.droppableId as Stage;
    const updated = jobs.map(j => j.job_id === jobId ? { ...j, stage: newStage } : j);
    onJobUpdate(updated);
    try {
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch (e) { console.error(e); }
  };

  if (jobs.length === 0) {
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '10px', padding: '32px', textAlign: 'center' }}>
        <div style={{ color: COLORS.muted, fontSize: '14px', marginBottom: '8px' }}>No jobs yet.</div>
        <div style={{ color: COLORS.muted, fontSize: '13px' }}>
          Jobs are auto-created from email — or{' '}
          <a href="/dashboard/admin" style={{ color: COLORS.green, textDecoration: 'none' }}>add manually in Admin</a>.
        </div>
        <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '12px' }}>
          Run <span style={{ fontFamily: 'monospace', color: COLORS.text }}>/api/cron/scan-email</span> to scan inboxes, or{' '}
          <span style={{ fontFamily: 'monospace', color: COLORS.text }}>/api/cron/seed-jobs</span> to seed from email history.
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
        {STAGES.map(stage => (
          <div key={stage} style={{ flexShrink: 0, width: '160px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px', padding: '0 2px' }}>
              {STAGE_LABELS[stage]}
              <span style={{ marginLeft: '6px', background: COLORS.border, borderRadius: '10px', padding: '1px 6px', color: COLORS.text }}>
                {byStage(stage).length}
              </span>
            </div>
            <Droppable droppableId={stage}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minHeight: '80px', background: snapshot.isDraggingOver ? '#1F1F1F' : 'transparent',
                    borderRadius: '8px', padding: '4px', transition: 'background 0.15s',
                  }}
                >
                  {byStage(stage).map((job, idx) => (
                    <Draggable key={job.job_id} draggableId={job.job_id} index={idx}>
                      {(provided2, snapshot2) => (
                        <div
                          ref={provided2.innerRef}
                          {...provided2.draggableProps}
                          {...provided2.dragHandleProps}
                          style={{
                            ...provided2.draggableProps.style,
                            opacity: snapshot2.isDragging ? 0.85 : 1,
                          }}
                        >
                          <JobCard job={job} onClick={() => onJobClick(job)} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}

// ── Job Drawer ─────────────────────────────────────────────────────────────────

function JobDrawer({ job, inventory, emailLog, shipments, onClose }: {
  job: Job; inventory: InventoryRow[]; emailLog: EmailLogRow[];
  shipments: ShipmentRow[]; onClose: () => void;
}) {
  const emails = emailLog.filter(e => e.job_id === job.job_id);
  const shipment = shipments.find(s => s.job_id === job.job_id || s.tracking_number === job.tracking_number);
  const pvcRow = inventory.find(i => i.material?.toLowerCase().includes('pvc'));
  const sleeveRow = inventory.find(i => i.material?.toLowerCase().includes('sleeve'));
  const jacketRow = inventory.find(i => i.material?.toLowerCase().includes('jacket'));
  const labelRow = inventory.find(i => i.material?.toLowerCase().includes('label'));

  const matReqs = [
    { name: 'PVC', needed: job.pvc_kg_needed, onHand: pvcRow?.on_hand_qty ?? '?', unit: 'kg' },
    { name: 'Sleeves', needed: job.sleeves_needed, onHand: sleeveRow?.on_hand_qty ?? '?', unit: 'ea' },
    { name: 'Jackets', needed: job.jackets_needed, onHand: jacketRow?.on_hand_qty ?? '?', unit: 'ea' },
    { name: 'Labels', needed: job.labels_needed, onHand: labelRow?.on_hand_qty ?? '?', unit: 'ea' },
  ];

  const fields = [
    ['Job ID', job.job_id], ['Customer', job.customer], ['Email', job.contact_email],
    ['Format', job.format], ['Quantity', job.quantity], ['Color', job.color],
    ['Weight (g)', job.weight_g], ['Package', job.package_type], ['Stage', job.stage],
    ['Quote Date', job.quote_date], ['Deposit Date', job.deposit_date], ['Target Ship', job.ship_date_target],
    ['Total Price', job.total_price ? fmt$(parseFloat(job.total_price)) : ''], ['Deposit Rcvd', job.deposit_received ? fmt$(parseFloat(job.deposit_received)) : ''], ['Balance Due', job.balance_due ? fmt$(parseFloat(job.balance_due)) : ''],
    ['Press', job.assigned_press], ['Tracking', job.tracking_number], ['UPS Service', job.ups_service],
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#00000066', zIndex: 100 }} />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px',
        background: COLORS.card, borderLeft: `1px solid ${COLORS.border}`,
        zIndex: 101, overflowY: 'auto', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: COLORS.green, fontWeight: 700, fontSize: '18px', margin: 0 }}>{job.customer}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>

        {/* Details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '20px' }}>
          {fields.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: '10px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
              <div style={{ fontSize: '13px', color: COLORS.text }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Notes */}
        {job.notes && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Notes</div>
            <div style={{ fontSize: '13px', color: COLORS.text, whiteSpace: 'pre-wrap' }}>{job.notes}</div>
          </div>
        )}

        {/* Material Requirements */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Material Requirements</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: COLORS.muted, borderBottom: `1px solid ${COLORS.border}` }}>
                {['Material','Needed','On Hand','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matReqs.map(r => {
                const ok = r.onHand !== '?' && parseFloat(r.needed || '0') <= parseFloat(r.onHand);
                return (
                  <tr key={r.name} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                    <td style={{ padding: '4px 0', color: COLORS.text }}>{r.name}</td>
                    <td style={{ padding: '4px 0', color: COLORS.muted }}>{r.needed || '—'} {r.unit}</td>
                    <td style={{ padding: '4px 0', color: COLORS.muted }}>{r.onHand} {r.unit}</td>
                    <td style={{ padding: '4px 0' }}>
                      <span style={{ color: ok ? COLORS.green : COLORS.red, fontSize: '11px' }}>{ok ? 'OK' : 'LOW'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Shipping detail */}
        {(job.stage === 'ship' || job.stage === 'paid') && shipment && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Shipping</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '12px' }}>
              {[
                ['Carrier', shipment.carrier], ['Service', shipment.service],
                ['Status', shipment.status], ['Est Delivery', shipment.est_delivery],
                ['Actual Delivery', shipment.actual_delivery], ['Total Cost', shipment.total_cost ? fmt$(parseFloat(shipment.total_cost)) : ''],
                ['Base', shipment.base_cost ? fmt$(parseFloat(shipment.base_cost)) : ''], ['Fuel Surcharge', shipment.fuel_surcharge ? fmt$(parseFloat(shipment.fuel_surcharge)) : ''],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: '10px', color: COLORS.muted, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ color: COLORS.text }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked emails */}
        {emails.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Linked Emails ({emails.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {emails.map((e, i) => (
                <div key={i} style={{ background: COLORS.elevated, borderRadius: '6px', padding: '8px', fontSize: '12px', border: `1px solid ${COLORS.border}` }}>
                  <div style={{ color: COLORS.text, fontWeight: 600 }}>{e.subject}</div>
                  <div style={{ color: COLORS.muted, marginTop: '2px' }}>{e.summary}</div>
                  <div style={{ color: COLORS.muted, fontSize: '11px', marginTop: '2px' }}>{e.timestamp}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function BillsInbox({ bills }: { bills: BillRow[] }) {
  const [localBills, setLocalBills] = useState(bills);
  const newBills = localBills.filter(b => b.status === 'new');

  const approve = async (b: BillRow) => {
    setLocalBills(lb => lb.map(x => x.email_id === b.email_id ? { ...x, status: 'pending' } : x));
    await fetch(`/api/bills/${encodeURIComponent(b.email_id)}/approve`, { method: 'POST' });
    setLocalBills(lb => lb.map(x => x.email_id === b.email_id ? { ...x, status: 'imported_to_qbo' } : x));
  };
  const reject = async (b: BillRow) => {
    await fetch(`/api/bills/${encodeURIComponent(b.email_id)}/reject`, { method: 'POST' });
    setLocalBills(lb => lb.map(x => x.email_id === b.email_id ? { ...x, status: 'rejected' } : x));
  };

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Bills Inbox <span style={{ color: newBills.length > 5 ? COLORS.red : COLORS.text }}>({newBills.length})</span>
      </div>
      {newBills.length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>No pending bills</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {newBills.map((b) => (
          <div key={b.email_id} style={{ background: COLORS.elevated, borderRadius: '8px', padding: '10px', border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: COLORS.text }}>{b.vendor_guess || b.sender}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontSize: '12px' }}>
              <span style={{ color: COLORS.gold }}>{b.amount_usd ? fmt$(parseFloat(b.amount_usd)) : '?'}</span>
              <span style={{ color: COLORS.muted }}>Due: {b.due_date || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              {b.pdf_drive_url && (
                <a href={b.pdf_drive_url} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, background: COLORS.border, border: 'none', borderRadius: '5px', padding: '4px', fontSize: '11px', color: COLORS.text, textAlign: 'center', textDecoration: 'none', cursor: 'pointer' }}>
                  PDF
                </a>
              )}
              <button onClick={() => approve(b)}
                style={{ flex: 1, background: COLORS.green + '22', border: `1px solid ${COLORS.green}66`, borderRadius: '5px', padding: '4px', fontSize: '11px', color: COLORS.green, cursor: 'pointer' }}>
                Approve
              </button>
              <button onClick={() => reject(b)}
                style={{ flex: 1, background: COLORS.red + '22', border: `1px solid ${COLORS.red}66`, borderRadius: '5px', padding: '4px', fontSize: '11px', color: COLORS.red, cursor: 'pointer' }}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingSection({ briefing }: { briefing: Record<string, string> | null }) {
  if (!briefing) return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>Today&apos;s Briefing</div>
      <div style={{ color: COLORS.muted, fontSize: '12px' }}>No briefing available</div>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Today&apos;s Briefing <span style={{ color: COLORS.muted, fontWeight: 400 }}>{briefing.date}</span>
      </div>
      <div style={{ fontSize: '12px', color: COLORS.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{briefing.briefing_text}</div>
      {briefing.cash_total && (
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
          {[['Cash', briefing.cash_total], ['AR', briefing.ar_total], ['AP', briefing.ap_total], ['Active Jobs', briefing.active_jobs_count]].filter(([,v]) => v).map(([k,v]) => (
            <div key={k} style={{ background: COLORS.border + '44', borderRadius: '4px', padding: '4px 6px' }}>
              <span style={{ color: COLORS.muted }}>{k}: </span>
              <span style={{ color: COLORS.text }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompoundWatch({ alert }: { alert: Record<string, string> | null }) {
  if (!alert) return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>Compound Watch</div>
      <div style={{ color: COLORS.muted, fontSize: '12px' }}>No data</div>
    </div>
  );
  const level = alert.alert_level?.toLowerCase() ?? 'green';
  const bgColor = level === 'red' ? COLORS.red + '22' : level === 'yellow' ? COLORS.yellow + '22' : COLORS.green + '22';
  const borderColor = level === 'red' ? COLORS.red + '66' : level === 'yellow' ? COLORS.yellow + '66' : COLORS.green + '66';
  const textColor = level === 'red' ? COLORS.red : level === 'yellow' ? COLORS.yellow : COLORS.green;
  const tickers = [['MBR1', alert.mbr1_value], ['WLK', alert.wlk_value], ['OLN', alert.oln_value], ['CL1', alert.cl1_value]];
  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Compound Watch</div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: textColor, textTransform: 'uppercase' }}>{level}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
        {tickers.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <span style={{ color: COLORS.muted }}>{k}: </span>
            <span style={{ color: COLORS.text }}>{parseFloat(v ?? '0').toFixed(3)}</span>
          </div>
        ))}
      </div>
      {alert.message && <div style={{ marginTop: '8px', fontSize: '11px', color: textColor }}>{alert.message}</div>}
    </div>
  );
}

// ── Low Stock Table ────────────────────────────────────────────────────────────

function LowStockTable({ inventory }: { inventory: InventoryRow[] }) {
  const lowStock = inventory.filter(r => {
    const onHand = parseFloat(r.on_hand_qty ?? '0');
    const reorder = parseFloat(r.reorder_point ?? '0');
    return onHand < reorder;
  });
  if (lowStock.length === 0) return null;
  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ color: COLORS.red, fontWeight: 700, fontSize: '14px', marginBottom: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Low Stock Alerts ({lowStock.length})
      </h3>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#1A1A1A', borderBottom: `1px solid ${COLORS.border}` }}>
              {['Material','SKU','On Hand','Unit','Reorder At','Supplier','Last Ordered','Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: COLORS.muted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lowStock.map((row, i) => {
              const subject = `Reorder Request: ${row.material} (SKU: ${row.sku})`;
              const body = `Hi,\n\nWe need to reorder ${row.material} (SKU: ${row.sku}).\n\nCurrent stock: ${row.on_hand_qty} ${row.unit}\nReorder point: ${row.reorder_point} ${row.unit}\n\nPlease confirm availability and pricing.\n\nThank you,\nNew Orleans Record Press`;
              const mailtoHref = `mailto:${row.supplier ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22`, background: i % 2 === 0 ? 'transparent' : '#1A1A1A11' }}>
                  <td style={{ padding: '10px 14px', color: COLORS.text, fontWeight: 600 }}>{row.material}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.muted, fontFamily: 'monospace' }}>{row.sku}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.red, fontWeight: 700 }}>{row.on_hand_qty}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.muted }}>{row.unit}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.muted }}>{row.reorder_point}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.text }}>{row.supplier}</td>
                  <td style={{ padding: '10px 14px', color: COLORS.muted }}>{row.last_ordered}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <a href={mailtoHref} style={{ background: COLORS.gold + '22', border: `1px solid ${COLORS.gold}66`, borderRadius: '5px', padding: '4px 10px', fontSize: '11px', color: COLORS.gold, textDecoration: 'none' }}>
                      Order
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Drive Intel Panel ──────────────────────────────────────────────────────────

interface ArtFileEntry { sides: string[]; receivedDate: string; folder: string }
interface PressQueueJob {
  matrix: string;
  customer: string;
  qty_from_doc: string;
  color_from_doc: string;
  quantity: string;
  colors: string;
  weight: string;
  stage: string;
  due_note: string;
  notes_from_doc: string;
}
interface PressQueues {
  viryl: PressQueueJob[];
  finebilt: PressQueueJob[];
  test_pressings: string[];
  blocked: PressQueueJob[];
  raw_text: string;
}
interface StamperEntry { matrixId: string; boxes: string[]; sides: string; }
interface MotherEntry { matrixId: string; box: string; sides: string; }
interface SSTEntry { artist: string; title: string; catNumber: string; stampersQty: string; labelsQty: string; jacketsQty: string; insertQty: string; }
interface IARCShipEntry { stockInDate: string; upc: string; catNumber: string; title: string; variant: string; format: string; qty: number; }
interface NOVCEntry { album: string; quantity: number; matrixId: string; overflow: string; }

interface DriveIntelData {
  artIndex: Record<string, ArtFileEntry>;
  artMatrixIds: string[];
  artCount: number;
  priorityListText: string;
  priorityListPreview: string;
  pressQueues: PressQueues | null;
  stampers: StamperEntry[];
  mothers: MotherEntry[];
  sstCatalog: SSTEntry[];
  iarcSplits: IARCShipEntry[];
  novcStock: NOVCEntry[];
  sleeversText: string;
}

const STAGE_BADGE_COLOR: Record<string, string> = {
  quote: '#9A9A9A', deposit: '#C9A84C', plates: '#8B3FCF',
  test_pressing: '#FFB800', approved: '#00E86A', pressing: '#00E86A',
  qc: '#FF8C00', pack: '#FF8C00', ship: '#00E86A', paid: '#9A9A9A',
};

function PressQueueRow({ job, artIndex }: { job: PressQueueJob; artIndex: Record<string, ArtFileEntry> }) {
  const customer = job.customer || '—';
  const customerDisplay = customer.length > 35 ? customer.slice(0, 35) + '…' : customer;
  const qtyColor = [job.qty_from_doc, job.color_from_doc].filter(Boolean).join(' ');
  const is180g = (job.weight || '').toLowerCase().includes('180');
  const hasArt = !!(job.matrix && artIndex[job.matrix]);
  const stageColor = STAGE_BADGE_COLOR[job.stage] ?? COLORS.muted;

  return (
    <div style={{
      padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}22`,
      display: 'flex', flexDirection: 'column', gap: '2px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
        <span style={{ fontFamily: 'monospace', color: COLORS.muted, minWidth: '90px' }}>
          {job.matrix || '—'}
        </span>
        <span style={{ color: COLORS.text, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customerDisplay}
        </span>
        {is180g && (
          <span title="180g" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3FA9FF', flexShrink: 0 }} />
        )}
        {hasArt && (
          <span title="Art on file" style={{ color: COLORS.green, fontSize: '11px' }}>🎨</span>
        )}
        {job.stage && (
          <span style={{
            background: stageColor + '22', border: `1px solid ${stageColor}66`, borderRadius: '3px',
            padding: '0 4px', fontSize: '9px', color: stageColor, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{job.stage}</span>
        )}
      </div>
      {qtyColor && (
        <div style={{ fontSize: '11px', color: COLORS.gold, paddingLeft: '90px' }}>
          {qtyColor}
        </div>
      )}
      {job.due_note && (
        <div style={{ fontSize: '10px', color: COLORS.red, paddingLeft: '90px', fontWeight: 600 }}>
          {job.due_note}
        </div>
      )}
      {job.notes_from_doc && (
        <div style={{ fontSize: '10px', color: COLORS.muted, paddingLeft: '90px', fontStyle: 'italic' }}>
          {job.notes_from_doc}
        </div>
      )}
    </div>
  );
}

function PressQueueCard({ title, jobs, artIndex, accent }: {
  title: string; jobs: PressQueueJob[]; artIndex: Record<string, ArtFileEntry>; accent: string;
}) {
  return (
    <Card style={{ padding: 0 }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          fontSize: '12px', fontWeight: 700, color: accent,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>{title}</div>
        <span style={{
          background: accent + '22', border: `1px solid ${accent}66`, borderRadius: '10px',
          padding: '1px 8px', fontSize: '11px', color: accent, fontWeight: 700,
        }}>{jobs.length}</span>
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {jobs.length === 0 && (
          <div style={{ padding: '14px', color: COLORS.muted, fontSize: '12px', textAlign: 'center' }}>
            No jobs queued
          </div>
        )}
        {jobs.map((j, i) => (
          <PressQueueRow key={`${j.matrix}-${i}`} job={j} artIndex={artIndex} />
        ))}
      </div>
    </Card>
  );
}

function DriveIntelPanel({ jobs }: { jobs: Job[] }) {
  const [data, setData] = useState<DriveIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/norp-drive-intel')
      .then(r => r.json())
      .then(d => {
        if (d.error) setErr(d.error);
        else setData(d);
      })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Compute art status summary from current jobs (which are already enriched)
  const haveArt = jobs.filter(j => (j as unknown as { art_received?: boolean }).art_received).length;
  const awaitingArt = jobs.length - haveArt;
  const pressQueues = data?.pressQueues ?? null;
  const artIndex = data?.artIndex ?? {};

  return (
    <div style={{ marginTop: '24px', marginBottom: '24px' }}>
      <h3 style={{ color: COLORS.text, fontWeight: 700, fontSize: '14px', marginBottom: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Drive Intel
      </h3>

      {/* Art status summary */}
      <div style={{ marginBottom: '16px' }}>
        <Card>
          <KpiLabel>Art Status</KpiLabel>
          <BigNumber value={`${haveArt} / ${jobs.length}`} color={COLORS.green} />
          <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.muted }}>
            <span style={{ color: COLORS.green }}>{haveArt}</span> jobs have art on file,{' '}
            <span style={{ color: awaitingArt > 0 ? COLORS.yellow : COLORS.muted }}>{awaitingArt}</span> awaiting art
            {data && <span style={{ marginLeft: '12px' }}>· Drive index: {data.artCount} matrix IDs</span>}
          </div>
        </Card>
      </div>

      {/* Loading / error */}
      {loading && <div style={{ color: COLORS.muted, fontSize: '12px', padding: '8px 0' }}>Loading press queues…</div>}
      {err && <div style={{ color: COLORS.red, fontSize: '12px', padding: '8px 0' }}>{err}</div>}

      {/* Press queues split */}
      {pressQueues && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <PressQueueCard
              title="Viryl Press Queue"
              jobs={pressQueues.viryl}
              artIndex={artIndex}
              accent={COLORS.green}
            />
            <PressQueueCard
              title="Finebilt Press Queue"
              jobs={pressQueues.finebilt}
              artIndex={artIndex}
              accent={COLORS.purple}
            />
          </div>

          {/* Test pressings + Blocked side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Card style={{ padding: 0 }}>
              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.yellow, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Test Pressing Queue
                </div>
                <span style={{
                  background: COLORS.yellow + '22', border: `1px solid ${COLORS.yellow}66`, borderRadius: '10px',
                  padding: '1px 8px', fontSize: '11px', color: COLORS.yellow, fontWeight: 700,
                }}>{pressQueues.test_pressings.length}</span>
              </div>
              <div style={{ padding: '10px 14px', maxHeight: '200px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {pressQueues.test_pressings.length === 0 && (
                  <div style={{ color: COLORS.muted, fontSize: '12px' }}>None</div>
                )}
                {pressQueues.test_pressings.map((m, i) => (
                  <span key={i} style={{
                    fontFamily: 'monospace', fontSize: '11px', color: COLORS.text,
                    background: COLORS.elevated, border: `1px solid ${COLORS.border}`,
                    borderRadius: '4px', padding: '2px 6px',
                  }}>{m}</span>
                ))}
              </div>
            </Card>

            <Card style={{ padding: 0 }}>
              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.red, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Blocked — Waiting on Items
                </div>
                <span style={{
                  background: COLORS.red + '22', border: `1px solid ${COLORS.red}66`, borderRadius: '10px',
                  padding: '1px 8px', fontSize: '11px', color: COLORS.red, fontWeight: 700,
                }}>{pressQueues.blocked.length}</span>
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {pressQueues.blocked.length === 0 && (
                  <div style={{ padding: '14px', color: COLORS.muted, fontSize: '12px', textAlign: 'center' }}>None</div>
                )}
                {pressQueues.blocked.map((j, i) => (
                  <PressQueueRow key={`${j.matrix}-${i}`} job={j} artIndex={artIndex} />
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* QC & Packing View */}
      {data && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ color: COLORS.text, fontWeight: 700, fontSize: '14px', marginBottom: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>QC &amp; Packing</h3>
          {data.sleeversText && (
            <Card style={{ marginBottom: '14px' }}>
              <KpiLabel>Sleever Notes</KpiLabel>
              <pre style={{ color: COLORS.text, fontSize: '12px', whiteSpace: 'pre-wrap', margin: 0, maxHeight: '100px', overflowY: 'auto' }}>{data.sleeversText}</pre>
            </Card>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <Card>
              <KpiLabel>Needs Listening</KpiLabel>
              <BigNumber value={String(jobs.filter(j => j.stage === 'test_pressing').length)} color={COLORS.yellow} />
              <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                {jobs.filter(j => j.stage === 'test_pressing').map((j, i) => (
                  <div key={i} style={{ fontSize: '11px', color: COLORS.text, padding: '4px 0', borderBottom: '1px solid #2A2A2A' }}>
                    <span style={{ color: COLORS.yellow, fontWeight: 700 }}>{j.matrix}</span>
                    {j.artist && <span style={{ color: COLORS.muted, marginLeft: '6px' }}>{j.artist.slice(0, 30)}</span>}
                    {j.qty && <span style={{ color: COLORS.muted, marginLeft: '6px' }}>× {j.qty}</span>}
                  </div>
                ))}
                {jobs.filter(j => j.stage === 'test_pressing').length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>All clear</div>}
              </div>
            </Card>
            <Card>
              <KpiLabel>Ready to Press</KpiLabel>
              <BigNumber value={String(jobs.filter(j => j.stage === 'approved').length)} color={COLORS.green} />
              <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                {jobs.filter(j => j.stage === 'approved').map((j, i) => (
                  <div key={i} style={{ fontSize: '11px', color: COLORS.text, padding: '4px 0', borderBottom: '1px solid #2A2A2A' }}>
                    <span style={{ color: COLORS.green, fontWeight: 700 }}>{j.matrix}</span>
                    {j.artist && <span style={{ color: COLORS.muted, marginLeft: '6px' }}>{j.artist.slice(0, 30)}</span>}
                    {j.qty && <span style={{ color: COLORS.muted, marginLeft: '6px' }}>× {j.qty}</span>}
                  </div>
                ))}
                {jobs.filter(j => j.stage === 'approved').length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>None queued</div>}
              </div>
            </Card>
            <Card>
              <KpiLabel>Sleeve &amp; Pack</KpiLabel>
              <BigNumber value={String(jobs.filter(j => j.stage === 'qc' || j.stage === 'pack').length)} color={'#FF8C00'} />
              <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                {jobs.filter(j => j.stage === 'qc' || j.stage === 'pack').map((j, i) => (
                  <div key={i} style={{ fontSize: '11px', color: COLORS.text, padding: '4px 0', borderBottom: '1px solid #2A2A2A' }}>
                    <span style={{ color: '#FF8C00', fontWeight: 700 }}>{j.matrix}</span>
                    {j.artist && <span style={{ color: COLORS.muted, marginLeft: '6px' }}>{j.artist.slice(0, 30)}</span>}
                    {j.qty && <span style={{ fontWeight: 700, color: '#FF8C00', marginLeft: '6px' }}>× {j.qty}</span>}
                    <span style={{ color: COLORS.muted, marginLeft: '6px', fontSize: '10px' }}>{j.stage}</span>
                  </div>
                ))}
                {jobs.filter(j => j.stage === 'qc' || j.stage === 'pack').length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>Nothing pending</div>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Inventory Library */}
      {data && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ color: COLORS.text, fontWeight: 700, fontSize: '14px', marginBottom: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Inventory Library</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '14px' }}>
            <Card>
              <KpiLabel>Upstairs Stampers ({data.stampers.length})</KpiLabel>
              <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '8px' }}>
                {data.stampers.length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>No data</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr style={{ color: COLORS.muted }}><th style={{ textAlign: 'left', paddingBottom: '4px' }}>Matrix</th><th style={{ textAlign: 'left' }}>Box</th><th style={{ textAlign: 'left' }}>Sides</th></tr></thead>
                  <tbody>
                    {data.stampers.map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #222', color: COLORS.text }}>
                        <td style={{ padding: '3px 6px 3px 0', color: COLORS.green, fontWeight: 700 }}>{s.matrixId}</td>
                        <td style={{ padding: '3px 6px 3px 0', color: COLORS.muted }}>{s.boxes.join(', ')}</td>
                        <td style={{ padding: '3px 0', color: COLORS.muted }}>{s.sides}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <KpiLabel>Mothers Inventory ({data.mothers.length})</KpiLabel>
              <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '8px' }}>
                {data.mothers.length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>No data</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr style={{ color: COLORS.muted }}><th style={{ textAlign: 'left', paddingBottom: '4px' }}>Matrix</th><th style={{ textAlign: 'left' }}>Box</th><th style={{ textAlign: 'left' }}>Sides</th></tr></thead>
                  <tbody>
                    {data.mothers.map((m, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #222', color: COLORS.text }}>
                        <td style={{ padding: '3px 6px 3px 0', color: '#8B3FCF', fontWeight: 700 }}>{m.matrixId}</td>
                        <td style={{ padding: '3px 6px 3px 0', color: COLORS.muted }}>{m.box}</td>
                        <td style={{ padding: '3px 0', color: COLORS.muted }}>{m.sides}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <Card>
              <KpiLabel>SST Catalog ({data.sstCatalog.length} titles)</KpiLabel>
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '8px' }}>
                {data.sstCatalog.length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>No data</div>}
                {data.sstCatalog.map((s, i) => (
                  <div key={i} style={{ fontSize: '11px', color: COLORS.text, padding: '4px 0', borderBottom: '1px solid #222' }}>
                    <div style={{ fontWeight: 700 }}>{s.artist} – {s.title}</div>
                    <div style={{ color: COLORS.muted, marginTop: '2px' }}>
                      {s.catNumber && <span style={{ marginRight: '8px' }}>{s.catNumber}</span>}
                      {s.stampersQty && <span style={{ marginRight: '6px', color: COLORS.green }}>Stmprs: {s.stampersQty}</span>}
                      {s.labelsQty && <span style={{ marginRight: '6px' }}>Labels: {s.labelsQty}</span>}
                      {s.jacketsQty && <span>Jackets: {s.jacketsQty}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <KpiLabel>IARC Distribution ({data.iarcSplits.length} orders)</KpiLabel>
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '8px' }}>
                {data.iarcSplits.length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>No data</div>}
                {data.iarcSplits.map((s, i) => (
                  <div key={i} style={{ fontSize: '11px', color: COLORS.text, padding: '4px 0', borderBottom: '1px solid #222' }}>
                    <div style={{ fontWeight: 700 }}>{s.title}</div>
                    <div style={{ color: COLORS.muted, marginTop: '2px' }}>
                      {s.variant && <span style={{ marginRight: '8px' }}>{s.variant}</span>}
                      <span style={{ color: COLORS.green, fontWeight: 700 }}>×{s.qty}</span>
                      {s.stockInDate && <span style={{ marginLeft: '8px' }}>{s.stockInDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <KpiLabel>NOVC Stock ({data.novcStock.length} albums)</KpiLabel>
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '8px' }}>
                {data.novcStock.length === 0 && <div style={{ color: COLORS.muted, fontSize: '12px' }}>No data</div>}
                {data.novcStock.map((n, i) => (
                  <div key={i} style={{ fontSize: '11px', color: COLORS.text, padding: '4px 0', borderBottom: '1px solid #222' }}>
                    <div style={{ fontWeight: 700 }}>{n.album}</div>
                    <div style={{ color: COLORS.muted, marginTop: '2px' }}>
                      <span style={{ color: n.quantity > 0 ? COLORS.green : COLORS.red, fontWeight: 700 }}>{n.quantity} units</span>
                      {n.matrixId && <span style={{ marginLeft: '8px' }}>{n.matrixId}</span>}
                      {n.overflow && <span style={{ marginLeft: '8px', color: '#FFB800' }}>{n.overflow}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const EMPTY_KPI: KpiData = { bankAccounts: [], arAging: { total: 0, buckets: { current: 0, days30: 0, days60: 0, days90plus: 0 } }, apAging: { total: 0, pendingBills: 0 }, mtdRevenue: 0, nextPayroll: null };

export default function DashboardClient({ kpiData: kpiDataProp, jobs: initialJobs, inventory = [], billsInbox = [], latestBriefing = null, latestCompoundAlert = null, shipments = [], emailLog = [] }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs ?? []);
  const [loading, setLoading] = useState(true);
  const [kpiData] = useState<KpiData>(kpiDataProp ?? EMPTY_KPI);

  useEffect(() => {
    // Load jobs from API on mount — keeps initial page response small
    fetch('/api/norp-jobs')
      .then(r => r.json())
      .then(data => { if (data.jobs) setJobs(data.jobs); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { bankAccounts, arAging, mtdRevenue, nextPayroll } = kpiData;

  return (
    <div style={{ maxWidth: '1800px', margin: '0 auto' }}>

      {/* Drive Intel — top of page */}
      <DriveIntelPanel jobs={jobs} />

      {/* Row 1: 4 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '16px' }}>
        <CashCard bankAccounts={bankAccounts} />
        <ARCard arAging={arAging} />
        <BillsCard billsInbox={billsInbox ?? []} />
        <ActiveJobsCard jobs={jobs} inventory={inventory ?? []} />
      </div>

      {/* Row 2: 3 secondary KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '24px' }}>
        <ShipmentsCard shipments={shipments ?? []} />
        <ShippingCostCard shipments={shipments ?? []} mtdRevenue={mtdRevenue} />
        <PayrollCard nextPayroll={nextPayroll} bankAccounts={bankAccounts} />
      </div>

      {/* Center + Sidebar layout */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

        {/* Kanban */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ color: COLORS.text, fontWeight: 700, fontSize: '16px', marginBottom: '12px', letterSpacing: '-0.3px' }}>Production Board {loading && <span style={{ color: COLORS.muted, fontSize: '12px', fontWeight: 400 }}>Loading jobs...</span>}</h2>
          <KanbanBoard jobs={jobs} onJobUpdate={setJobs} onJobClick={setSelectedJob} />
        </div>

        {/* Right sidebar */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card><BillsInbox bills={billsInbox} /></Card>
          <Card><BriefingSection briefing={latestBriefing ?? null} /></Card>
          <CompoundWatch alert={latestCompoundAlert ?? null} />
        </div>
      </div>

      {/* Low stock */}
      <LowStockTable inventory={inventory ?? []} />

      {/* Job Drawer */}
      {selectedJob && (
        <JobDrawer
          job={selectedJob} inventory={inventory ?? []} emailLog={emailLog ?? []}
          shipments={shipments ?? []} onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}
