'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DraggableProvidedDragHandleProps, DropResult, DragUpdate } from '@hello-pangea/dnd';
import { packSkyline } from '@/lib/dashboard-pack';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { PRODUCTION_LOG_HEARTBEAT_MS, PRODUCTION_SYNC_POLL_MS, notifyProductionSync, subscribeProductionSync } from '@/lib/production-sync';
import {
  buildJobPnl,
  estimatePvcCompound,
  formatPvcRate,
  PVC_COST_PER_RECORD,
  PVC_COST_PER_RECORD_CLEAR_SPLATTER,
  QC_REJECT_RATE,
  RECORDS_PRESSED_PER_DAY,
  type JobPnl,
} from '@/lib/job-pnl';
import {
  BadgeCheck,
  Boxes,
  Bug,
  ClipboardList,
  Disc3,
  Layers3,
  Paperclip,
  SearchCheck,
  Truck,
  ChevronDown,
} from 'lucide-react';

type JobRecord = Record<string, string | number | boolean | null | undefined>;
interface Job { [key: string]: string | number | boolean | string[] | JobRecord[] | Record<string, unknown> | undefined }

interface Props {
  jobs?: Job[];
}

const STATIONS = [
  'pre_production',
  'press_queue',
  'now_pressing',
  'quality_control',
  'sleeving',
  'assembly',
  'shipping',
] as const;

type Station = typeof STATIONS[number];
type DashboardStage = Station | 'completed';

const STATION_META: Record<Station, {
  label: string;
  shortLabel: string;
  color: string;
  icon: typeof ClipboardList;
  description: string;
}> = {
  pre_production: {
    label: 'Pre-Production',
    shortLabel: 'Prep',
    color: '#C9A84C',
    icon: ClipboardList,
    description: 'lacquers, stampers, parts',
  },
  press_queue: {
    label: 'Press Queue',
    shortLabel: 'Queue',
    color: '#6EC6FF',
    icon: Disc3,
    description: 'approved and waiting',
  },
  now_pressing: {
    label: 'NOW PRESSING',
    shortLabel: 'Pressing',
    color: '#00E86A',
    icon: Disc3,
    description: 'actively on press',
  },
  quality_control: {
    label: 'Quality Control',
    shortLabel: 'QC',
    color: '#FFB800',
    icon: SearchCheck,
    description: 'listen, inspect, approve',
  },
  sleeving: {
    label: 'Sleeving',
    shortLabel: 'Sleeve',
    color: '#B781FF',
    icon: Layers3,
    description: 'inner sleeves and labels',
  },
  assembly: {
    label: 'Assembly',
    shortLabel: 'Build',
    color: '#FF8C00',
    icon: Boxes,
    description: 'jackets, inserts, packout',
  },
  shipping: {
    label: 'Shipping',
    shortLabel: 'Ship',
    color: '#4DA3FF',
    icon: Truck,
    description: 'cartons, labels, pickup',
  },
};

const COLORS = {
  bg: '#090909',
  panel: '#121212',
  card: '#181818',
  elevated: '#202020',
  text: '#F2F2F2',
  muted: '#A0A0A0',
  faint: '#707070',
  border: '#2A2A2A',
  red: '#FF4D4D',
  green: '#00E86A',
  blue: '#4DA3FF',
  gold: '#C9A84C',
};

const AIRTABLE_DATABASE_URL = 'https://airtable.com/appu3BWQLTIxzKF3V/tblmhd7tY2QqTZmnF/viwybIIrPi9Pd9Tyo?blocks=hide';
const RUSH_MARKER = '[Rush Order]';
const QUANTITY_KEYS = ['quantity', 'Quantity', 'Qty', 'Run Size'];
const STAGE_SPAN_MARKER_RE = /\[Stage\s+Span:\s*([^\]]+)\]/i;
const STAGE_SPAN_MARKER_GLOBAL_RE = /\[Stage\s+Span:\s*[^\]]+\]/gi;
const STRETCHED_DROPPABLE_ID = '__stretched_jobs__';

function value(job: Job, keys: string[]) {
  for (const key of keys) {
    const found = job[key];
    if (found !== undefined && found !== false && String(found).trim() !== '') return String(found);
  }
  return '';
}

function jobRecords(value: unknown): JobRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JobRecord => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function jobKey(job: Job) {
  return value(job, ['airtable_record_id', 'job_id', 'matrix', 'MATRIX']);
}

function preservedFinance(job: Job) {
  return {
    pnl: job.pnl,
    vendor_cost_summary: job.vendor_cost_summary,
    vendor_cost_total: job.vendor_cost_total,
    vendor_cost_count: job.vendor_cost_count,
    vendor_cost_categories: job.vendor_cost_categories,
  };
}

function withFinanceDetails(job: Job, extra?: Record<string, unknown> | null) {
  if (!extra) return job;
  return {
    ...job,
    pnl: extra.pnl,
    vendor_cost_summary: extra.vendor_cost_summary,
    vendor_cost_total: extra.vendor_cost_total,
    vendor_cost_count: extra.vendor_cost_count,
    vendor_cost_categories: extra.vendor_cost_categories,
  };
}

function mergedRecordIds(job: Job) {
  const raw = job.merged_record_ids;
  if (Array.isArray(raw) && raw.length) {
    return raw.map(id => String(id)).filter(Boolean);
  }
  const primary = jobKey(job);
  return primary ? [primary] : [];
}

function variantCount(job: Job) {
  const explicit = Number(job.variant_count || job.duplicate_count || 0);
  if (explicit > 1) return explicit;
  const variants = job.variants;
  return Array.isArray(variants) ? variants.length : 0;
}

function stationOf(job: Job): DashboardStage {
  const raw = value(job, ['stage', 'Dashboard Stage']).toLowerCase().replace(/[\s-]+/g, '_');
  if (STATIONS.includes(raw as Station)) return raw as Station;
  if (['quote', 'deposit', 'plates'].includes(raw)) return 'pre_production';
  if (['approved', 'test_pressing', 'test_pressings'].includes(raw)) return 'press_queue';
  if (['press', 'pressing'].includes(raw)) return 'now_pressing';
  if (['qc', 'quality'].includes(raw)) return 'quality_control';
  if (['pack', 'packing'].includes(raw)) return 'assembly';
  if (['ship', 'shipped'].includes(raw)) return 'shipping';
  if (['paid', 'paid_in_full', 'complete', 'completed'].includes(raw)) return 'completed';
  return 'pre_production';
}

function dashboardOrder(job: Job) {
  const raw = value(job, ['dashboard_order', 'Dashboard Order']);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 999999;
}

function numericValue(raw: string) {
  const parsed = Number(raw.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function manualRecordsPressed(job: Job) {
  const raw = value(job, ['records_pressed', 'Records Pressed']);
  return raw !== '' ? numericValue(raw) : null;
}

function displayedRecordsPressed(job: Job) {
  return numericValue(value(job, ['records_pressed_total']));
}

function jobQuantity(job: Job) {
  return numericValue(value(job, QUANTITY_KEYS));
}

function recordsLeftToPress(job: Job) {
  const station = stationOf(job);
  const qty = jobQuantity(job);
  if (station === 'pre_production' || station === 'press_queue') return qty;
  if (station === 'now_pressing') return Math.max(0, qty - displayedRecordsPressed(job));
  return 0;
}

function pressBacklog(jobs: Job[]) {
  const remaining = jobs.reduce((sum, job) => sum + recordsLeftToPress(job), 0);
  const effectiveRecords = remaining / (1 - QC_REJECT_RATE);
  return {
    remaining,
    perDay: RECORDS_PRESSED_PER_DAY,
    days: effectiveRecords / RECORDS_PRESSED_PER_DAY,
  };
}

function formatPressHorizon(days: number) {
  if (!Number.isFinite(days) || days <= 0) return 'Caught up';
  if (days < 1) return 'Under 1 day';
  if (days < 30) {
    const n = Math.max(1, Math.round(days));
    return `${n} day${n === 1 ? '' : 's'} out`;
  }
  const months = Math.floor(days / 30);
  const remainingDays = Math.round(days % 30);
  const mPart = `${months} month${months === 1 ? '' : 's'}`;
  if (remainingDays === 0) return `${mPart} out`;
  const dPart = `${remainingDays} day${remainingDays === 1 ? '' : 's'}`;
  return `${mPart}, ${dPart} out`;
}

function boardSyncSignature(jobs: Job[]) {
  return jobs.map(job => [
    jobKey(job),
    stationOf(job),
    dashboardOrder(job),
    value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']),
    displayedRecordsPressed(job),
    value(job, ['records_pressed', 'Records Pressed']),
    value(job, ['records_pressed_baseline_at']),
    job.records_pressed_source || '',
    job.press_log_count || '',
    value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']),
    value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']),
  ].join('\t')).join('\n');
}

function recordsPressedSinceBaseline(job: Job) {
  return numericValue(value(job, ['records_pressed_since_baseline']));
}

function allTimeLogRecordsPressed(job: Job) {
  const fromLogs = value(job, ['records_pressed_from_logs']);
  if (fromLogs !== '') return numericValue(fromLogs);
  if (value(job, ['records_pressed_source']) === 'press_logs') {
    return numericValue(value(job, ['records_pressed_total']));
  }
  return 0;
}

type LogisticsShipment = {
  id: string;
  tracking_number: string;
  direction: 'inbound' | 'outbound';
  carrier: string;
  status: string;
  supply_type: string;
  shipped_date: string;
  est_delivery: string;
  delivered_date: string;
  total_cost: number;
  notes: string;
  tracking_url?: string;
  source?: string;
};

type JobLogisticsState = {
  shipments: LogisticsShipment[];
  totals: { inbound_cost: number; outbound_cost: number; all_cost: number };
};

type VendorCostItem = {
  id: string;
  invoice_number?: string;
  vendor?: string;
  category?: string;
  matrix?: string;
  description?: string;
  amount?: number;
  invoice_date?: string;
  source_file?: string;
};

type VendorCostSummary = {
  total: number;
  count: number;
  categories: Record<string, number>;
  items: VendorCostItem[];
};

type VendorInvoiceMatchedJob = {
  record_id?: string;
  job_id?: string;
  matrix?: string;
  customer?: string;
  order_number?: string;
};

type VendorInvoiceLine = {
  id: string;
  description: string;
  matrix: string;
  category: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  confidence: string;
  raw_line: string;
  matched_job?: VendorInvoiceMatchedJob | null;
  skipped?: boolean;
};

type VendorInvoiceParseResult = {
  invoice: {
    invoice_number: string;
    vendor: string;
    invoice_date: string;
    total: number;
    source_file: string;
  };
  line_items: VendorInvoiceLine[];
  matches?: { matched: number; unmatched: number };
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

function vendorCostSummary(job: Job): VendorCostSummary | null {
  const raw = job.vendor_cost_summary;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const shaped = raw as Record<string, unknown>;
  const total = Number(shaped.total || job.vendor_cost_total || 0);
  const count = Number(shaped.count || job.vendor_cost_count || 0);
  const rawCategories = shaped.categories && typeof shaped.categories === 'object' && !Array.isArray(shaped.categories)
    ? shaped.categories as Record<string, unknown>
    : {};
  const categories = Object.fromEntries(
    Object.entries(rawCategories).map(([category, amount]) => [category, Number(amount || 0)]),
  );
  const items = Array.isArray(shaped.items)
    ? shaped.items.map(item => item as VendorCostItem)
    : [];

  if (!total && !count && !items.length) return null;
  return { total, count: count || items.length, categories, items };
}

function trackingLink(carrier: string, trackingNumber: string, trackingUrl = '') {
  const url = trackingUrl.trim();
  if (url) return url;
  const number = trackingNumber.trim();
  if (!number) return '';
  const normalized = carrier.toLowerCase();
  if (normalized.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`;
  if (normalized.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`;
  if (normalized.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`;
  return `https://www.aftership.com/track/${encodeURIComponent(number)}`;
}

function jobShipments(job: Job): LogisticsShipment[] {
  const raw = job.shipments;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item, index) => ({
      id: String(item.id || `shipment:${index}`),
      tracking_number: String(item.tracking_number || ''),
      direction: String(item.direction || '').toLowerCase().includes('out') ? 'outbound' as const : 'inbound' as const,
      carrier: String(item.carrier || ''),
      status: String(item.status || ''),
      supply_type: String(item.supply_type || ''),
      shipped_date: String(item.shipped_date || ''),
      est_delivery: String(item.est_delivery || ''),
      delivered_date: String(item.delivered_date || ''),
      total_cost: Number(item.total_cost || 0),
      notes: String(item.notes || ''),
      tracking_url: String(item.tracking_url || ''),
      source: String(item.source || ''),
    }))
    .filter(shipment => shipment.tracking_number || shipment.status || shipment.carrier);
}

function shipmentStatusTone(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('exception') || normalized.includes('fail') || normalized.includes('expired')) return COLORS.red;
  if (normalized.includes('delivered')) return COLORS.green;
  if (normalized.includes('out for delivery')) return COLORS.gold;
  if (normalized.includes('transit') || normalized.includes('pickup')) return COLORS.blue;
  if (normalized.includes('label') || normalized.includes('pending') || normalized.includes('registered')) return COLORS.muted;
  return COLORS.blue;
}

function shipmentStatusShort(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('exception')) return 'Exception';
  if (normalized.includes('fail')) return 'Attempt failed';
  if (normalized.includes('delivered')) return 'Delivered';
  if (normalized.includes('out for delivery')) return 'Out for delivery';
  if (normalized.includes('transit')) return 'In transit';
  if (normalized.includes('pickup')) return 'Ready for pickup';
  if (normalized.includes('label') || normalized.includes('pending') || normalized.includes('registered')) return 'Label created';
  return status.split(' — ')[0]?.trim() || status || 'Tracking';
}

function isActiveShipment(shipment: LogisticsShipment) {
  const normalized = shipment.status.toLowerCase();
  return Boolean(normalized) && !normalized.includes('delivered') && !normalized.includes('returned');
}

function logisticsTotals(shipments: LogisticsShipment[]) {
  return shipments.reduce((totals, shipment) => {
    const cost = Number(shipment.total_cost || 0);
    totals.all_cost += cost;
    if (shipment.direction === 'outbound') totals.outbound_cost += cost;
    else totals.inbound_cost += cost;
    return totals;
  }, { inbound_cost: 0, outbound_cost: 0, all_cost: 0 });
}

function shipmentNotesForDisplay(notes = '') {
  const trimmed = notes.trim();
  if (!trimmed) return '';
  if (/^auto from |^updated from aftership|^aftership webhook/i.test(trimmed)) return '';
  return trimmed;
}

function supplyTypeLabel(supplyType = '', direction: LogisticsShipment['direction'] = 'inbound') {
  if (supplyType) return supplyType.replace(/_/g, ' ');
  return direction === 'outbound' ? 'Finished goods' : 'Supplies';
}

function JobLogisticsPanel({ job, onShipmentsChanged }: { job: Job; onShipmentsChanged?: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<JobLogisticsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [supplyType, setSupplyType] = useState('finished_goods');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [status, setStatus] = useState('In transit');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');

  const embeddedShipments = useMemo(() => jobShipments(job), [job]);

  const loadLogistics = async () => {
    setLoading(true);
    setError('');
    try {
      const key = jobKey(job);
      const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/logistics`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Load failed (${response.status})`);
      setData({
        shipments: body.shipments || [],
        totals: body.totals || logisticsTotals(body.shipments || []),
      });
    } catch (loadError) {
      if (embeddedShipments.length) {
        setData({
          shipments: embeddedShipments,
          totals: logisticsTotals(embeddedShipments),
        });
        setError('');
      } else {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (embeddedShipments.length) {
      setData({
        shipments: embeddedShipments,
        totals: logisticsTotals(embeddedShipments),
      });
      setLoading(false);
      setError('');
      return;
    }
    void loadLogistics();
  }, [job, open]);

  const addShipment = async () => {
    setSaving(true);
    setError('');
    try {
      const key = jobKey(job);
      const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/logistics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          supply_type: supplyType,
          tracking_number: trackingNumber,
          carrier,
          status,
          total_cost: totalCost === '' ? 0 : Number(totalCost),
          notes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Save failed (${response.status})`);
      setData({
        shipments: body.shipments || [],
        totals: body.totals || logisticsTotals(body.shipments || []),
      });
      setTrackingNumber('');
      setCarrier('');
      setTotalCost('');
      setNotes('');
      await onShipmentsChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const inbound = (data?.shipments || []).filter(shipment => shipment.direction === 'inbound');
  const outbound = (data?.shipments || []).filter(shipment => shipment.direction === 'outbound');

  const renderShipment = (shipment: LogisticsShipment) => {
    const link = trackingLink(shipment.carrier, shipment.tracking_number, shipment.tracking_url);
    const tone = shipmentStatusTone(shipment.status);
    const displayNotes = shipmentNotesForDisplay(shipment.notes);
    return (
      <div
        key={shipment.id}
        style={{
          background: COLORS.panel,
          border: `1px solid ${tone}44`,
          borderLeft: `3px solid ${tone}`,
          borderRadius: '8px',
          padding: '10px 12px',
        }}
      >
        <div style={{ alignItems: 'start', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ color: COLORS.text, fontSize: '14px', fontWeight: 850 }}>
                {supplyTypeLabel(shipment.supply_type, shipment.direction)}
              </div>
              <StatusPill color={tone}>{shipmentStatusShort(shipment.status)}</StatusPill>
              <StatusPill color={shipment.direction === 'outbound' ? COLORS.gold : COLORS.blue}>
                {shipment.direction === 'outbound' ? 'Outbound' : 'Inbound'}
              </StatusPill>
            </div>
            <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '6px' }}>
              {shipment.carrier || 'Carrier TBD'}
            </div>
            {shipment.tracking_number && (
              <div style={{ fontSize: '12px', marginTop: '6px' }}>
                {link ? (
                  <a href={link} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} style={{ color: COLORS.blue, fontFamily: 'monospace', textDecoration: 'none' }}>
                    {shipment.tracking_number}
                  </a>
                ) : (
                  <span style={{ fontFamily: 'monospace' }}>{shipment.tracking_number}</span>
                )}
              </div>
            )}
            {(shipment.shipped_date || shipment.est_delivery || shipment.delivered_date) && (
              <div style={{ color: COLORS.faint, fontSize: '12px', marginTop: '6px' }}>
                {shipment.shipped_date ? `Shipped ${shipment.shipped_date}` : ''}
                {shipment.est_delivery && !shipment.status.toLowerCase().includes('delivered')
                  ? `${shipment.shipped_date ? ' · ' : ''}ETA ${shipment.est_delivery}`
                  : ''}
                {shipment.delivered_date ? `${(shipment.shipped_date || shipment.est_delivery) ? ' · ' : ''}Delivered ${shipment.delivered_date}` : ''}
              </div>
            )}
            {displayNotes && (
              <div style={{ color: COLORS.muted, fontSize: '12px', lineHeight: 1.35, marginTop: '6px' }}>{displayNotes}</div>
            )}
          </div>
          {shipment.total_cost > 0 && (
            <div style={{ color: COLORS.gold, fontSize: '14px', fontWeight: 900, whiteSpace: 'nowrap' }}>
              {formatMoney(shipment.total_cost)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      marginBottom: '22px',
      padding: '0',
    }}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        style={{
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          color: COLORS.blue,
          cursor: 'pointer',
          display: 'flex',
          font: 'inherit',
          gap: '8px',
          letterSpacing: '0.08em',
          padding: '14px',
          textTransform: 'uppercase',
          width: '100%',
        }}
      >
        <Truck size={16} color={COLORS.blue} />
        <span style={{ flex: 1, fontSize: '11px', fontWeight: 900, textAlign: 'left' }}>Logistics</span>
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' }} />
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {loading ? (
            <div style={{ color: COLORS.muted, fontSize: '13px' }}>Loading shipments...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: '14px' }}>
                {[
                  ['Inbound', data?.totals.inbound_cost || 0],
                  ['Outbound', data?.totals.outbound_cost || 0],
                  ['Total', data?.totals.all_cost || 0],
                ].map(([label, amount]) => (
                  <div key={String(label)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
                    <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ color: COLORS.gold, fontSize: '18px', fontWeight: 900, marginTop: '4px' }}>{formatMoney(Number(amount))}</div>
                  </div>
                ))}
              </div>

              {inbound.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 850, letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Inbound to NORP
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>{inbound.map(renderShipment)}</div>
                </div>
              )}

              {outbound.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 850, letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Outbound to client
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>{outbound.map(renderShipment)}</div>
                </div>
              )}

              {!inbound.length && !outbound.length && (
                <div style={{ color: COLORS.muted, fontSize: '13px', lineHeight: 1.4, marginBottom: '12px' }}>
                  No shipments linked yet. AfterShip auto-tracking appears here when a package matches matrix ID ({value(job, ['matrix', 'MATRIX']) || 'none'}), job ID, or customer name. You can also add one manually below.
                </div>
              )}
            </>
          )}

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: '12px', paddingTop: '12px' }}>
            <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 850, letterSpacing: '0.05em', marginBottom: '10px', textTransform: 'uppercase' }}>
              Add Shipment
            </div>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Direction
                <select value={direction} onChange={event => setDirection(event.target.value as 'inbound' | 'outbound')} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }}>
                  <option value="inbound">Inbound to NORP</option>
                  <option value="outbound">Outbound to client</option>
                </select>
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Supply / Package
                <select value={supplyType} onChange={event => setSupplyType(event.target.value)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }}>
                  <option value="pvc">PVC</option>
                  <option value="inner_sleeves">Inner Sleeves</option>
                  <option value="jackets">Jackets</option>
                  <option value="labels">Labels</option>
                  <option value="stampers">Stampers</option>
                  <option value="finished_goods">Finished Goods</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Tracking Number
                <input value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} placeholder="Optional for now" />
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Carrier
                <input value={carrier} onChange={event => setCarrier(event.target.value)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} placeholder="UPS, FedEx, USPS, R&L..." />
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Status
                <input value={status} onChange={event => setStatus(event.target.value)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} />
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Total Cost
                <input type="number" min={0} step="0.01" value={totalCost} onChange={event => setTotalCost(event.target.value)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} placeholder="0.00" />
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase', gridColumn: '1 / -1' }}>
                Notes
                <input value={notes} onChange={event => setNotes(event.target.value)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} placeholder="Invoice #, vendor, pallet count..." />
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={addShipment}
              style={{
                background: COLORS.blue,
                border: 'none',
                borderRadius: '8px',
                color: '#041018',
                cursor: saving ? 'default' : 'pointer',
                fontSize: '13px',
                fontWeight: 900,
                marginTop: '12px',
                opacity: saving ? 0.7 : 1,
                padding: '10px 12px',
                width: '100%',
              }}
            >
              {saving ? 'Saving shipment...' : 'Add Shipment'}
            </button>
          </div>

          {error && (
            <div style={{ color: COLORS.red, fontSize: '12px', lineHeight: 1.4, marginTop: '10px' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function VendorCostsPanel({ job }: { job: Job }) {
  const summary = vendorCostSummary(job);
  if (!summary) return null;

  const categories = Object.entries(summary.categories)
    .filter(([, amount]) => amount)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      marginBottom: '22px',
      padding: '14px',
    }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <Paperclip size={16} color={COLORS.gold} />
        <div style={{ color: COLORS.gold, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Vendor Costs
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: '14px' }}>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
          <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total</div>
          <div style={{ color: COLORS.gold, fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{formatMoney(summary.total)}</div>
        </div>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
          <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Lines</div>
          <div style={{ color: COLORS.text, fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{summary.count}</div>
        </div>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {categories.map(([category, amount]) => (
            <StatusPill key={category} color={COLORS.gold}>{category}: {formatMoney(amount)}</StatusPill>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: '8px' }}>
        {summary.items.slice(0, 8).map(item => (
          <div key={item.id} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ alignItems: 'start', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontSize: '14px', fontWeight: 850 }}>
                  {item.description || item.category || 'Vendor line'}
                </div>
                <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '4px' }}>
                  {[item.vendor, item.invoice_number, item.invoice_date].filter(Boolean).join(' · ') || 'Imported invoice line'}
                </div>
              </div>
              <div style={{ color: COLORS.gold, fontSize: '14px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                {formatMoney(Number(item.amount || 0))}
              </div>
            </div>
          </div>
        ))}
        {summary.items.length > 8 && (
          <div style={{ color: COLORS.muted, fontSize: '12px' }}>
            +{summary.items.length - 8} more vendor cost line{summary.items.length - 8 === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}

function PvcCompoundPanel({ job }: { job: Job }) {
  const estimate = estimatePvcCompound(job);
  if (!estimate) return null;

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      marginBottom: '22px',
      padding: '14px',
    }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <Boxes size={16} color={COLORS.green} />
        <div style={{ color: COLORS.green, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          PVC Compound Estimate
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: '12px' }}>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
          <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Projected PVC</div>
          <div style={{ color: COLORS.green, fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{formatMoney(estimate.total)}</div>
        </div>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
          <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Records</div>
          <div style={{ color: COLORS.text, fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{estimate.quantity.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ color: COLORS.muted, fontSize: '12px', lineHeight: 1.4, marginBottom: '12px' }}>
        Standard vinyl {formatPvcRate(PVC_COST_PER_RECORD)}. Clear and splatter {formatPvcRate(PVC_COST_PER_RECORD_CLEAR_SPLATTER)}.
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        {estimate.lines.map((line, index) => (
          <div
            key={`${line.label}-${index}`}
            style={{
              alignItems: 'start',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              display: 'flex',
              gap: '10px',
              justifyContent: 'space-between',
              padding: '10px 12px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COLORS.text, fontSize: '14px', fontWeight: 850 }}>
                {line.label}
              </div>
              <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '4px' }}>
                {line.quantity.toLocaleString()} records · {formatPvcRate(line.rate)}
                {line.premium ? ' · clear/splatter' : ''}
              </div>
            </div>
            <div style={{ color: COLORS.green, fontSize: '14px', fontWeight: 900, whiteSpace: 'nowrap' }}>
              {formatMoney(line.cost)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pnlFromJob(job: Job): JobPnl {
  const raw = job.pnl;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'costTotal' in raw) {
    return raw as JobPnl;
  }
  return buildJobPnl(job);
}

function JobPnlPanel({ job, financeLoaded = false }: { job: Job; financeLoaded?: boolean }) {
  const pnl = pnlFromJob(job);
  const profitColor = pnl.grossProfit === null
    ? COLORS.muted
    : pnl.grossProfit >= 0 ? COLORS.green : COLORS.red;
  const invoiceLabel = pnl.clientInvoiceSource === 'quickbooks'
    ? 'QuickBooks'
    : pnl.clientInvoiceSource === 'airtable'
      ? 'Airtable'
      : financeLoaded ? 'Not found' : 'Looking up QuickBooks...';

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      marginBottom: '22px',
      padding: '14px',
    }}>
      <div style={{ color: COLORS.gold, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', marginBottom: '10px', textTransform: 'uppercase' }}>
        Job P&L
      </div>

      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: '12px' }}>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
          <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Client Invoice</div>
          <div style={{ color: COLORS.text, fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>
            {pnl.clientInvoice ? formatMoney(pnl.clientInvoice) : '—'}
          </div>
          <div style={{ color: COLORS.faint, fontSize: '11px', marginTop: '4px' }}>{invoiceLabel}</div>
          {pnl.clientInvoiceSource === 'none' && financeLoaded && (
            <div style={{ color: COLORS.faint, fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
              No QuickBooks match yet. The board uses artist/customer, album title, order #, and matrix ID — a matrix ID is not required.
            </div>
          )}
        </div>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px' }}>
          <div style={{ color: COLORS.muted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {pnl.grossProfit === null ? 'Need Invoice' : pnl.grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss'}
          </div>
          <div style={{ color: profitColor, fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>
            {pnl.grossProfit === null ? '—' : formatMoney(pnl.grossProfit)}
          </div>
          <div style={{ color: COLORS.faint, fontSize: '11px', marginTop: '4px' }}>
            {pnl.marginPct === null ? 'Match a client invoice to compare' : `${pnl.marginPct.toFixed(1)}% margin`}
          </div>
        </div>
      </div>

      {pnl.clientInvoices.length > 0 && (
        <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
          {pnl.clientInvoices.map(invoice => (
            <div key={invoice.id} style={{ color: COLORS.muted, fontSize: '12px', lineHeight: 1.4 }}>
              {invoice.docNumber ? `INV ${invoice.docNumber}` : 'Invoice'}
              {invoice.customerName ? ` · ${invoice.customerName}` : ''}
              {` · ${formatMoney(invoice.totalAmt)}`}
              {invoice.balance > 0 ? ` · ${formatMoney(invoice.balance)} open` : ' · paid'}
              {invoice.matchReason ? (
                <div style={{ color: COLORS.faint, fontSize: '11px', marginTop: '2px' }}>{invoice.matchReason}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: '8px' }}>
        {pnl.costs.map(line => (
          <div
            key={line.key}
            style={{
              alignItems: 'start',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              display: 'flex',
              gap: '10px',
              justifyContent: 'space-between',
              padding: '10px 12px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COLORS.text, fontSize: '14px', fontWeight: 850 }}>{line.label}</div>
              <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '4px', lineHeight: 1.4 }}>{line.detail}</div>
            </div>
            <div style={{ color: COLORS.text, fontSize: '14px', fontWeight: 900, whiteSpace: 'nowrap' }}>
              {formatMoney(line.amount)}
            </div>
          </div>
        ))}
        <div style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          padding: '4px 4px 0',
        }}>
          <div style={{ color: COLORS.muted, fontSize: '12px', fontWeight: 850, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Projected job cost
          </div>
          <div style={{ color: COLORS.gold, fontSize: '16px', fontWeight: 950 }}>
            {formatMoney(pnl.costTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}

function sortJobs(jobs: Job[]) {
  return [...jobs].sort((a, b) => {
    const orderDiff = dashboardOrder(a) - dashboardOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return value(a, ['customer', 'matrix']).localeCompare(value(b, ['customer', 'matrix']));
  });
}

function stationJobs(jobs: Job[], station: Station) {
  return sortJobs(jobs.filter(job => stationOf(job) === station));
}

function normalizeStationToken(raw: string): Station | undefined {
  const normalized = raw.toLowerCase().trim().replace(/["']/g, '').replace(/[\s-]+/g, '_');
  const aliases: Record<string, Station> = {
    prep: 'pre_production',
    pre_production: 'pre_production',
    preproduction: 'pre_production',
    queue: 'press_queue',
    press_queue: 'press_queue',
    pressing: 'now_pressing',
    now_pressing: 'now_pressing',
    qc: 'quality_control',
    quality: 'quality_control',
    quality_control: 'quality_control',
    sleeve: 'sleeving',
    sleeving: 'sleeving',
    build: 'assembly',
    assembly: 'assembly',
    ship: 'shipping',
    shipping: 'shipping',
  };

  if (STATIONS.includes(normalized as Station)) return normalized as Station;
  return aliases[normalized];
}

function contiguousStageSpan(stations: Station[]) {
  const indices = stations
    .map(station => STATIONS.indexOf(station))
    .filter(index => index >= 0);

  if (!indices.length) return [] as Station[];

  const start = Math.min(...indices);
  const end = Math.max(...indices);
  return STATIONS.slice(start, end + 1) as Station[];
}

function stageSpanFromNotes(notes: string) {
  const match = notes.match(STAGE_SPAN_MARKER_RE);
  if (!match) return [] as Station[];

  const parsedStations = match[1]
    .split(/\s*(?:,|\||>|→|–|—)\s*/)
    .map(normalizeStationToken)
    .filter(Boolean) as Station[];

  return contiguousStageSpan(parsedStations);
}

function stageSpanForJob(job: Job) {
  const jobStage = stationOf(job);
  if (jobStage === 'completed') return [] as Station[];

  const primary = jobStage as Station;
  const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
  const span = stageSpanFromNotes(rawDashNotes);

  if (span.length < 2 || !span.includes(primary)) return [primary];
  return span;
}

function stationVisualJobs(jobs: Job[], station: Station) {
  return sortJobs(jobs.filter(job => stageSpanForJob(job).includes(station)));
}

function stationAnchor(station: Station) {
  return `station-${station}`;
}

function stretchForJob(job: Job, isMobile: boolean) {
  if (isMobile) return undefined;

  const jobStage = stationOf(job);
  if (jobStage === 'completed') return undefined;

  const span = stageSpanForJob(job);
  if (span.length < 2) return undefined;

  const primaryIndex = STATIONS.indexOf(jobStage as Station);
  const startIndex = STATIONS.indexOf(span[0]);
  const endIndex = STATIONS.indexOf(span[span.length - 1]);
  if (primaryIndex < 0 || startIndex < 0 || endIndex < 0) return undefined;

  return {
    columns: endIndex - startIndex + 1,
    label: span.map(spanStation => STATION_META[spanStation].shortLabel).join(' -> '),
    offset: startIndex - primaryIndex,
  };
}

function stretchedJobs(jobs: Job[]) {
  return sortJobs(jobs.filter(job => stationOf(job) !== 'completed' && stageSpanForJob(job).length > 1));
}

type BoardLayoutEntry = {
  job: Job;
  startIndex: number;
  endIndex: number;
  top: number;
  height: number;
  stretched: boolean;
};

type SpanLayoutEntry = Omit<BoardLayoutEntry, 'stretched'>;
type ColumnSlot =
  | { kind: 'gap'; height: number }
  | { kind: 'span'; height: number; entry: BoardLayoutEntry }
  | { kind: 'job'; entry: BoardLayoutEntry };

function estimateCardHeight(job: Job) {
  const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
  const notes = value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']);
  const dashNotes = visibleDashNotes(rawDashNotes);
  const quantity = numericValue(value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']));
  const shipments = jobShipments(job);
  const stretched = stageSpanForJob(job).length > 1;
  let height = 128;
  if (stretched) height += 10;
  if (notes || dashNotes) height += 44;
  if (shipments.length) height += 32;
  if (stationOf(job) === 'now_pressing' && quantity > 0) height += 72;
  if (stationOf(job) === 'shipping') height += 44;
  if (isRushOrder(rawDashNotes)) height += 6;
  return height;
}

function layoutBoard(jobs: Job[], heightByKey: Record<string, number> = {}): BoardLayoutEntry[] {
  const items = jobs
    .filter(candidate => stationOf(candidate) !== 'completed')
    .map(job => {
      const span = stageSpanForJob(job);
      const stretched = span.length > 1;
      const startIndex = stretched
        ? STATIONS.indexOf(span[0])
        : STATIONS.indexOf(stationOf(job) as Station);
      const endIndex = stretched
        ? STATIONS.indexOf(span[span.length - 1])
        : startIndex;
      const key = jobKey(job);
      return {
        id: key,
        start: startIndex,
        end: endIndex,
        height: heightByKey[key] || estimateCardHeight(job),
        sort: dashboardOrder(job),
        tiebreak: key,
        job,
        stretched,
      };
    })
    .filter(item => item.start >= 0 && item.end >= item.start);

  return packSkyline(items, STATIONS.length, 0).map(entry => ({
    job: entry.job,
    startIndex: entry.start,
    endIndex: entry.end,
    top: entry.top,
    height: entry.height,
    stretched: entry.stretched,
  }));
}

function layoutStretchedJobs(jobs: Job[], heightByKey: Record<string, number> = {}): SpanLayoutEntry[] {
  return layoutBoard(jobs, heightByKey)
    .filter(entry => entry.stretched)
    .map(({ stretched: _stretched, ...entry }) => entry);
}

function columnSlots(board: BoardLayoutEntry[], station: Station): ColumnSlot[] {
  const stationIndex = STATIONS.indexOf(station);
  const occupying = board
    .filter(entry => stationIndex >= entry.startIndex && stationIndex <= entry.endIndex)
    .sort((a, b) => a.top - b.top || jobKey(a.job).localeCompare(jobKey(b.job)));

  const slots: ColumnSlot[] = [];
  let cursor = 0;
  for (const entry of occupying) {
    const hole = entry.top - cursor;
    if (hole > 1) slots.push({ kind: 'gap', height: hole });
    if (entry.stretched) slots.push({ kind: 'span', height: entry.height, entry });
    else slots.push({ kind: 'job', entry });
    cursor = entry.top + entry.height;
  }
  return slots;
}

function shiftedSpanForStage(job: Job, targetStage: Station) {
  const span = stageSpanForJob(job);
  if (span.length < 2) return span;

  const currentStage = stationOf(job);
  if (currentStage === 'completed') return span;

  const width = span.length;
  const targetIndex = STATIONS.indexOf(targetStage);
  const primaryIndex = STATIONS.indexOf(currentStage as Station);
  const startIndex = STATIONS.indexOf(span[0]);
  if (targetIndex < 0 || primaryIndex < 0 || startIndex < 0) return span;

  const primaryOffset = primaryIndex - startIndex;
  const maxStart = STATIONS.length - width;
  const nextStart = Math.min(maxStart, Math.max(0, targetIndex - primaryOffset));
  return STATIONS.slice(nextStart, nextStart + width) as Station[];
}

function searchableJobText(job: Job) {
  const variantText = jobRecords(job.variants)
    .map(variant => [
        variant.colors,
        variant.quantity,
        variant.run_label,
      ].filter(Boolean).join(' '))
    .join(' ');

  return [
    value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']),
    value(job, ['matrix', 'MATRIX', 'Matrix ID', 'job_id']),
    value(job, ['order_number', 'ORDER NUMBER']),
    value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']),
    value(job, ['colors', 'Colors', 'color', 'Color', 'Vinyl Color']),
    variantText,
    value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']),
    value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']),
  ].join(' ').toLowerCase();
}

function runLabelFromNotes(notes: string) {
  const match = notes.match(/\[Run\s+(\d+)\s*\/\s*(\d+)\]/i);
  return match ? `Run ${match[1]}/${match[2]}` : '';
}

function isRushOrder(notes: string) {
  return /\[Rush\s+Order\]/i.test(notes);
}

function visibleDashNotes(notes: string) {
  return notes
    .replace(/\[Run\s+\d+\s*\/\s*\d+\]/gi, '')
    .replace(/\[Rush\s+Order\]/gi, '')
    .replace(STAGE_SPAN_MARKER_GLOBAL_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatStageSpanMarker(span: Station[]) {
  const normalized = contiguousStageSpan(span);
  return normalized.length > 1 ? `[Stage Span: ${normalized.join(', ')}]` : '';
}

function dashNotesWithDashboardMarkers(
  originalNotes: string,
  visibleNotes: string,
  options?: boolean | { rushOverride?: boolean; stageSpanOverride?: Station[] },
) {
  const match = originalNotes.match(/\[Run\s+\d+\s*\/\s*\d+\]/i);
  const rushOverride = typeof options === 'boolean' ? options : options?.rushOverride;
  const stageSpanOverride = typeof options === 'object' ? options.stageSpanOverride : undefined;
  const rushed = rushOverride ?? isRushOrder(originalNotes);
  const stageSpan = stageSpanOverride ?? stageSpanFromNotes(originalNotes);
  return [
    match?.[0],
    rushed ? RUSH_MARKER : '',
    formatStageSpanMarker(stageSpan),
    visibleNotes.trim(),
  ].filter(Boolean).join('\n');
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function persistReorder(updates: Job[]) {
  const expandedUpdates = updates.flatMap((job, index) => (
    mergedRecordIds(job).map(jobId => ({
      job_id: jobId,
      stage: stationOf(job),
      order: index + 1,
    }))
  ));

  return fetch('/api/jobs/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: expandedUpdates }),
  });
}

async function persistJobPosition(job: Job, stage: DashboardStage, order: number) {
  let lastResponse: Response | null = null;
  for (const jobId of mergedRecordIds(job)) {
    lastResponse = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, order }),
    });
    if (!lastResponse.ok) return lastResponse;
  }
  return lastResponse ?? new Response(null, { status: 400 });
}

function persistDashNotes(job: Job, dashNotes: string) {
  return fetch(`/api/jobs/${encodeURIComponent(jobKey(job))}/dash-notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dash_notes: dashNotes }),
  });
}

function isStationDroppable(id: string): id is Station {
  return STATIONS.includes(id as Station);
}

function orderForInsertion(list: Job[], index: number) {
  const previous = index > 0 ? dashboardOrder(list[index - 1]) : undefined;
  const next = index < list.length - 1 ? dashboardOrder(list[index + 1]) : undefined;

  if (previous !== undefined && next !== undefined) {
    if (next > previous) return (previous + next) / 2;
    return previous + 1;
  }
  if (previous !== undefined) return previous + 1;
  if (next !== undefined) {
    // Insert strictly above the current first card. A 0.5 floor made every
    // later "move to top" collide with the existing #1 job, so sortJobs fell
    // back to customer/matrix name and the card snapped back.
    if (next > 0) return next / 2;
    return next - 1;
  }
  return 1;
}

function withSequentialOrders(list: Job[]) {
  return list.map((job, index) => ({
    ...job,
    dashboard_order: String(index + 1),
  }));
}

function jobKeysMatch(a: Job[], b: Job[]) {
  return a.length === b.length && a.every((job, index) => jobKey(job) === jobKey(b[index]));
}

function insertionSortsIntoPlace(list: Job[], index: number, order: number) {
  const nextList = list.map((job, jobIndex) => (
    jobIndex === index ? { ...job, dashboard_order: String(order) } : job
  ));
  return jobKeysMatch(nextList, sortJobs(nextList));
}

function orderAboveJobs(jobs: Job[]) {
  const orders = jobs.map(dashboardOrder);
  if (!orders.length) return 1;
  const min = Math.min(...orders);
  return min > 0 ? min / 2 : min - 1;
}

function resolveColumnDropFromPoint(
  x: number,
  y: number,
  draggingId: string,
): { droppableId: Station; index: number } | null {
  if (typeof document === 'undefined') return null;

  const section = document.elementsFromPoint(x, y).find((node): node is Element => (
    node instanceof Element && node.hasAttribute('data-station')
  ));
  const stationId = section?.getAttribute('data-station') || '';
  if (!section || !isStationDroppable(stationId)) return null;

  const draggingKey = draggingId.replace(/^span-/, '');
  const cards = [
    ...section.querySelectorAll('[data-column-job-key]'),
    ...document.querySelectorAll(`[data-span-stations~="${stationId}"]`),
  ].filter((node): node is HTMLElement => node instanceof HTMLElement);

  const unique: HTMLElement[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const key = card.dataset.columnJobKey || card.dataset.spanJobKey || '';
    if (!key || key === draggingKey || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  unique.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  let index = unique.length;
  for (let cardIndex = 0; cardIndex < unique.length; cardIndex += 1) {
    const rect = unique[cardIndex].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      index = cardIndex;
      break;
    }
  }

  return { droppableId: stationId, index };
}

function StatusPill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      color,
      background: `${color}1F`,
      border: `1px solid ${color}66`,
      borderRadius: '999px',
      fontSize: '14px',
      fontWeight: 800,
      letterSpacing: '0.05em',
      padding: '3px 8px',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  );
}

function StationIcon({ station, size = 20 }: { station: Station; size?: number }) {
  const meta = STATION_META[station];
  const Icon = meta.icon;
  return (
    <div style={{
      width: size + 18,
      height: size + 18,
      borderRadius: station === 'now_pressing' ? '50%' : '8px',
      display: 'grid',
      placeItems: 'center',
      color: meta.color,
      background: `${meta.color}18`,
      border: `1px solid ${meta.color}55`,
      boxShadow: station === 'now_pressing' ? `0 0 22px ${meta.color}55` : undefined,
    }}>
      <Icon size={size} strokeWidth={station === 'now_pressing' ? 2.8 : 2.2} />
    </div>
  );
}

function JobCard({
  job,
  onOpen,
  onComplete,
  dragHandleProps,
  compact = false,
  queueRank,
  stretch,
}: {
  job: Job;
  onOpen: () => void;
  onComplete: () => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  compact?: boolean;
  queueRank?: number;
  stretch?: {
    columns: number;
    label: string;
    offset: number;
  };
}) {
  const jobStage = stationOf(job);
  const station: Station = jobStage === 'completed' ? 'shipping' : jobStage;
  const meta = STATION_META[station];
  const stageSpan = stageSpanForJob(job);
  const stretchLabel = stretch?.label ?? (stageSpan.length > 1 ? stageSpan.map(spanStation => STATION_META[spanStation].shortLabel).join(' -> ') : '');
  const customer = value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']) || 'Untitled job';
  const matrix = value(job, ['matrix', 'MATRIX', 'Matrix ID', 'job_id']);
  const quantity = value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']);
  const quantityTotal = numericValue(quantity);
  const pressedTotal = displayedRecordsPressed(job);
  const pressLogCount = numericValue(value(job, ['press_log_count']));
  const sinceBaseline = recordsPressedSinceBaseline(job);
  const usingManualBaseline = manualRecordsPressed(job) !== null;
  const showPressProgress = station === 'now_pressing' && quantityTotal > 0;
  const progressPct = showPressProgress ? Math.min(100, Math.max(0, (pressedTotal / quantityTotal) * 100)) : 0;
  const colors = value(job, ['colors', 'Colors', 'color', 'Color', 'Vinyl Color']);
  const weight = value(job, ['weight', 'Weight', 'Weight (g)']);
  const speed = value(job, ['speed', 'SPEED', 'Speed', 'RPM']);
  const shipDate = value(job, ['ship_date', 'SHIP DATE', 'Ship Date']);
  const notes = value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']);
  const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
  const dashNotes = visibleDashNotes(rawDashNotes);
  const runLabel = runLabelFromNotes(rawDashNotes);
  const rushed = isRushOrder(rawDashNotes);
  const inferredReason = value(job, ['inferred_stage_reason']);
  const inferredAt = value(job, ['inferred_stage_at']);
  const duplicateCount = variantCount(job);
  const hasVariants = duplicateCount > 1 && Array.isArray(job.variants) && job.variants.length > 1;
  const artReady = job.art_received === true || job.art_received === 'true';
  const canComplete = station === 'shipping';
  const completeColor = COLORS.red;
  const isStretched = Boolean(stretch && stretch.columns > 1);
  const shipments = jobShipments(job);
  const activeShipments = shipments.filter(isActiveShipment);
  const headlineShipment = activeShipments[0] || shipments[0];
  const extraActiveCount = activeShipments.length > 1 ? activeShipments.length - 1 : 0;

  return (
    <div
      onClick={onOpen}
      {...dragHandleProps}
      style={{
        background: rushed
          ? `linear-gradient(135deg, ${COLORS.red}24 0%, ${COLORS.card} 52%, ${COLORS.red}14 100%)`
          : isStretched ? `linear-gradient(135deg, ${meta.color}18 0%, ${COLORS.card} 35%, ${COLORS.card} 100%)` : COLORS.card,
        border: `1px solid ${rushed ? `${COLORS.red}88` : COLORS.border}`,
        borderLeft: `4px solid ${rushed ? COLORS.red : meta.color}`,
        borderRadius: '8px',
        boxSizing: 'border-box',
        boxShadow: rushed
          ? `0 0 0 1px ${COLORS.red}33, 0 12px 30px #00000055`
          : isStretched ? `0 0 0 1px ${meta.color}33, 0 12px 30px #00000066` : station === 'now_pressing' ? `0 0 0 1px ${meta.color}44, 0 12px 30px #00000055` : '0 8px 18px #00000035',
        cursor: 'pointer',
        marginBottom: '8px',
        padding: compact ? '13px' : '10px',
        position: 'relative',
        userSelect: 'none',
        width: '100%',
        zIndex: isStretched ? 8 : 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = rushed ? COLORS.red : meta.color)}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = rushed ? `${COLORS.red}88` : COLORS.border;
        e.currentTarget.style.borderLeftColor = rushed ? COLORS.red : meta.color;
      }}
    >
      {queueRank && (
        <div style={{
          alignItems: 'center',
          background: '#071823',
          border: `1px solid ${STATION_META.press_queue.color}AA`,
          borderRadius: '999px',
          boxShadow: `0 0 18px ${STATION_META.press_queue.color}26`,
          color: STATION_META.press_queue.color,
          display: 'flex',
          fontFamily: 'monospace',
          fontSize: compact ? '14px' : '13px',
          fontWeight: 950,
          height: compact ? '34px' : '30px',
          justifyContent: 'center',
          lineHeight: 1,
          minWidth: compact ? '34px' : '30px',
          padding: '0 8px',
          position: 'absolute',
          right: '8px',
          top: '8px',
        }}>
          #{queueRank}
        </div>
      )}

      <div style={{ paddingRight: queueRank ? '42px' : undefined }}>
        <div>
          <div style={{ color: COLORS.text, fontSize: compact ? '20px' : '18px', fontWeight: 850, lineHeight: 1.18 }}>
            {customer.length > (compact ? 96 : 72) ? `${customer.slice(0, compact ? 96 : 72)}...` : customer}
          </div>
          {matrix && (
            <div style={{ color: COLORS.muted, fontFamily: 'monospace', fontSize: compact ? '15px' : '14px', marginTop: '5px' }}>
              {matrix}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '9px' }}>
          {stretchLabel && <StatusPill color={meta.color}>Spans {stretchLabel}</StatusPill>}
          {rushed && <StatusPill color={COLORS.red}>Rush</StatusPill>}
          {quantity && <StatusPill color={meta.color}>{quantity}</StatusPill>}
          {colors && <StatusPill color="#C9A84C">{colors}</StatusPill>}
          {weight && <StatusPill color="#9CCFFF">{weight.replace('1900-05-29T00:00:00.000Z', '180g')}</StatusPill>}
          {speed && <StatusPill color="#B781FF">{speed}</StatusPill>}
          {runLabel && <StatusPill color={COLORS.green}>{runLabel}</StatusPill>}
          {artReady && <StatusPill color={COLORS.green}>Art</StatusPill>}
          {headlineShipment && (
            <StatusPill color={shipmentStatusTone(headlineShipment.status)}>
              {headlineShipment.carrier || 'Ship'} · {shipmentStatusShort(headlineShipment.status)}
            </StatusPill>
          )}
          {extraActiveCount > 0 && <StatusPill color={COLORS.blue}>+{extraActiveCount} tracking</StatusPill>}
          {shipDate && <StatusPill color="#4DA3FF">{shipDate}</StatusPill>}
          {hasVariants
            ? <StatusPill color="#FFB84D">{duplicateCount} variants</StatusPill>
            : duplicateCount > 1 && <StatusPill color="#FFB84D">{duplicateCount} merged</StatusPill>}
        </div>

        {headlineShipment && (
          <div style={{
            alignItems: 'center',
            color: COLORS.muted,
            display: 'flex',
            flexWrap: 'wrap',
            fontSize: compact ? '14px' : '13px',
            gap: '6px',
            lineHeight: 1.35,
            marginTop: '9px',
          }}>
            <Truck size={13} color={shipmentStatusTone(headlineShipment.status)} />
            <span style={{ color: shipmentStatusTone(headlineShipment.status), fontWeight: 850 }}>
              {headlineShipment.direction === 'outbound' ? 'Outbound' : 'Inbound'}
            </span>
            {headlineShipment.tracking_number && (
              <span style={{ fontFamily: 'monospace' }}>
                {headlineShipment.tracking_number.length > 18
                  ? `${headlineShipment.tracking_number.slice(0, 18)}…`
                  : headlineShipment.tracking_number}
              </span>
            )}
            {headlineShipment.est_delivery && !headlineShipment.status.toLowerCase().includes('delivered') && (
              <span>ETA {headlineShipment.est_delivery}</span>
            )}
            {headlineShipment.delivered_date && (
              <span>Delivered {headlineShipment.delivered_date}</span>
            )}
          </div>
        )}

        {notes && (
          <div style={{
            color: COLORS.muted,
            display: '-webkit-box',
            fontSize: compact ? '16px' : '15px',
            lineHeight: 1.35,
            marginTop: '9px',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
          }}>
            {notes}
          </div>
        )}

        {showPressProgress && (
          <div style={{
            background: '#0E1711',
            border: `1px solid ${meta.color}44`,
            borderRadius: '7px',
            marginTop: '10px',
            padding: compact ? '10px' : '8px',
          }}>
            <div style={{
              alignItems: 'baseline',
              color: COLORS.text,
              display: 'flex',
              fontSize: compact ? '15px' : '14px',
              fontWeight: 850,
              justifyContent: 'space-between',
              lineHeight: 1.2,
            }}>
              <span>Pressed</span>
              <span>
                {pressedTotal.toLocaleString()} / {quantityTotal.toLocaleString()}
              </span>
            </div>
            <div style={{
              background: '#050805',
              borderRadius: '999px',
              height: compact ? '9px' : '8px',
              marginTop: '7px',
              overflow: 'hidden',
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${meta.color}, #C9FFE0)`,
                borderRadius: '999px',
                boxShadow: `0 0 14px ${meta.color}66`,
                height: '100%',
                width: `${progressPct}%`,
              }} />
            </div>
            <div style={{
              color: COLORS.muted,
              fontSize: compact ? '13px' : '12px',
              fontWeight: 750,
              marginTop: '6px',
            }}>
              {Math.round(progressPct)}% complete
              {usingManualBaseline
                ? sinceBaseline > 0
                  ? ` · ${manualRecordsPressed(job)!.toLocaleString()} baseline + ${sinceBaseline.toLocaleString()} logged`
                  : ' · baseline set'
                : pressLogCount
                  ? ` · ${pressLogCount} press log${pressLogCount === 1 ? '' : 's'}`
                  : ''}
            </div>
          </div>
        )}

        {dashNotes && (
          <div style={{
            background: `${meta.color}12`,
            border: `1px solid ${meta.color}38`,
            borderRadius: '6px',
            color: COLORS.text,
            display: '-webkit-box',
            fontSize: compact ? '16px' : '15px',
            lineHeight: 1.35,
            marginTop: '9px',
            overflow: 'hidden',
            padding: '7px 8px',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
          }}>
            <span style={{ color: meta.color, fontWeight: 850 }}>Dash:</span> {dashNotes}
          </div>
        )}

        {inferredReason && (
          <div style={{
            background: `${meta.color}12`,
            border: `1px solid ${meta.color}44`,
            borderRadius: '6px',
            color: COLORS.muted,
            fontSize: '13px',
            fontWeight: 750,
            lineHeight: 1.35,
            marginTop: '9px',
            padding: '6px 7px',
          }}>
            <span style={{ color: meta.color }}>Log signal:</span> {inferredReason}
            {inferredAt && <span> · {new Date(inferredAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
          </div>
        )}
      </div>

      {canComplete && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onComplete();
          }}
          style={{
            alignItems: 'center',
            background: `${completeColor}22`,
            border: `1px solid ${completeColor}88`,
            borderRadius: '6px',
            color: completeColor,
            cursor: 'pointer',
            display: 'flex',
            fontSize: '13px',
            fontWeight: 850,
            gap: '5px',
            justifyContent: 'center',
            marginTop: '9px',
            padding: '6px 8px',
            width: '100%',
          }}
        >
          <BadgeCheck size={13} />
          Mark Complete
        </button>
      )}
    </div>
  );
}

function Pipeline({
  jobs,
  visibleJobs = jobs,
  onJobsChange,
  onJobOpen,
  onError,
  onBusyChange,
  isMobile = false,
}: {
  jobs: Job[];
  visibleJobs?: Job[];
  onJobsChange: (jobs: Job[]) => void;
  onJobOpen: (job: Job) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  isMobile?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [confirmCompleteJob, setConfirmCompleteJob] = useState<Job | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStation, setDragOverStation] = useState<Station | null>(null);
  const lastStationDropRef = useRef<{ droppableId: Station; index: number } | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [overlayTop, setOverlayTop] = useState(96);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!draggingId) return undefined;
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [draggingId]);

  const rememberCardHeight = useCallback((key: string, height: number) => {
    if (!key || height < 8) return;
    setCardHeights(current => {
      if (Math.abs((current[key] || 0) - height) < 2) return current;
      return { ...current, [key]: height };
    });
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;

    const cardArea = board.querySelector('[data-station-cards]');
    if (cardArea instanceof HTMLElement) {
      const nextTop = cardArea.getBoundingClientRect().top - board.getBoundingClientRect().top;
      if (Math.abs(nextTop - overlayTop) > 1) setOverlayTop(nextTop);
    }

    const syncHeights = () => {
      board.querySelectorAll<HTMLElement>('[data-height-key]').forEach(node => {
        if (draggingId && (node.dataset.heightKey === draggingId || draggingId === `span-${node.dataset.heightKey}`)) {
          return;
        }
        rememberCardHeight(node.dataset.heightKey || '', node.getBoundingClientRect().height);
      });
    };

    const observer = new ResizeObserver(syncHeights);
    board.querySelectorAll('[data-height-key]').forEach(node => observer.observe(node));
    syncHeights();
    return () => observer.disconnect();
  }, [draggingId, overlayTop, rememberCardHeight, visibleJobs]);

  const saveMovedJob = async (job: Job, stage: DashboardStage, order: number) => {
    const response = await persistJobPosition(job, stage, order);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Airtable save failed (${response.status})`);
    }
  };

  const confirmComplete = async () => {
    const job = confirmCompleteJob;
    setConfirmCompleteJob(null);
    if (!job) return;
    await completeJob(job);
  };

  const onDragStart = (start: { draggableId: string }) => {
    onBusyChange?.(true);
    setDraggingId(start.draggableId);
    lastStationDropRef.current = null;
  };

  const onDragUpdate = (update: DragUpdate) => {
    const destination = update.destination;
    if (destination && isStationDroppable(destination.droppableId)) {
      setDragOverStation(destination.droppableId);
      lastStationDropRef.current = {
        droppableId: destination.droppableId,
        index: destination.index,
      };
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const hoveredStation = dragOverStation;
    const lastStationDrop = lastStationDropRef.current;
    setDraggingId(null);
    setDragOverStation(null);
    lastStationDropRef.current = null;
    try {
    if (result.reason === 'CANCEL') return;

    const fromId = result.source.droppableId;
    const fromStretched = fromId === STRETCHED_DROPPABLE_ID;
    const hitDrop = resolveColumnDropFromPoint(pointerRef.current.x, pointerRef.current.y, result.draggableId);
    let toId = hitDrop?.droppableId ?? result.destination?.droppableId;
    let destinationIndex = hitDrop?.index ?? result.destination?.index ?? 0;
    let toStretched = !hitDrop && toId === STRETCHED_DROPPABLE_ID;
    const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
    const visibleActiveJobs = visibleJobs.filter(job => stationOf(job) !== 'completed');
    const hiddenJobs = jobs.filter(job => stationOf(job) === 'completed');
    const activeSpanKeys = new Set(
      (isMobile ? [] : layoutStretchedJobs(visibleJobs, cardHeights))
        .map(entry => jobKey(entry.job))
        .filter(Boolean)
    );
    const visibleColumnJobs = (station: Station) => (
      stationJobs(visibleActiveJobs, station).filter(job => isMobile || !activeSpanKeys.has(jobKey(job)))
    );

    if (!hitDrop && (!result.destination || toStretched) && !fromStretched) {
      const fallbackStation = lastStationDrop?.droppableId ?? hoveredStation;
      if (!fallbackStation) return;
      toId = fallbackStation;
      toStretched = false;
      destinationIndex = lastStationDrop?.droppableId === fallbackStation
        ? lastStationDrop.index
        : 0;
    }

    const sourceList = fromStretched
      ? stretchedJobs(visibleActiveJobs)
      : isStationDroppable(fromId)
        ? visibleColumnJobs(fromId)
        : [];
    const [moved] = sourceList.splice(result.source.index, 1);
    if (!moved) return;

    const dropStation = toId && isStationDroppable(toId)
      ? toId
      : fromStretched && hoveredStation
        ? hoveredStation
        : null;
    if (!dropStation) return;

    const currentSpan = stageSpanForJob(moved);
    const keepStretch = fromStretched && currentSpan.includes(dropStation);
    const targetStage = keepStretch ? stationOf(moved) : dropStation;
    const rawDashNotes = value(moved, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
    const preservedSpan = fromStretched && !keepStretch
      ? shiftedSpanForStage(moved, dropStation)
      : undefined;
    const nextDashNotes = preservedSpan
      ? dashNotesWithDashboardMarkers(rawDashNotes, visibleDashNotes(rawDashNotes), { stageSpanOverride: preservedSpan })
      : undefined;
    const movedNext = {
      ...moved,
      stage: targetStage,
      ...(nextDashNotes !== undefined ? { dash_notes: nextDashNotes, 'Dash Notes': nextDashNotes } : {}),
    };

    const destinationAfterVisual = stationVisualJobs(visibleActiveJobs, dropStation)
      .filter(job => jobKey(job) !== jobKey(moved));
    destinationIndex = Math.max(0, Math.min(destinationIndex, destinationAfterVisual.length));
    const previousVisualIndex = stationVisualJobs(visibleActiveJobs, dropStation)
      .findIndex(job => jobKey(job) === jobKey(moved));
    const sameVisualColumn = keepStretch || fromId === dropStation;
    if (sameVisualColumn && previousVisualIndex === destinationIndex && !nextDashNotes) return;

    destinationAfterVisual.splice(destinationIndex, 0, movedNext);

    let destinationAfterMove = destinationAfterVisual;
    let movedOrder = orderForInsertion(destinationAfterMove, destinationIndex);
    const neighborsToBeat = destinationAfterMove.slice(destinationIndex + 1);
    if (neighborsToBeat.length && destinationIndex === 0) {
      movedOrder = orderAboveJobs(neighborsToBeat);
    }
    let persistColumn = false;
    if (insertionSortsIntoPlace(destinationAfterMove, destinationIndex, movedOrder)) {
      destinationAfterMove = destinationAfterMove.map((job, index) => (
        index === destinationIndex ? { ...movedNext, dashboard_order: String(movedOrder) } : job
      ));
    } else {
      destinationAfterMove = withSequentialOrders(destinationAfterMove);
      persistColumn = true;
    }

    const replacements = new Map(destinationAfterMove.map(job => [jobKey(job), job]));
    const rebuilt = activeJobs.map(job => replacements.get(jobKey(job)) ?? job);
    const nextJobs = [...rebuilt, ...hiddenJobs];
    const movedPersisted = replacements.get(jobKey(moved)) ?? { ...movedNext, dashboard_order: String(movedOrder) };

    onJobsChange(nextJobs);
    onError('');

    try {
      if (persistColumn) {
        const response = await persistReorder(destinationAfterMove);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Airtable save failed (${response.status})`);
        }
      } else {
        await saveMovedJob(movedPersisted, targetStage, dashboardOrder(movedPersisted));
      }
      if (nextDashNotes !== undefined) {
        const notesResponse = await persistDashNotes(movedPersisted, nextDashNotes);
        if (!notesResponse.ok) {
          const body = await notesResponse.json().catch(() => ({}));
          throw new Error(body.error || `Airtable stretch save failed (${notesResponse.status})`);
        }
      }
    } catch (error) {
      onError(`Move shown locally, but Airtable save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    } finally {
      onBusyChange?.(false);
    }
  };

  const completeJob = async (job: Job) => {
    const current = stationOf(job);
    if (current !== 'shipping') return;
    const target = 'completed';
    onBusyChange?.(true);
    const nextJobs = jobs.map(candidate => (
      jobKey(candidate) === jobKey(job) ? { ...candidate, stage: target, dashboard_order: '999999' } : candidate
    ));

    onJobsChange(nextJobs);
    onError('');

    try {
      const response = await persistJobPosition(job, target, 999999);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Airtable save failed (${response.status})`);
      }
    } catch (error) {
      onJobsChange(jobs);
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onBusyChange?.(false);
    }
  };

  if (!mounted) {
    return <div style={{ color: COLORS.muted, padding: '24px' }}>Loading board...</div>;
  }

  const boardLayout = isMobile ? [] : layoutBoard(visibleJobs, cardHeights);
  const spanLayout = boardLayout.filter(entry => entry.stretched);
  const spanLayerHeight = spanLayout.length
    ? Math.max(...spanLayout.map(entry => entry.top + entry.height))
    : 0;

  return (
    <DragDropContext onDragStart={onDragStart} onDragUpdate={onDragUpdate} onDragEnd={onDragEnd}>
      <div
        ref={boardRef}
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(0, 1fr))',
          gap: isMobile ? '14px' : '10px',
          paddingBottom: '12px',
          position: 'relative',
        }}
      >
        {!isMobile && spanLayout.length > 0 && (
          <div
            aria-label="Stretched production jobs"
            style={{
              display: 'grid',
              gap: '10px',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gridTemplateRows: `${Math.max(spanLayerHeight, 1)}px`,
              height: `${spanLayerHeight}px`,
              left: 0,
              pointerEvents: 'none',
              position: 'absolute',
              right: 0,
              top: `${overlayTop}px`,
              zIndex: 20,
            }}
          >
            <Droppable droppableId={STRETCHED_DROPPABLE_ID} isDropDisabled>
              {provided => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{ display: 'contents' }}
                >
                  {spanLayout.map((entry, index) => {
                    const { job, startIndex, endIndex } = entry;
                    const key = jobKey(job);
                    const stretch = stretchForJob(job, isMobile);
                    const isDraggingNormalJob = Boolean(draggingId && !draggingId.startsWith('span-'));
                    const isThisStretchedCard = draggingId === `span-${key}`;
                    return (
                      <Draggable key={`span-${key}`} draggableId={`span-${key}`} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              alignSelf: 'start',
                              gridColumn: `${startIndex + 1} / ${endIndex + 2}`,
                              gridRow: '1',
                              marginTop: entry.top,
                              minWidth: 0,
                              opacity: dragSnapshot.isDragging ? 0.88 : 1,
                              pointerEvents: isDraggingNormalJob && !isThisStretchedCard ? 'none' : 'auto',
                            }}
                            data-job-key={key}
                            data-span-job-key={key}
                            data-span-stations={stageSpanForJob(job).join(' ')}
                            data-height-key={key}
                          >
                            <JobCard
                              job={job}
                              onOpen={() => onJobOpen(job)}
                              onComplete={() => setConfirmCompleteJob(job)}
                              dragHandleProps={dragProvided.dragHandleProps}
                              stretch={stretch}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  <div style={{
                    gridColumn: '1',
                    height: 0,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    width: 0,
                  }}>
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          </div>
        )}
        {STATIONS.map(station => {
          const meta = STATION_META[station];
          const slots = isMobile
            ? stationJobs(visibleJobs, station).map(job => ({ kind: 'job' as const, entry: { job, startIndex: 0, endIndex: 0, top: 0, height: 0, stretched: false } }))
            : columnSlots(boardLayout, station);
          const isNowPressing = station === 'now_pressing';
          const visualQueue = station === 'press_queue' ? stationVisualJobs(visibleJobs, station) : [];
          let jobDragIndex = 0;

          return (
            <Droppable droppableId={station} key={station}>
              {(provided, snapshot) => (
                <section
                  id={stationAnchor(station)}
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  data-station={station}
                  style={{
                    background: snapshot.isDraggingOver ? `${meta.color}14` : COLORS.panel,
                    border: `1px solid ${isNowPressing ? `${meta.color}88` : COLORS.border}`,
                    borderRadius: '8px',
                    minHeight: isMobile ? 'auto' : '620px',
                    minWidth: 0,
                    overflow: 'visible',
                    padding: isMobile ? '10px' : '8px',
                    position: 'relative',
                    scrollMarginTop: isMobile ? '96px' : '112px',
                    transition: 'background 0.15s',
                    zIndex: 1,
                  }}
                >
                  <div style={{ borderBottom: `1px solid ${COLORS.border}`, marginBottom: '8px', paddingBottom: '9px' }}>
                    <div style={{ alignItems: 'center', display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                      <div style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
                        <StationIcon station={station} size={16} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            color: meta.color,
                            fontSize: isMobile ? '19px' : isNowPressing ? '14px' : '13px',
                            fontWeight: 950,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            whiteSpace: 'normal',
                            lineHeight: 1.1,
                          }}>
                            {meta.label}
                          </div>
                          <div style={{ color: COLORS.faint, fontSize: isMobile ? '15px' : '13px', marginTop: '3px', lineHeight: 1.15 }}>
                            {meta.description}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        background: `${meta.color}22`,
                        border: `1px solid ${meta.color}66`,
                        borderRadius: '999px',
                        color: meta.color,
                        fontSize: '14px',
                        fontWeight: 900,
                        minWidth: '28px',
                        padding: '2px 7px',
                        textAlign: 'center',
                        flexShrink: 0,
                      }}>
                        {stationVisualJobs(visibleJobs, station).length}
                      </div>
                    </div>
                  </div>

                  <div
                    data-station-cards="true"
                    style={{
                      borderRadius: '8px',
                      minHeight: isMobile ? '72px' : '540px',
                    }}
                  >
                    {slots.map((slot, slotIndex) => {
                      if (slot.kind === 'gap' || slot.kind === 'span') {
                        return (
                          <div
                            key={`${station}-${slot.kind}-${slotIndex}`}
                            aria-hidden="true"
                            style={{ height: slot.height, pointerEvents: 'none' }}
                          />
                        );
                      }

                      const job = slot.entry.job;
                      const index = jobDragIndex;
                      jobDragIndex += 1;
                      const visualIndex = visualQueue.findIndex(candidate => jobKey(candidate) === jobKey(job));
                      return (
                        <Draggable key={jobKey(job)} draggableId={jobKey(job)} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              style={{
                                ...dragProvided.draggableProps.style,
                                opacity: dragSnapshot.isDragging ? 0.88 : 1,
                              }}
                              data-job-key={jobKey(job)}
                              data-column-job-key={jobKey(job)}
                              data-height-key={jobKey(job)}
                            >
                              <JobCard
                                job={job}
                                onOpen={() => onJobOpen(job)}
                                onComplete={() => setConfirmCompleteJob(job)}
                                dragHandleProps={dragProvided.dragHandleProps}
                                compact={isMobile}
                                queueRank={station === 'press_queue' && visualIndex >= 0 ? visualIndex + 1 : undefined}
                                stretch={stretchForJob(job, isMobile)}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                </section>
              )}
            </Droppable>
          );
        })}
      </div>
      {confirmCompleteJob && (
        <>
          <div
            onClick={() => setConfirmCompleteJob(null)}
            style={{
              background: '#000000AA',
              inset: 0,
              position: 'fixed',
              zIndex: 120,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-confirm-title"
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.red}77`,
              borderRadius: '8px',
              boxShadow: '0 24px 70px #000000AA',
              left: '50%',
              maxWidth: 'min(360px, calc(100vw - 32px))',
              padding: '20px',
              position: 'fixed',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              zIndex: 121,
            }}
          >
            <div id="complete-confirm-title" style={{ color: COLORS.text, fontSize: '18px', fontWeight: 900, lineHeight: 1.25 }}>
              are you sure slick?
            </div>
            <div style={{ color: COLORS.muted, fontSize: '13px', lineHeight: 1.45, marginTop: '8px' }}>
              This will mark the job complete and move it into the Completed Airtable database.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => setConfirmCompleteJob(null)}
                style={{
                  background: COLORS.elevated,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  color: COLORS.text,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 850,
                  padding: '9px 14px',
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={confirmComplete}
                style={{
                  background: COLORS.red,
                  border: `1px solid ${COLORS.red}`,
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 900,
                  padding: '9px 14px',
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </>
      )}
    </DragDropContext>
  );
}

function JobDrawer({
  job,
  onClose,
  onDashNotesSave,
  onRushToggle,
  onStageSpanSave,
  onSplitJob,
  onRecordsPressedSave,
  onShipmentsChanged,
  financeLoaded = false,
}: {
  job: Job;
  onClose: () => void;
  onDashNotesSave: (job: Job, dashNotes: string) => Promise<void>;
  onRushToggle: (job: Job, rushed: boolean) => Promise<void>;
  onStageSpanSave: (job: Job, span: Station[]) => Promise<void>;
  onSplitJob: (job: Job, payload: { stage: Station; quantity: string }) => Promise<void>;
  onRecordsPressedSave: (job: Job, recordsPressed: number | null) => Promise<void>;
  onShipmentsChanged?: () => Promise<void> | void;
  financeLoaded?: boolean;
}) {
  const jobStage = stationOf(job);
  const station: Station = jobStage === 'completed' ? 'shipping' : jobStage;
  const meta = STATION_META[station];
  const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
  const dashNotes = visibleDashNotes(rawDashNotes);
  const runLabel = runLabelFromNotes(rawDashNotes);
  const rushed = isRushOrder(rawDashNotes);
  const currentStageSpan = stageSpanForJob(job);
  const currentSpanStart = currentStageSpan[0] ?? station;
  const currentSpanEnd = currentStageSpan[currentStageSpan.length - 1] ?? station;
  const [draftDashNotes, setDraftDashNotes] = useState(dashNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingRush, setSavingRush] = useState(false);
  const [spanStart, setSpanStart] = useState<Station>(currentSpanStart);
  const [spanEnd, setSpanEnd] = useState<Station>(currentSpanEnd);
  const [savingSpan, setSavingSpan] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [spanError, setSpanError] = useState('');
  const [splitStage, setSplitStage] = useState<Station>('now_pressing');
  const [splitQuantity, setSplitQuantity] = useState('');
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState('');
  const quantityTotal = numericValue(value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']));
  const currentManualPressed = manualRecordsPressed(job);
  const currentDisplayedPressed = displayedRecordsPressed(job);
  const currentSinceBaseline = recordsPressedSinceBaseline(job);
  const currentAllTimeLogs = allTimeLogRecordsPressed(job);
  const [draftRecordsPressed, setDraftRecordsPressed] = useState(
    currentManualPressed !== null ? String(currentManualPressed) : String(currentDisplayedPressed || ''),
  );
  const [savingRecordsPressed, setSavingRecordsPressed] = useState(false);
  const [recordsPressedError, setRecordsPressedError] = useState('');

  useEffect(() => {
    const manual = manualRecordsPressed(job);
    setDraftRecordsPressed(manual !== null ? String(manual) : String(displayedRecordsPressed(job) || ''));
    setRecordsPressedError('');
  }, [job]);

  useEffect(() => {
    setDraftDashNotes(dashNotes);
    setNotesError('');
  }, [dashNotes, job]);

  useEffect(() => {
    setSpanStart(currentSpanStart);
    setSpanEnd(currentSpanEnd);
    setSpanError('');
  }, [currentSpanStart, currentSpanEnd, job]);

  const variants = jobRecords(job.variants);
  const details = [
    ['Station', jobStage === 'completed' ? 'Completed' : meta.label],
    ['Run', runLabel],
    ['Customer', value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title'])],
    ['Matrix', value(job, ['matrix', 'MATRIX', 'Matrix ID'])],
    ['Quantity', value(job, ['quantity', 'Quantity', 'Qty'])],
    ['Color', value(job, ['colors', 'Colors', 'Color'])],
    ['Weight', value(job, ['weight', 'Weight'])],
    ['Speed', value(job, ['speed', 'SPEED'])],
    ['Lacquer', value(job, ['lacquer', 'Lacquer'])],
    ['Stampers', value(job, ['stampers', 'Stampers'])],
    ['TP Sent', value(job, ['test_pressings_sent', 'Test pressings', 'Sent?'])],
    ['TP Approved', value(job, ['test_pressings_approved', 'approved?'])],
    ['Labels', value(job, ['labels_arrived', 'center labels'])],
    ['Sleeves', value(job, ['sleeves_arrived', 'Inner sleeves'])],
    ['Jackets', value(job, ['jackets_arrived', 'Jackets'])],
    ['Ship Date', value(job, ['ship_date', 'SHIP DATE'])],
    ['Order', value(job, ['order_number', 'ORDER NUMBER'])],
  ].filter(([, detail]) => detail);
  const notes = value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']);
  const stationIndex = STATIONS.indexOf(station);
  const leftEdgeStations = STATIONS.slice(0, stationIndex + 1) as Station[];
  const rightEdgeStations = STATIONS.slice(stationIndex) as Station[];
  const saveDashNotes = async () => {
    setSavingNotes(true);
    setNotesError('');
    try {
      await onDashNotesSave(job, dashNotesWithDashboardMarkers(rawDashNotes, draftDashNotes));
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingNotes(false);
    }
  };
  const notesDirty = draftDashNotes !== dashNotes;
  const selectedStageSpan = contiguousStageSpan([station, spanStart, spanEnd]);
  const selectedSpanText = selectedStageSpan.map(spanStation => STATION_META[spanStation].shortLabel).join(' -> ');
  const spanDirty = selectedStageSpan.join('|') !== currentStageSpan.join('|');
  const toggleRush = async () => {
    setSavingRush(true);
    setNotesError('');
    try {
      await onRushToggle(job, !rushed);
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingRush(false);
    }
  };
  const saveStageSpan = async (span: Station[]) => {
    setSavingSpan(true);
    setSpanError('');
    try {
      await onStageSpanSave(job, span);
    } catch (error) {
      setSpanError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingSpan(false);
    }
  };
  const createSplit = async () => {
    setSplitting(true);
    setSplitError('');
    try {
      await onSplitJob(job, {
        stage: splitStage,
        quantity: splitQuantity,
      });
    } catch (error) {
      setSplitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSplitting(false);
    }
  };
  const saveRecordsPressed = async (recordsPressed: number | null) => {
    setSavingRecordsPressed(true);
    setRecordsPressedError('');
    try {
      await onRecordsPressedSave(job, recordsPressed);
    } catch (error) {
      setRecordsPressedError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingRecordsPressed(false);
    }
  };
  const recordsPressedDirty = draftRecordsPressed !== (
    currentManualPressed !== null ? String(currentManualPressed) : String(currentDisplayedPressed || '')
  );

  return (
    <>
      <div onClick={onClose} style={{ background: '#00000099', inset: 0, position: 'fixed', zIndex: 100 }} />
      <aside style={{
        background: COLORS.panel,
        borderLeft: `1px solid ${COLORS.border}`,
        bottom: 0,
        overflowY: 'auto',
        padding: '24px',
        position: 'fixed',
        right: 0,
        top: 0,
        width: 'min(480px, 92vw)',
        zIndex: 101,
      }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', gap: '16px', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{ alignItems: 'center', display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <StationIcon station={station} size={18} />
              <div style={{ color: meta.color, fontSize: '12px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {meta.label}
              </div>
            </div>
            <h2 style={{ color: COLORS.text, fontSize: '23px', lineHeight: 1.18, margin: 0 }}>
              {value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']) || 'Production Job'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: '30px', lineHeight: 1 }}
          >
            x
          </button>
        </div>

        <button
          type="button"
          disabled={savingRush}
          onClick={toggleRush}
          style={{
            alignItems: 'center',
            background: rushed ? `${COLORS.red}2E` : COLORS.card,
            border: `1px solid ${rushed ? COLORS.red : `${COLORS.red}77`}`,
            borderRadius: '8px',
            color: rushed ? '#FFFFFF' : COLORS.red,
            cursor: savingRush ? 'default' : 'pointer',
            display: 'flex',
            fontSize: '14px',
            fontWeight: 900,
            justifyContent: 'center',
            marginBottom: '22px',
            padding: '11px 14px',
            width: '100%',
          }}
        >
          {savingRush ? 'Saving Rush...' : rushed ? 'Rush Order On' : 'Rush Order'}
        </button>

        <JobPnlPanel job={job} financeLoaded={financeLoaded} />
        <PvcCompoundPanel job={job} />
        <VendorCostsPanel job={job} />

        {station === 'now_pressing' && quantityTotal > 0 && (
          <div style={{
            background: COLORS.card,
            border: `1px solid ${meta.color}55`,
            borderRadius: '8px',
            marginBottom: '22px',
            padding: '14px',
          }}>
            <div style={{ color: meta.color, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', marginBottom: '10px', textTransform: 'uppercase' }}>
              Press Progress
            </div>
            <div style={{ color: COLORS.muted, fontSize: '12px', lineHeight: 1.35, marginBottom: '10px' }}>
              Board total: {currentDisplayedPressed.toLocaleString()} / {quantityTotal.toLocaleString()}.
              {currentManualPressed !== null ? (
                <>
                  {' '}Baseline {currentManualPressed.toLocaleString()}
                  {currentSinceBaseline > 0
                    ? ` + ${currentSinceBaseline.toLocaleString()} from press logs since last reset.`
                    : '. Press logs after you save will add to this baseline.'}
                  {currentAllTimeLogs > currentSinceBaseline
                    ? ` Older logs (${(currentAllTimeLogs - currentSinceBaseline).toLocaleString()} records) are ignored.`
                    : ''}
                </>
              ) : currentAllTimeLogs > 0 ? (
                <> All-time press log total: {currentAllTimeLogs.toLocaleString()}.</>
              ) : null}
            </div>
            <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Pressed Baseline
              <input
                type="number"
                min={0}
                step={1}
                value={draftRecordsPressed}
                onChange={event => setDraftRecordsPressed(event.target.value)}
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  font: 'inherit',
                  fontSize: '16px',
                  padding: '10px',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                disabled={savingRecordsPressed || !recordsPressedDirty}
                onClick={() => saveRecordsPressed(draftRecordsPressed === '' ? null : numericValue(draftRecordsPressed))}
                style={{
                  background: meta.color,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#041109',
                  cursor: savingRecordsPressed || !recordsPressedDirty ? 'default' : 'pointer',
                  flex: 1,
                  fontSize: '13px',
                  fontWeight: 900,
                  opacity: savingRecordsPressed || !recordsPressedDirty ? 0.55 : 1,
                  padding: '10px 12px',
                }}
              >
                {savingRecordsPressed ? 'Saving...' : 'Set Baseline'}
              </button>
              {currentManualPressed !== null && (
                <button
                  type="button"
                  disabled={savingRecordsPressed}
                  onClick={() => saveRecordsPressed(null)}
                  style={{
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '8px',
                    color: COLORS.muted,
                    cursor: savingRecordsPressed ? 'default' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 850,
                    padding: '10px 12px',
                  }}
                >
                  Use Logs
                </button>
              )}
            </div>
            {recordsPressedError && (
              <div style={{ color: COLORS.red, fontSize: '12px', marginTop: '10px' }}>{recordsPressedError}</div>
            )}
          </div>
        )}

        {jobStage !== 'completed' && (
          <div style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '8px',
            marginBottom: '22px',
            padding: '14px',
          }}>
            <div style={{ color: meta.color, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', marginBottom: '10px', textTransform: 'uppercase' }}>
              Stage Stretch
            </div>
            <div style={{ color: COLORS.muted, fontSize: '12px', lineHeight: 1.35, marginBottom: '10px' }}>
              Keep the job in {meta.shortLabel}, then stretch its card left or right across neighboring stages.
            </div>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Left Edge
                <select
                  value={spanStart}
                  onChange={event => setSpanStart(event.target.value as Station)}
                  style={{
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '8px',
                    color: COLORS.text,
                    font: 'inherit',
                    fontSize: '14px',
                    padding: '10px',
                  }}
                >
                  {leftEdgeStations.map(spanStation => (
                    <option key={spanStation} value={spanStation}>{STATION_META[spanStation].shortLabel}</option>
                  ))}
                </select>
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Right Edge
                <select
                  value={spanEnd}
                  onChange={event => setSpanEnd(event.target.value as Station)}
                  style={{
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '8px',
                    color: COLORS.text,
                    font: 'inherit',
                    fontSize: '14px',
                    padding: '10px',
                  }}
                >
                  {rightEdgeStations.map(spanStation => (
                    <option key={spanStation} value={spanStation}>{STATION_META[spanStation].shortLabel}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ alignItems: 'center', display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '11px' }}>
              <div style={{ color: spanError ? COLORS.red : COLORS.muted, fontSize: '12px', lineHeight: 1.35 }}>
                {spanError || selectedSpanText}
              </div>
              <div style={{ display: 'flex', flexShrink: 0, gap: '8px' }}>
                {currentStageSpan.length > 1 && (
                  <button
                    type="button"
                    disabled={savingSpan}
                    onClick={() => saveStageSpan([])}
                    style={{
                      background: COLORS.elevated,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      color: COLORS.muted,
                      cursor: savingSpan ? 'default' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 900,
                      padding: '8px 10px',
                    }}
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingSpan || !spanDirty}
                  onClick={() => saveStageSpan(selectedStageSpan.length > 1 ? selectedStageSpan : [])}
                  style={{
                    background: savingSpan || !spanDirty ? COLORS.elevated : meta.color,
                    border: `1px solid ${savingSpan || !spanDirty ? COLORS.border : meta.color}`,
                    borderRadius: '6px',
                    color: savingSpan || !spanDirty ? COLORS.muted : '#050505',
                    cursor: savingSpan || !spanDirty ? 'default' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 900,
                    padding: '8px 10px',
                  }}
                >
                  {savingSpan ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '14px 18px', gridTemplateColumns: '1fr 1fr' }}>
          {details.map(([label, detail]) => (
            <div key={label}>
              <div style={{ color: COLORS.muted, fontSize: '10px', fontWeight: 850, letterSpacing: '0.08em', marginBottom: '4px', textTransform: 'uppercase' }}>
                {label}
              </div>
              <div style={{ color: COLORS.text, fontSize: '14px', lineHeight: 1.35 }}>
                {detail}
              </div>
            </div>
          ))}
        </div>

        {variants.length > 1 && (
          <div style={{ marginTop: '26px' }}>
            <div style={{ color: COLORS.muted, fontSize: '10px', fontWeight: 850, letterSpacing: '0.08em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Press Variants
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {variants.map((variant, index) => (
                <div
                  key={`${variant.airtable_record_id || index}-${variant.colors}-${variant.quantity}`}
                  style={{
                    background: '#0E1711',
                    border: `1px solid ${meta.color}33`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ color: COLORS.text, fontSize: '14px', fontWeight: 800 }}>
                    {variant.colors || 'Color TBD'}
                    {variant.quantity ? ` · ${variant.quantity}` : ''}
                  </div>
                  {variant.run_label && (
                    <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '4px' }}>
                      {variant.run_label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {notes && (
          <div style={{ marginTop: '26px' }}>
            <div style={{ color: COLORS.muted, fontSize: '10px', fontWeight: 850, letterSpacing: '0.08em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Production Notes
            </div>
            <div style={{ color: COLORS.text, fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {notes}
            </div>
          </div>
        )}

        <div style={{ marginTop: '26px' }}>
          <div style={{ color: meta.color, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', marginBottom: '8px', textTransform: 'uppercase' }}>
            Dash Notes
          </div>
          <textarea
            value={draftDashNotes}
            onChange={event => setDraftDashNotes(event.target.value)}
            placeholder="Add a dashboard note..."
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              color: COLORS.text,
              font: 'inherit',
              fontSize: '15px',
              lineHeight: 1.45,
              minHeight: '130px',
              outline: 'none',
              padding: '12px',
              resize: 'vertical',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ alignItems: 'center', display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '10px' }}>
            <div style={{ color: notesError ? COLORS.red : COLORS.muted, fontSize: '12px', lineHeight: 1.35 }}>
              {notesError || (notesDirty ? 'Unsaved changes' : 'Saved to Airtable Dash Notes.')}
            </div>
            <button
              type="button"
              disabled={savingNotes || !notesDirty}
              onClick={saveDashNotes}
              style={{
                background: savingNotes || !notesDirty ? COLORS.elevated : meta.color,
                border: `1px solid ${savingNotes || !notesDirty ? COLORS.border : meta.color}`,
                borderRadius: '6px',
                color: savingNotes || !notesDirty ? COLORS.muted : '#050505',
                cursor: savingNotes || !notesDirty ? 'default' : 'pointer',
                flexShrink: 0,
                fontSize: '13px',
                fontWeight: 900,
                padding: '9px 13px',
              }}
            >
              {savingNotes ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: '28px', paddingTop: '22px' }}>
          <div style={{ color: COLORS.text, fontSize: '15px', fontWeight: 900, marginBottom: '12px' }}>
            Split Job
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            <label style={{ color: COLORS.muted, display: 'grid', fontSize: '12px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              New Station
              <select
                value={splitStage}
                onChange={event => setSplitStage(event.target.value as Station)}
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  font: 'inherit',
                  fontSize: '14px',
                  padding: '10px',
                }}
              >
                {STATIONS.map(station => (
                  <option key={station} value={station}>{STATION_META[station].label}</option>
                ))}
              </select>
            </label>
            <label style={{ color: COLORS.muted, display: 'grid', fontSize: '12px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Remaining Quantity
              <input
                value={splitQuantity}
                onChange={event => setSplitQuantity(event.target.value)}
                placeholder="Example: 125"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  font: 'inherit',
                  fontSize: '14px',
                  padding: '10px',
                }}
              />
            </label>
            <div style={{ alignItems: 'center', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
              <div style={{ color: splitError ? COLORS.red : COLORS.muted, fontSize: '12px', lineHeight: 1.35 }}>
                {splitError || 'Ready'}
              </div>
              <button
                type="button"
                disabled={splitting}
                onClick={createSplit}
                style={{
                  background: splitting ? COLORS.elevated : COLORS.green,
                  border: `1px solid ${splitting ? COLORS.border : COLORS.green}`,
                  borderRadius: '6px',
                  color: splitting ? COLORS.muted : '#050505',
                  cursor: splitting ? 'default' : 'pointer',
                  flexShrink: 0,
                  fontSize: '13px',
                  fontWeight: 900,
                  padding: '9px 13px',
                }}
              >
                {splitting ? 'Splitting...' : 'Split Job'}
              </button>
            </div>
          </div>
        </div>

        <JobLogisticsPanel job={job} onShipmentsChanged={onShipmentsChanged} />
      </aside>
    </>
  );
}

function BugReportControl({ isMobile }: { isMobile: boolean }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [bugError, setBugError] = useState('');

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming).filter(file => file.size > 0);
    if (!nextFiles.length) return;
    setFiles(current => {
      const seen = new Set(current.map(file => `${file.name}:${file.size}:${file.lastModified}`));
      const merged = [...current];
      for (const file of nextFiles) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!seen.has(key)) merged.push(file);
      }
      return merged.slice(0, 8);
    });
    setStatus('');
    setBugError('');
  };

  const submitBug = async () => {
    if (!message.trim() && files.length === 0) {
      setBugError('Add a note or an attachment first.');
      return;
    }

    setSending(true);
    setStatus('');
    setBugError('');

    const formData = new FormData();
    formData.set('message', message.trim());
    formData.set('page_url', typeof window !== 'undefined' ? window.location.href : '/staff/dashboard');
    formData.set('user_agent', typeof navigator !== 'undefined' ? navigator.userAgent : '');
    for (const file of files) formData.append('attachments', file, file.name);

    try {
      const response = await fetch('/api/staff/dashboard-bugs', {
        method: 'POST',
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Bug report failed (${response.status})`);
      setMessage('');
      setFiles([]);
      setStatus('Sent to Gregory.');
      setOpen(false);
    } catch (error) {
      setBugError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setStatus('');
          setBugError('');
        }}
        style={{
          alignItems: 'center',
          background: COLORS.panel,
          border: `1px solid ${COLORS.red}66`,
          borderRadius: '8px',
          color: COLORS.text,
          cursor: 'pointer',
          display: 'flex',
          font: 'inherit',
          fontSize: isMobile ? '15px' : '24px',
          fontWeight: 900,
          gap: '8px',
          justifyContent: 'center',
          lineHeight: 1,
          minHeight: isMobile ? '44px' : '56px',
          padding: isMobile ? '0 14px' : '0 18px',
          whiteSpace: 'nowrap',
          width: isMobile ? '100%' : undefined,
        }}
      >
        <Bug size={isMobile ? 16 : 24} color={COLORS.red} />
        Report Bugs
      </button>
      {status && !open && (
        <div style={{ color: COLORS.green, fontSize: '12px', fontWeight: 850, whiteSpace: 'nowrap' }}>
          {status}
        </div>
      )}

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              background: '#000000AA',
              inset: 0,
              position: 'fixed',
              zIndex: 130,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
            onDragOver={event => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={event => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '10px',
              boxShadow: '0 24px 80px #000000CC',
              left: '50%',
              maxHeight: 'min(740px, calc(100vh - 32px))',
              maxWidth: 'min(560px, calc(100vw - 28px))',
              overflowY: 'auto',
              padding: '20px',
              position: 'fixed',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              zIndex: 131,
            }}
          >
            <div style={{ alignItems: 'flex-start', display: 'flex', gap: '16px', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div id="bug-report-title" style={{ color: COLORS.text, fontSize: '20px', fontWeight: 950 }}>
                  Report Bugs
                </div>
                <div style={{ color: COLORS.muted, fontSize: '13px', lineHeight: 1.4, marginTop: '5px' }}>
                  Paste screenshots, drop files here, or attach anything helpful.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: '28px', lineHeight: 1 }}
              >
                x
              </button>
            </div>

            <textarea
              value={message}
              onChange={event => setMessage(event.target.value)}
              onPaste={event => {
                if (event.clipboardData.files.length) addFiles(event.clipboardData.files);
              }}
              onDrop={event => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
              placeholder="What happened? Which job? What did you expect?"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '8px',
                boxSizing: 'border-box',
                color: COLORS.text,
                font: 'inherit',
                fontSize: '15px',
                lineHeight: 1.45,
                minHeight: '150px',
                outline: 'none',
                padding: '12px',
                resize: 'vertical',
                width: '100%',
              }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                alignItems: 'center',
                background: COLORS.card,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: '8px',
                color: COLORS.muted,
                cursor: 'pointer',
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
                marginTop: '10px',
                minHeight: '72px',
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <Paperclip size={18} />
              <span style={{ fontSize: '13px', fontWeight: 850 }}>
                Drop screenshots/files or click to attach
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={event => {
                  if (event.target.files) addFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
                style={{ display: 'none' }}
              />
            </div>

            {files.length > 0 && (
              <div style={{ display: 'grid', gap: '6px', marginTop: '10px' }}>
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    style={{
                      alignItems: 'center',
                      background: COLORS.elevated,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      color: COLORS.text,
                      display: 'flex',
                      fontSize: '12px',
                      gap: '8px',
                      justifyContent: 'space-between',
                      padding: '7px 9px',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles(current => current.filter((_, fileIndex) => fileIndex !== index))}
                      style={{ background: 'transparent', border: 'none', color: COLORS.red, cursor: 'pointer', fontSize: '12px', fontWeight: 900 }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ alignItems: 'center', display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '16px' }}>
              <div style={{ color: bugError ? COLORS.red : COLORS.muted, fontSize: '12px', lineHeight: 1.35 }}>
                {bugError || 'Reports go to gregory@neworleansrecordpress.com'}
              </div>
              <button
                type="button"
                disabled={sending}
                onClick={submitBug}
                style={{
                  background: sending ? COLORS.elevated : COLORS.red,
                  border: `1px solid ${sending ? COLORS.border : COLORS.red}`,
                  borderRadius: '7px',
                  color: '#FFFFFF',
                  cursor: sending ? 'default' : 'pointer',
                  flexShrink: 0,
                  fontSize: '13px',
                  fontWeight: 950,
                  padding: '10px 14px',
                }}
              >
                {sending ? 'Sending...' : 'Send Bug'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function VendorInvoiceImportControl({
  isMobile,
  onApplied,
}: {
  isMobile: boolean;
  onApplied: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [vendorHint, setVendorHint] = useState('');
  const [categoryHint, setCategoryHint] = useState('');
  const [parseResult, setParseResult] = useState<VendorInvoiceParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState('');
  const [invoiceError, setInvoiceError] = useState('');

  const setInvoiceFile = (incoming: FileList | File[]) => {
    const nextFile = Array.from(incoming).find(candidate => candidate.size > 0);
    if (!nextFile) return;
    setFile(nextFile);
    setParseResult(null);
    setStatus('');
    setInvoiceError('');
  };

  const updateLine = (lineId: string, updates: Partial<VendorInvoiceLine>) => {
    setParseResult(current => {
      if (!current) return current;
      return {
        ...current,
        line_items: current.line_items.map(line => line.id === lineId ? { ...line, ...updates } : line),
      };
    });
  };

  const parseInvoice = async () => {
    if (!file) {
      setInvoiceError('Attach an invoice file first.');
      return;
    }

    setParsing(true);
    setStatus('');
    setInvoiceError('');

    const formData = new FormData();
    formData.set('file', file, file.name);
    formData.set('vendor', vendorHint.trim());
    formData.set('category', categoryHint.trim());

    try {
      const response = await fetch('/api/staff/vendor-invoices/parse', {
        method: 'POST',
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Invoice parse failed (${response.status})`);
      setParseResult(body as VendorInvoiceParseResult);
      setStatus('Review extracted lines before applying.');
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : String(error));
    } finally {
      setParsing(false);
    }
  };

  const applyInvoice = async () => {
    if (!parseResult) return;
    const confirmedRows = parseResult.line_items.filter(line => !line.skipped && line.amount);
    if (!confirmedRows.length) {
      setInvoiceError('Keep at least one line with an amount before applying.');
      return;
    }

    setApplying(true);
    setInvoiceError('');
    setStatus('');

    try {
      const response = await fetch('/api/staff/vendor-invoices/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice: parseResult.invoice,
          rows: confirmedRows,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Invoice apply failed (${response.status})`);
      await onApplied();
      setStatus(`Applied ${body.created_count || 0} line${body.created_count === 1 ? '' : 's'}${body.skipped_count ? `, skipped ${body.skipped_count} duplicate${body.skipped_count === 1 ? '' : 's'}` : ''}.`);
      setParseResult(null);
      setFile(null);
      setOpen(false);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : String(error));
    } finally {
      setApplying(false);
    }
  };

  const confirmedTotal = (parseResult?.line_items || [])
    .filter(line => !line.skipped)
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setStatus('');
          setInvoiceError('');
        }}
        style={{
          alignItems: 'center',
          background: COLORS.panel,
          border: `1px solid ${COLORS.gold}77`,
          borderRadius: '8px',
          color: COLORS.text,
          cursor: 'pointer',
          display: 'flex',
          font: 'inherit',
          fontSize: isMobile ? '15px' : '24px',
          fontWeight: 900,
          gap: '8px',
          justifyContent: 'center',
          lineHeight: 1,
          minHeight: isMobile ? '44px' : '56px',
          padding: isMobile ? '0 14px' : '0 18px',
          whiteSpace: 'nowrap',
          width: isMobile ? '100%' : undefined,
        }}
      >
        <Paperclip size={isMobile ? 16 : 24} color={COLORS.gold} />
        Import Invoice
      </button>
      {status && !open && (
        <div style={{ color: COLORS.green, fontSize: '12px', fontWeight: 850, whiteSpace: 'nowrap' }}>
          {status}
        </div>
      )}

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ background: '#000000AA', inset: 0, position: 'fixed', zIndex: 130 }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-invoice-title"
            onDragOver={event => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={event => {
              event.preventDefault();
              setInvoiceFile(event.dataTransfer.files);
            }}
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '10px',
              boxShadow: '0 24px 80px #000000CC',
              left: '50%',
              maxHeight: 'min(840px, calc(100vh - 32px))',
              maxWidth: 'min(980px, calc(100vw - 28px))',
              overflowY: 'auto',
              padding: '20px',
              position: 'fixed',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              zIndex: 131,
            }}
          >
            <div style={{ alignItems: 'flex-start', display: 'flex', gap: '16px', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div id="vendor-invoice-title" style={{ color: COLORS.text, fontSize: '20px', fontWeight: 950 }}>
                  Import Vendor Invoice
                </div>
                <div style={{ color: COLORS.muted, fontSize: '13px', lineHeight: 1.4, marginTop: '5px' }}>
                  Upload first, review/edit extracted lines, then apply confirmed rows to Airtable.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: '28px', lineHeight: 1 }}
              >
                x
              </button>
            </div>

            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr' }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  alignItems: 'center',
                  background: COLORS.card,
                  border: `1px dashed ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.muted,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '8px',
                  minHeight: '72px',
                  padding: '12px',
                }}
              >
                <Paperclip size={18} />
                <span style={{ fontSize: '13px', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Drop invoice PDF/text or click to attach'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv,text/*,application/pdf"
                  onChange={event => {
                    if (event.target.files) setInvoiceFile(event.target.files);
                    event.currentTarget.value = '';
                  }}
                  style={{ display: 'none' }}
                />
              </div>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Vendor Hint
                <input value={vendorHint} onChange={event => setVendorHint(event.target.value)} placeholder="Optional" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} />
              </label>
              <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Category Hint
                <input value={categoryHint} onChange={event => setCategoryHint(event.target.value)} placeholder="Jackets, labels, stampers..." style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '8px', color: COLORS.text, font: 'inherit', fontSize: '14px', padding: '10px' }} />
              </label>
            </div>

            <div style={{ alignItems: 'center', display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '14px' }}>
              <div style={{ color: invoiceError ? COLORS.red : COLORS.muted, fontSize: '12px', lineHeight: 1.35 }}>
                {invoiceError || status || 'Parse does not write to production. Airtable writes happen only after Apply.'}
              </div>
              <button
                type="button"
                disabled={parsing}
                onClick={parseInvoice}
                style={{
                  background: parsing ? COLORS.elevated : COLORS.gold,
                  border: `1px solid ${parsing ? COLORS.border : COLORS.gold}`,
                  borderRadius: '7px',
                  color: parsing ? COLORS.muted : '#050505',
                  cursor: parsing ? 'default' : 'pointer',
                  flexShrink: 0,
                  fontSize: '13px',
                  fontWeight: 950,
                  padding: '10px 14px',
                }}
              >
                {parsing ? 'Parsing...' : 'Parse Invoice'}
              </button>
            </div>

            {parseResult && (
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: '16px', paddingTop: '16px' }}>
                <div style={{ alignItems: 'center', display: 'flex', gap: '12px', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div style={{ color: COLORS.text, fontSize: '15px', fontWeight: 900 }}>
                      {parseResult.invoice.vendor || vendorHint || 'Vendor'} {parseResult.invoice.invoice_number ? `#${parseResult.invoice.invoice_number}` : ''}
                    </div>
                    <div style={{ color: COLORS.muted, fontSize: '12px', marginTop: '4px' }}>
                      {(parseResult.matches?.matched || 0)} matched · {(parseResult.matches?.unmatched || 0)} unmatched · Confirmed total {formatMoney(confirmedTotal)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={applyInvoice}
                    style={{
                      background: applying ? COLORS.elevated : COLORS.green,
                      border: `1px solid ${applying ? COLORS.border : COLORS.green}`,
                      borderRadius: '7px',
                      color: applying ? COLORS.muted : '#050505',
                      cursor: applying ? 'default' : 'pointer',
                      flexShrink: 0,
                      fontSize: '13px',
                      fontWeight: 950,
                      padding: '10px 14px',
                    }}
                  >
                    {applying ? 'Applying...' : 'Apply Confirmed'}
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  {parseResult.line_items.map(line => (
                    <div key={line.id} style={{ background: line.skipped ? '#161616' : COLORS.card, border: `1px solid ${line.skipped ? COLORS.border : `${COLORS.gold}44`}`, borderRadius: '8px', display: 'grid', gap: '8px', opacity: line.skipped ? 0.62 : 1, padding: '10px' }}>
                      <div style={{ alignItems: 'center', display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                        <div style={{ color: line.matched_job ? COLORS.green : COLORS.gold, fontSize: '12px', fontWeight: 850 }}>
                          {line.matched_job
                            ? `Matched ${line.matched_job.matrix || line.matched_job.job_id}${line.matched_job.customer ? ` · ${line.matched_job.customer}` : ''}`
                            : 'No job match yet'}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateLine(line.id, { skipped: !line.skipped })}
                          style={{ background: 'transparent', border: 'none', color: line.skipped ? COLORS.green : COLORS.red, cursor: 'pointer', fontSize: '12px', fontWeight: 900 }}
                        >
                          {line.skipped ? 'Keep' : 'Skip'}
                        </button>
                      </div>
                      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 0.7fr 0.7fr 0.5fr' }}>
                        <input value={line.description} onChange={event => updateLine(line.id, { description: event.target.value })} placeholder="Description" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '7px', color: COLORS.text, font: 'inherit', fontSize: '13px', padding: '9px' }} />
                        <input value={line.matrix} onChange={event => updateLine(line.id, { matrix: event.target.value })} placeholder="Matrix" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '7px', color: COLORS.text, font: 'inherit', fontSize: '13px', padding: '9px' }} />
                        <input value={line.category} onChange={event => updateLine(line.id, { category: event.target.value })} placeholder="Category" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '7px', color: COLORS.text, font: 'inherit', fontSize: '13px', padding: '9px' }} />
                        <input type="number" step="0.01" value={line.amount} onChange={event => updateLine(line.id, { amount: Number(event.target.value || 0) })} placeholder="Amount" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: '7px', color: COLORS.text, font: 'inherit', fontSize: '13px', padding: '9px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function PressBacklogStat({
  remaining,
  perDay,
  loading,
  compact = false,
}: {
  remaining: number;
  perDay: number;
  loading: boolean;
  compact?: boolean;
}) {
  const horizon = formatPressHorizon(remaining / perDay);
  const remainingLabel = loading ? '—' : remaining.toLocaleString();

  return (
    <div
      className="norp-press-backlog"
      aria-label={loading
        ? 'Loading records still to press'
        : `${remainingLabel} records still to press at ${perDay} a day, ${horizon}`}
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '8px',
        boxSizing: 'border-box',
        minWidth: 0,
        overflow: 'hidden',
        padding: compact ? '8px 12px' : '8px 16px',
        width: '100%',
      }}
    >
      <style>{`
        .norp-press-backlog {
          container-type: inline-size;
        }
        .norp-press-backlog__row {
          align-items: center;
          display: flex;
          gap: 12px;
          min-width: 0;
        }
        .norp-press-backlog__icon {
          align-items: center;
          background: ${COLORS.green}18;
          border: 1px solid ${COLORS.green}55;
          border-radius: 50%;
          color: ${COLORS.green};
          display: grid;
          flex: 0 0 auto;
          height: 38px;
          place-items: center;
          width: 38px;
        }
        .norp-press-backlog__stats {
          display: flex;
          flex: 1 1 auto;
          gap: 16px;
          min-width: 0;
        }
        .norp-press-backlog__block {
          min-width: 0;
        }
        .norp-press-backlog__pace {
          border-left: 1px solid ${COLORS.border};
          min-width: 0;
          padding-left: 16px;
        }
        .norp-press-backlog__label {
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .norp-press-backlog__value {
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.03em;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        @container (max-width: 380px) {
          .norp-press-backlog__icon {
            height: 30px;
            width: 30px;
          }
          .norp-press-backlog__stats {
            gap: 10px;
          }
          .norp-press-backlog__pace {
            padding-left: 10px;
          }
        }
        @container (max-width: 300px) {
          .norp-press-backlog__icon { display: none; }
          .norp-press-backlog__stats {
            flex-direction: column;
            gap: 8px;
          }
          .norp-press-backlog__pace {
            border-left: none;
            border-top: 1px solid ${COLORS.border};
            padding-left: 0;
            padding-top: 8px;
          }
        }
      `}</style>
      <div className="norp-press-backlog__row">
        <div className="norp-press-backlog__icon" aria-hidden="true">
          <Disc3 size={compact ? 16 : 18} strokeWidth={2.4} />
        </div>
        <div className="norp-press-backlog__stats">
          <div className="norp-press-backlog__block">
            <div className="norp-press-backlog__label" style={{ color: COLORS.muted, fontSize: compact ? '10px' : '11px', fontWeight: 900 }}>
              Still to press
            </div>
            <div className="norp-press-backlog__value" style={{
              color: COLORS.green,
              fontSize: compact ? 'clamp(16px, 2.4vw, 20px)' : 'clamp(18px, 1.6vw, 22px)',
              fontWeight: 900,
            }}>
              {remainingLabel}
              <span style={{ color: COLORS.faint, fontSize: '12px', fontWeight: 700, letterSpacing: 0, marginLeft: '6px' }}>
                records
              </span>
            </div>
          </div>
          <div className="norp-press-backlog__pace">
            <div className="norp-press-backlog__label" style={{ color: COLORS.gold, fontSize: compact ? '10px' : '11px', fontWeight: 900 }}>
              {perDay.toLocaleString()} / day
            </div>
            <div style={{
              color: COLORS.text,
              fontSize: compact ? 'clamp(14px, 2vw, 16px)' : 'clamp(15px, 1.4vw, 18px)',
              fontWeight: 850,
              lineHeight: 1.2,
            }}>
              {loading ? '…' : horizon}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient({ jobs: initialJobs }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs ?? []);
  const [loading, setLoading] = useState(true);
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [boardReady, setBoardReady] = useState(false);
  const isMobile = useMediaQuery('(max-width: 760px)');
  const isNarrowHeader = useMediaQuery('(max-width: 1280px)');
  const stackBacklog = isMobile || isNarrowHeader;
  const syncPausedRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const localMutationAtRef = useRef(0);
  const lastSyncSignatureRef = useRef('');
  const refreshJobsRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => {});
  const refreshJobDetailsRef = useRef<() => Promise<void>>(async () => {});
  const logStampRef = useRef('');
  const financeLoadedRef = useRef(false);

  const applyRemoteJobs = useCallback((nextJobs: Job[], startedAt: number) => {
    if (syncPausedRef.current || startedAt < localMutationAtRef.current) {
      queuedRefreshRef.current = true;
      return false;
    }
    const signature = boardSyncSignature(nextJobs);
    if (signature === lastSyncSignatureRef.current) return true;
    lastSyncSignatureRef.current = signature;
    setJobs(current => {
      const previous = new Map(current.map(job => [jobKey(job), job]));
      return nextJobs.map(job => {
        const existing = previous.get(jobKey(job));
        if (existing?.pnl && !job.pnl) return { ...job, ...preservedFinance(existing) };
        return job;
      });
    });
    setSelectedJob(current => {
      if (!current) return current;
      const next = nextJobs.find(job => jobKey(job) === jobKey(current));
      if (!next) return current;
      const pressChanged =
        displayedRecordsPressed(current) !== displayedRecordsPressed(next) ||
        jobQuantity(current) !== jobQuantity(next) ||
        stationOf(current) !== stationOf(next);
      if (!pressChanged) return current;
      return {
        ...current,
        quantity: next.quantity,
        Quantity: next.Quantity,
        stage: next.stage,
        records_pressed_total: next.records_pressed_total,
        records_pressed_source: next.records_pressed_source,
        records_pressed_from_logs: next.records_pressed_from_logs,
        records_pressed_since_baseline: next.records_pressed_since_baseline,
        records_pressed_baseline: next.records_pressed_baseline,
        press_log_count: next.press_log_count,
        latest_press_log_at: next.latest_press_log_at,
      };
    });
    return true;
  }, []);

  const refreshJobs = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (inFlightRef.current) {
      queuedRefreshRef.current = true;
      await inFlightRef.current;
      return;
    }

    const startedAt = Date.now();
    if (!silent) setLoading(true);

    const run = (async () => {
      try {
        const response = await fetch('/api/norp-jobs', { cache: 'no-store' });
        const data = await response.json();
        if (!silent && data.error) setError(data.error);
        if (data.source) setSource(data.source);
        if (Array.isArray(data.jobs)) applyRemoteJobs(data.jobs, startedAt);
      } catch (err) {
        if (!silent) setError(String(err));
      } finally {
        if (!silent) setLoading(false);
      }
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
      if (!silent || !financeLoadedRef.current) {
        void refreshJobDetailsRef.current();
      }
      if (queuedRefreshRef.current && !syncPausedRef.current) {
        queuedRefreshRef.current = false;
        void refreshJobsRef.current({ silent: true });
      }
    }
  }, [applyRemoteJobs]);

  const refreshJobDetails = useCallback(async () => {
    try {
      const response = await fetch('/api/norp-jobs?details=1', { cache: 'no-store' });
      const data = await response.json();
      if (!Array.isArray(data.jobs)) return;
      const byKey = new Map(
        data.jobs.map((row: Record<string, unknown>) => [String(row.detail_key || ''), row]),
      );
      const apply = (job: Job) => withFinanceDetails(job, byKey.get(jobKey(job)) || byKey.get(String(job.detail_key || '')));
      setJobs(current => current.map(apply));
      setSelectedJob(current => (current ? apply(current) : current));
    } catch {
      // PVC and payroll still render from the job card while QuickBooks is unavailable.
    } finally {
      financeLoadedRef.current = true;
      setFinanceLoaded(true);
    }
  }, []);

  refreshJobsRef.current = refreshJobs;
  refreshJobDetailsRef.current = refreshJobDetails;

  const markLocalMutation = useCallback(() => {
    localMutationAtRef.current = Date.now();
  }, []);

  const setJobsFromBoard = useCallback((nextJobs: Job[]) => {
    markLocalMutation();
    lastSyncSignatureRef.current = boardSyncSignature(nextJobs);
    setJobs(nextJobs);
    notifyProductionSync();
  }, [markLocalMutation]);

  const setSyncBusy = useCallback((busy: boolean) => {
    syncPausedRef.current = busy;
    if (busy) {
      markLocalMutation();
      return;
    }
    if (queuedRefreshRef.current) {
      queuedRefreshRef.current = false;
      void refreshJobsRef.current({ silent: true });
    }
  }, [markLocalMutation]);

  const patchJobs = useCallback((updateJob: (job: Job) => Job) => {
    markLocalMutation();
    setJobs(current => {
      const next = current.map(updateJob);
      lastSyncSignatureRef.current = boardSyncSignature(next);
      return next;
    });
    notifyProductionSync();
  }, [markLocalMutation]);

  useEffect(() => {
    let cancelled = false;
    const readLogStamp = async () => {
      const response = await fetch('/api/production-sync', { cache: 'no-store' });
      const data = await response.json();
      return `${data.press_log_at || ''}|${data.qc_log_at || ''}`;
    };

    void (async () => {
      try {
        let before = '';
        try {
          before = await readLogStamp();
          if (!cancelled) logStampRef.current = before;
        } catch {
          // Board fetch still runs even if the log heartbeat is down.
        }
        if (cancelled) return;
        await refreshJobsRef.current({ silent: false });
        if (cancelled) return;
        try {
          const after = await readLogStamp();
          if (cancelled) return;
          logStampRef.current = after;
          if (after && before && after !== before) {
            await refreshJobsRef.current({ silent: true });
          }
        } catch {
          // The 15s board poll still covers Airtable.
        }
      } finally {
        if (!cancelled) setBoardReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!boardReady) return undefined;

    let debounce: number | undefined;
    const pull = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        void refreshJobsRef.current({ silent: true });
      }, 300);
    };

    const unsubscribe = subscribeProductionSync(pull);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', pull);
    const timer = window.setInterval(pull, PRODUCTION_SYNC_POLL_MS);

    const pollLogs = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/production-sync', { cache: 'no-store' });
        const data = await response.json();
        const nextStamp = `${data.press_log_at || ''}|${data.qc_log_at || ''}`;
        if (!nextStamp.replace(/\|/g, '')) return;
        if (!logStampRef.current) {
          logStampRef.current = nextStamp;
          return;
        }
        if (nextStamp !== logStampRef.current) {
          logStampRef.current = nextStamp;
          pull();
        }
      } catch {
        // Keep the last known stamp; the full board poll still runs.
      }
    };
    const logTimer = window.setInterval(() => {
      void pollLogs();
    }, PRODUCTION_LOG_HEARTBEAT_MS);

    let cleanupRealtime = () => {};
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      try {
        const supabase = createBrowserSupabase();
        const channel = supabase
          .channel('production-log-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'press_log' }, pull)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_log' }, pull)
          .subscribe();
        cleanupRealtime = () => {
          void supabase.removeChannel(channel);
        };
      } catch {
        cleanupRealtime = () => {};
      }
    }

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', pull);
      window.clearInterval(timer);
      window.clearInterval(logTimer);
      window.clearTimeout(debounce);
      cleanupRealtime();
    };
  }, [boardReady]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleJobs = useMemo(() => (
    normalizedSearch
      ? jobs.filter(job => searchableJobText(job).includes(normalizedSearch))
      : jobs
  ), [jobs, normalizedSearch]);
  const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
  const visibleActiveJobs = visibleJobs.filter(job => stationOf(job) !== 'completed');
  const backlog = useMemo(() => pressBacklog(jobs), [jobs]);
  const counts = useMemo(() => Object.fromEntries(
    STATIONS.map(station => [station, stationVisualJobs(visibleJobs, station).length])
  ) as Record<Station, number>, [visibleJobs]);

  const jumpToStation = (station: Station) => {
    const element = document.getElementById(stationAnchor(station));
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const saveDashNotes = async (job: Job, dashNotes: string) => {
    const key = jobKey(job);
    const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/dash-notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dash_notes: dashNotes }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Airtable notes save failed (${response.status})`);
    }

    const updateJob = (candidate: Job) => (
      jobKey(candidate) === key ? { ...candidate, dash_notes: dashNotes, 'Dash Notes': dashNotes } : candidate
    );
    patchJobs(updateJob);
    setSelectedJob(null);
    setError('');
  };

  const toggleRushOrder = async (job: Job, rushed: boolean) => {
    const key = jobKey(job);
    const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
    const nextDashNotes = dashNotesWithDashboardMarkers(rawDashNotes, visibleDashNotes(rawDashNotes), { rushOverride: rushed });
    const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/dash-notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dash_notes: nextDashNotes }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Airtable rush save failed (${response.status})`);
    }

    const updateJob = (candidate: Job) => (
      jobKey(candidate) === key ? { ...candidate, dash_notes: nextDashNotes, 'Dash Notes': nextDashNotes } : candidate
    );
    patchJobs(updateJob);
    setSelectedJob(current => current && jobKey(current) === key ? updateJob(current) : current);
    setError('');
  };

  const saveStageSpan = async (job: Job, span: Station[]) => {
    const key = jobKey(job);
    const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
    const nextDashNotes = dashNotesWithDashboardMarkers(rawDashNotes, visibleDashNotes(rawDashNotes), {
      stageSpanOverride: span,
    });
    const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/dash-notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dash_notes: nextDashNotes }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Airtable stretch save failed (${response.status})`);
    }

    const updateJob = (candidate: Job) => (
      jobKey(candidate) === key ? { ...candidate, dash_notes: nextDashNotes, 'Dash Notes': nextDashNotes } : candidate
    );
    patchJobs(updateJob);
    setSelectedJob(current => current && jobKey(current) === key ? updateJob(current) : current);
    setError('');
  };

  const splitJob = async (job: Job, payload: { stage: Station; quantity: string }) => {
    const key = jobKey(job);
    const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Airtable split failed (${response.status})`);
    }

    if (body.job) {
      patchJobs(candidate => (jobKey(candidate) === key ? body.job : candidate));
    }
    setSelectedJob(null);
    setError('');
    void refreshJobsRef.current({ silent: true });
  };

  const saveRecordsPressed = async (job: Job, recordsPressed: number | null) => {
    const key = jobKey(job);
    const response = await fetch(`/api/jobs/${encodeURIComponent(key)}/records-pressed`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records_pressed: recordsPressed }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Records pressed save failed (${response.status})`);
    }

    const body = await response.json().catch(() => ({}));
    const savedValue = recordsPressed === null ? '' : String(recordsPressed);
    const savedBaselineAt = recordsPressed === null
      ? ''
      : String(body.job?.records_pressed_baseline_at || body.job?.['Records Pressed Baseline At'] || new Date().toISOString());
    const updateJob = (candidate: Job) => {
      if (jobKey(candidate) !== key) return candidate;
      const next = {
        ...candidate,
        records_pressed: savedValue,
        'Records Pressed': savedValue,
        records_pressed_baseline_at: savedBaselineAt,
        'Records Pressed Baseline At': savedBaselineAt,
      } as Job;
      if (recordsPressed === null) {
        delete next.records_pressed_baseline_at;
        delete next['Records Pressed Baseline At'];
        next.records_pressed_source = 'press_logs';
        next.records_pressed_total = allTimeLogRecordsPressed(candidate) > 0
          ? String(allTimeLogRecordsPressed(candidate))
          : '';
        next.records_pressed_since_baseline = '';
        next.records_pressed_baseline = '';
      } else {
        next.records_pressed_source = 'manual_baseline';
        next.records_pressed_baseline = savedValue;
        next.records_pressed_since_baseline = '0';
        next.records_pressed_total = savedValue;
        next.press_log_count = '0';
      }
      return next;
    };
    patchJobs(updateJob);
    setSelectedJob(current => current && jobKey(current) === key ? updateJob(current) : current);
    setError('');
    void refreshJobsRef.current({ silent: true });
  };

  return (
    <main style={{
      background:
        'radial-gradient(circle at 18% 0%, rgba(0,232,106,0.12), transparent 28%), radial-gradient(circle at 78% 8%, rgba(77,163,255,0.12), transparent 24%), #090909',
      color: COLORS.text,
      minHeight: '100vh',
      padding: isMobile ? '12px' : '18px',
    }}>
      <header style={{
        alignItems: stackBacklog ? 'stretch' : 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: isMobile ? '12px' : '14px',
        justifyContent: 'space-between',
        margin: '0 auto 18px',
        maxWidth: '1920px',
      }}>
        <div style={{
          flex: stackBacklog ? '1 1 220px' : '0 1 280px',
          minWidth: 0,
          order: 1,
        }}>
          <div style={{ color: COLORS.green, fontSize: '12px', fontWeight: 950, letterSpacing: '0.12em', marginBottom: '7px', textTransform: 'uppercase' }}>
            New Orleans Record Press
          </div>
          <h1 style={{
            color: COLORS.text,
            fontSize: isMobile ? '27px' : isNarrowHeader ? 'clamp(24px, 3vw, 32px)' : '36px',
            lineHeight: 1.05,
            margin: 0,
          }}>
            Press Room Production Pipeline
          </h1>
        </div>
        <div style={{
          flex: stackBacklog ? '1 1 100%' : '1 1 280px',
          maxWidth: stackBacklog ? 'none' : '440px',
          minWidth: 0,
          order: stackBacklog ? 3 : 2,
          width: stackBacklog ? '100%' : undefined,
        }}>
          <PressBacklogStat
            remaining={backlog.remaining}
            perDay={backlog.perDay}
            loading={loading}
            compact={stackBacklog}
          />
        </div>
        <div style={{
          alignItems: isMobile ? 'flex-start' : 'flex-end',
          display: 'flex',
          flex: '1 1 auto',
          flexDirection: 'column',
          gap: isMobile ? '0' : '8px',
          marginLeft: stackBacklog ? 'auto' : undefined,
          minWidth: 0,
          order: stackBacklog ? 2 : 3,
        }}>
          <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: isMobile ? 'left' : 'right' }}>
            {loading ? 'Loading Airtable...' : `${activeJobs.length} active jobs`}
            {source && <div style={{ marginTop: '4px' }}>Source: {source === 'airtable' ? 'Airtable' : 'Sheet fallback'}</div>}
          </div>
          {!isMobile && (
            <div style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'flex-end',
              minWidth: 0,
            }}>
              <VendorInvoiceImportControl isMobile={isMobile} onApplied={refreshJobs} />
              <BugReportControl isMobile={isMobile} />
              <a
                href={AIRTABLE_DATABASE_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  fontSize: isNarrowHeader ? '15px' : '24px',
                  fontWeight: 900,
                  lineHeight: 1,
                  minHeight: isNarrowHeader ? '44px' : '56px',
                  padding: isNarrowHeader ? '0 14px' : '0 18px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Airtable Database
              </a>
            </div>
          )}
        </div>
      </header>

      <section style={{
        alignItems: isMobile ? 'stretch' : 'center',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '10px',
        justifyContent: 'space-between',
        margin: '0 auto 14px',
        maxWidth: '1920px',
      }}>
        <label style={{
          alignItems: 'center',
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
          display: 'flex',
          gap: '9px',
          minHeight: '44px',
          minWidth: 0,
          padding: '0 12px',
          width: isMobile ? '100%' : 'min(520px, 34vw)',
        }}>
          <SearchCheck size={18} color={COLORS.muted} />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search jobs"
            style={{
              background: 'transparent',
              border: 'none',
              color: COLORS.text,
              font: 'inherit',
              fontSize: '15px',
              minWidth: 0,
              outline: 'none',
              width: '100%',
            }}
          />
        </label>
        {(normalizedSearch || isMobile) && (
        <div style={{
          alignItems: 'center',
          display: 'flex',
          gap: '10px',
          justifyContent: isMobile ? 'space-between' : 'flex-end',
          width: isMobile ? '100%' : undefined,
        }}>
          {normalizedSearch && (
            <div style={{ color: COLORS.muted, fontSize: '13px' }}>
              {visibleActiveJobs.length} shown
            </div>
          )}
          {isMobile && (
            <>
              <VendorInvoiceImportControl isMobile={isMobile} onApplied={refreshJobs} />
              <BugReportControl isMobile={isMobile} />
              <a
                href={AIRTABLE_DATABASE_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  fontSize: '15px',
                  fontWeight: 900,
                  lineHeight: 1,
                  minHeight: '44px',
                  padding: '0 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Airtable Database
              </a>
            </>
          )}
        </div>
        )}
      </section>

      <section style={{
        display: 'grid',
        gap: isMobile ? '8px' : '10px',
        gridAutoColumns: isMobile ? '118px' : undefined,
        gridAutoFlow: isMobile ? 'column' : undefined,
        gridTemplateColumns: isMobile ? undefined : 'repeat(7, minmax(0, 1fr))',
        margin: '0 auto 16px',
        maxWidth: '1920px',
        overflowX: isMobile ? 'auto' : undefined,
        paddingBottom: isMobile ? '6px' : undefined,
        WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
      }}>
        {STATIONS.map(station => {
          const meta = STATION_META[station];
          return (
            <button
              key={station}
              type="button"
              onClick={() => jumpToStation(station)}
              aria-label={`Jump to ${meta.label}`}
              style={{
              alignItems: 'center',
              background: station === 'now_pressing' ? `${meta.color}18` : COLORS.panel,
              border: `1px solid ${station === 'now_pressing' ? meta.color : COLORS.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              gap: '8px',
              font: 'inherit',
              minHeight: '66px',
              minWidth: 0,
              padding: isMobile ? '8px' : '9px',
              textAlign: 'left',
            }}>
              <StationIcon station={station} size={17} />
              <div>
                <div style={{ color: meta.color, fontSize: '30px', fontWeight: 950, lineHeight: 1 }}>{counts[station]}</div>
                <div style={{ color: COLORS.muted, fontSize: '13px', fontWeight: 850, letterSpacing: '0.06em', marginTop: '4px', textTransform: 'uppercase' }}>{meta.shortLabel}</div>
              </div>
            </button>
          );
        })}
      </section>

      {error && (
        <div style={{
          background: `${COLORS.red}18`,
          border: `1px solid ${COLORS.red}66`,
          borderRadius: '8px',
          color: COLORS.red,
          fontSize: '13px',
          margin: '0 auto 14px',
          maxWidth: '1920px',
          padding: '12px 14px',
        }}>
          {error}
        </div>
      )}

      <div style={{ margin: '0 auto', maxWidth: '1920px' }}>
        <Pipeline
          jobs={jobs}
          visibleJobs={visibleJobs}
          onJobsChange={setJobsFromBoard}
          onJobOpen={setSelectedJob}
          onError={setError}
          onBusyChange={setSyncBusy}
          isMobile={isMobile}
        />
      </div>

      {selectedJob && (
        <JobDrawer
          key={jobKey(selectedJob)}
          job={selectedJob}
          financeLoaded={financeLoaded}
          onClose={() => setSelectedJob(null)}
          onDashNotesSave={saveDashNotes}
          onRushToggle={toggleRushOrder}
          onStageSpanSave={saveStageSpan}
          onSplitJob={splitJob}
          onRecordsPressedSave={saveRecordsPressed}
          onShipmentsChanged={() => refreshJobs({ silent: true })}
        />
      )}
    </main>
  );
}
