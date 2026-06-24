'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DraggableProvidedDragHandleProps, DropResult, DragUpdate } from '@hello-pangea/dnd';
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
} from 'lucide-react';

interface Job { [key: string]: string | boolean | string[] | Array<Record<string, string>> | undefined }

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
};

const AIRTABLE_DATABASE_URL = 'https://airtable.com/appu3BWQLTIxzKF3V/tblmhd7tY2QqTZmnF/viwybIIrPi9Pd9Tyo?blocks=hide';
const RUSH_MARKER = '[Rush Order]';
const STAGE_SPAN_MARKER_RE = /\[Stage\s+Span:\s*([^\]]+)\]/i;
const STAGE_SPAN_MARKER_GLOBAL_RE = /\[Stage\s+Span:\s*[^\]]+\]/gi;
const STRETCHED_DROPPABLE_ID = '__stretched_jobs__';
const SPAN_GAP = 10;
const SPAN_DEFAULT_HEIGHT = 240;
const NORMAL_ROW_HEIGHT = 430;

function value(job: Job, keys: string[]) {
  for (const key of keys) {
    const found = job[key];
    if (found !== undefined && found !== false && String(found).trim() !== '') return String(found);
  }
  return '';
}

function jobKey(job: Job) {
  return value(job, ['airtable_record_id', 'job_id', 'matrix', 'MATRIX']);
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
  const manual = manualRecordsPressed(job);
  if (manual !== null) return manual;
  return numericValue(value(job, ['records_pressed_total']));
}

function logRecordsPressed(job: Job) {
  const fromLogs = value(job, ['records_pressed_from_logs']);
  if (fromLogs !== '') return numericValue(fromLogs);
  if (value(job, ['records_pressed_source']) === 'manual') return 0;
  return numericValue(value(job, ['records_pressed_total']));
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

type SpanLayoutEntry = {
  job: Job;
  startIndex: number;
  endIndex: number;
  row: number;
  top: number;
};

function layoutStretchedJobs(jobs: Job[]) {
  const occupiedRows: boolean[][] = [];
  const normalStationHasJobs = STATIONS.map(station =>
    stationJobs(jobs, station).some(job => stageSpanForJob(job).length < 2)
  );

  const entries = stretchedJobs(jobs).map(job => {
    const span = stageSpanForJob(job);
    const startIndex = STATIONS.indexOf(span[0]);
    const endIndex = STATIONS.indexOf(span[span.length - 1]);

    if (startIndex < 0 || endIndex < 0) {
      return { job, startIndex, endIndex, row: 0, top: 0 };
    }

    let row = 0;

    while (
      occupiedRows[row]?.slice(startIndex, endIndex + 1).some(Boolean)
    ) {
      row += 1;
    }

    if (!occupiedRows[row]) occupiedRows[row] = STATIONS.map(() => false);
    for (let index = startIndex; index <= endIndex; index += 1) {
      occupiedRows[row][index] = true;
    }

    const entry: SpanLayoutEntry = {
      job,
      startIndex,
      endIndex,
      row,
      top: 0,
    };

    return entry;
  }).filter(entry => entry.startIndex >= 0 && entry.endIndex >= 0);

  const heightForStationRow = (stationIndex: number, row: number) => {
    if (entries.some(entry => (
      entry.row === row && stationIndex >= entry.startIndex && stationIndex <= entry.endIndex
    ))) {
      return SPAN_DEFAULT_HEIGHT;
    }

    return normalStationHasJobs[stationIndex] ? NORMAL_ROW_HEIGHT : 0;
  };

  return entries.map(entry => {
    const top = STATIONS
      .slice(entry.startIndex, entry.endIndex + 1)
      .map((_, offset) => {
        const stationIndex = entry.startIndex + offset;
        let stationTop = 0;
        for (let row = 0; row < entry.row; row += 1) {
          const rowHeight = heightForStationRow(stationIndex, row);
          if (rowHeight > 0) stationTop += rowHeight + SPAN_GAP;
        }
        return stationTop;
      })
      .reduce((max, stationTop) => Math.max(max, stationTop), 0);

    return { ...entry, top };
  });
}

function reservedSpanHeightForStation(layout: SpanLayoutEntry[], station: Station) {
  const stationIndex = STATIONS.indexOf(station);
  const occupiedRows = new Set(layout
    .filter(entry => stationIndex >= entry.startIndex && stationIndex <= entry.endIndex)
    .map(entry => entry.row));

  let reservedRows = 0;
  while (occupiedRows.has(reservedRows)) {
    reservedRows += 1;
  }

  return reservedRows ? reservedRows * (SPAN_DEFAULT_HEIGHT + SPAN_GAP) + 4 : 0;
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
  const variantText = Array.isArray(job.variants)
    ? job.variants.map(variant => [
        variant.colors,
        variant.quantity,
        variant.run_label,
      ].filter(Boolean).join(' ')).join(' ')
    : '';

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

function orderForInsertion(list: Job[], index: number) {
  const previous = index > 0 ? dashboardOrder(list[index - 1]) : undefined;
  const next = index < list.length - 1 ? dashboardOrder(list[index + 1]) : undefined;

  if (previous !== undefined && next !== undefined) return (previous + next) / 2;
  if (previous !== undefined) return previous + 1;
  if (next !== undefined) return Math.max(0.5, next - 1);
  return 1;
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
  const usingManualPressed = manualRecordsPressed(job) !== null;
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
          {shipDate && <StatusPill color="#4DA3FF">{shipDate}</StatusPill>}
          {hasVariants
            ? <StatusPill color="#FFB84D">{duplicateCount} variants</StatusPill>
            : duplicateCount > 1 && <StatusPill color="#FFB84D">{duplicateCount} merged</StatusPill>}
        </div>

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
              {Math.round(progressPct)}% complete{pressLogCount ? ` · ${pressLogCount} press log${pressLogCount === 1 ? '' : 's'}` : ''}{usingManualPressed ? ' · manual count' : ''}
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
  isMobile = false,
}: {
  jobs: Job[];
  visibleJobs?: Job[];
  onJobsChange: (jobs: Job[]) => void;
  onJobOpen: (job: Job) => void;
  onError: (message: string) => void;
  isMobile?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [confirmCompleteJob, setConfirmCompleteJob] = useState<Job | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStation, setDragOverStation] = useState<Station | null>(null);
  useEffect(() => setMounted(true), []);

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
    setDraggingId(start.draggableId);
  };

  const onDragUpdate = (update: DragUpdate) => {
    const destinationId = update.destination?.droppableId;
    if (destinationId && STATIONS.includes(destinationId as Station)) {
      setDragOverStation(destinationId as Station);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const hoveredStation = dragOverStation;
    setDraggingId(null);
    setDragOverStation(null);
    if (!result.destination) return;

    let toId = result.destination.droppableId;
    let destinationIndex = result.destination.index;
    const fromId = result.source.droppableId;
    const fromStretched = fromId === STRETCHED_DROPPABLE_ID;
    let toStretched = toId === STRETCHED_DROPPABLE_ID;
    const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
    const visibleActiveJobs = visibleJobs.filter(job => stationOf(job) !== 'completed');
    const hiddenJobs = jobs.filter(job => stationOf(job) === 'completed');
    const activeSpanKeys = new Set(
      (isMobile ? [] : layoutStretchedJobs(visibleJobs))
        .map(entry => jobKey(entry.job))
        .filter(Boolean)
    );
    const visibleColumnJobs = (station: Station) => (
      stationJobs(visibleActiveJobs, station).filter(job => isMobile || !activeSpanKeys.has(jobKey(job)))
    );

    if (toStretched && !fromStretched) {
      const fallbackStation = hoveredStation
        ?? (STATIONS.includes(fromId as Station) ? (fromId as Station) : null);
      if (!fallbackStation) return;
      toId = fallbackStation;
      toStretched = false;
      destinationIndex = visibleColumnJobs(fallbackStation).length;
    }

    const sourceList = fromStretched ? stretchedJobs(visibleActiveJobs) : visibleColumnJobs(fromId as Station);
    const destinationList = fromId === toId
      ? sourceList
      : toStretched
        ? stretchedJobs(visibleActiveJobs)
        : visibleColumnJobs(toId as Station);
    const [moved] = sourceList.splice(result.source.index, 1);

    if (!moved) return;

    const targetStage = toStretched ? stationOf(moved) : (toId as Station);
    const rawDashNotes = value(moved, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
    const preservedSpan = fromStretched && !toStretched
      ? shiftedSpanForStage(moved, targetStage as Station)
      : undefined;
    const nextDashNotes = preservedSpan
      ? dashNotesWithDashboardMarkers(rawDashNotes, visibleDashNotes(rawDashNotes), { stageSpanOverride: preservedSpan })
      : undefined;
    const movedNext = {
      ...moved,
      stage: targetStage,
      ...(nextDashNotes !== undefined ? { dash_notes: nextDashNotes, 'Dash Notes': nextDashNotes } : {}),
    };

    if (fromId === toId) {
      sourceList.splice(destinationIndex, 0, movedNext);
    } else {
      destinationList.splice(destinationIndex, 0, movedNext);
    }

    const destinationAfterMove = fromId === toId ? sourceList : destinationList;
    const movedOrder = orderForInsertion(destinationAfterMove, destinationIndex);
    const movedPersisted = { ...movedNext, dashboard_order: String(movedOrder) };
    const rebuilt = activeJobs.map(job => {
      const key = jobKey(job);
      const replacement = key === jobKey(moved) ? movedPersisted : undefined;
      return replacement ?? job;
    });

    const nextJobs = [...rebuilt, ...hiddenJobs];

    onJobsChange(nextJobs);
    onError('');

    try {
      await saveMovedJob(movedPersisted, targetStage, movedOrder);
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
  };

  const completeJob = async (job: Job) => {
    const current = stationOf(job);
    if (current !== 'shipping') return;
    const target = 'completed';
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
    }
  };

  if (!mounted) {
    return <div style={{ color: COLORS.muted, padding: '24px' }}>Loading board...</div>;
  }

  const spanLayout = isMobile ? [] : layoutStretchedJobs(visibleJobs);
  const renderedSpanKeys = new Set(spanLayout.map(entry => jobKey(entry.job)).filter(Boolean));
  const spanLayerHeight = spanLayout.length
    ? Math.max(...spanLayout.map(entry => entry.top + SPAN_DEFAULT_HEIGHT + SPAN_GAP))
    : 0;

  return (
    <DragDropContext onDragStart={onDragStart} onDragUpdate={onDragUpdate} onDragEnd={onDragEnd}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(0, 1fr))',
        gap: isMobile ? '14px' : '10px',
        paddingBottom: '12px',
        position: 'relative',
      }}>
        {!isMobile && spanLayout.length > 0 && (
          <Droppable droppableId={STRETCHED_DROPPABLE_ID} isDropDisabled>
            {provided => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                aria-label="Stretched production jobs"
                style={{
                  display: 'grid',
                  gap: '10px',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  height: `${spanLayerHeight}px`,
                  left: 0,
                  pointerEvents: 'none',
                  position: 'absolute',
                  right: 0,
                  top: '96px',
                  zIndex: 20,
                }}>
                {spanLayout.map((entry, index) => {
                  const { job, startIndex, endIndex, row } = entry;
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
                            gridColumn: `${startIndex + 1} / ${endIndex + 2}`,
                            gridRow: `${row + 1}`,
                            minWidth: 0,
                            opacity: dragSnapshot.isDragging ? 0.88 : 1,
                            pointerEvents: isDraggingNormalJob && !isThisStretchedCard ? 'none' : 'auto',
                          }}
                          data-job-key={key}
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
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        )}
        {STATIONS.map(station => {
          const meta = STATION_META[station];
          const list = stationJobs(visibleJobs, station).filter(job => isMobile || !renderedSpanKeys.has(jobKey(job)));
          const isNowPressing = station === 'now_pressing';
          const reservedSpanHeight = isMobile ? 0 : reservedSpanHeightForStation(spanLayout, station);

          return (
            <section
              id={stationAnchor(station)}
              key={station}
              style={{
                background: COLORS.panel,
                border: `1px solid ${isNowPressing ? `${meta.color}88` : COLORS.border}`,
                borderRadius: '8px',
                minHeight: isMobile ? 'auto' : '620px',
                minWidth: 0,
                overflow: 'visible',
                padding: isMobile ? '10px' : '8px',
                position: 'relative',
                scrollMarginTop: isMobile ? '96px' : '112px',
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

              <Droppable droppableId={station}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      background: snapshot.isDraggingOver ? `${meta.color}14` : 'transparent',
                      borderRadius: '8px',
                      minHeight: isMobile ? '72px' : '540px',
                      paddingTop: reservedSpanHeight ? `${reservedSpanHeight}px` : undefined,
                      transition: 'background 0.15s',
                    }}
                  >
                    {list.map((job, index) => (
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
                          >
                            <JobCard
                              job={job}
                              onOpen={() => onJobOpen(job)}
                              onComplete={() => setConfirmCompleteJob(job)}
                              dragHandleProps={dragProvided.dragHandleProps}
                              compact={isMobile}
                              queueRank={station === 'press_queue' ? index + 1 : undefined}
                              stretch={stretchForJob(job, isMobile)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
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
}: {
  job: Job;
  onClose: () => void;
  onDashNotesSave: (job: Job, dashNotes: string) => Promise<void>;
  onRushToggle: (job: Job, rushed: boolean) => Promise<void>;
  onStageSpanSave: (job: Job, span: Station[]) => Promise<void>;
  onSplitJob: (job: Job, payload: { stage: Station; quantity: string }) => Promise<void>;
  onRecordsPressedSave: (job: Job, recordsPressed: number | null) => Promise<void>;
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
  const currentLogPressed = logRecordsPressed(job);
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

  const variants = Array.isArray(job.variants) ? job.variants : [];
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
              Update the pressed count shown on the board ({currentDisplayedPressed.toLocaleString()} / {quantityTotal.toLocaleString()}).
              {currentLogPressed > 0 && (
                <> Press log total: {currentLogPressed.toLocaleString()}{currentManualPressed !== null ? ' (overridden by manual count)' : ''}.</>
              )}
            </div>
            <label style={{ color: COLORS.muted, display: 'grid', fontSize: '11px', fontWeight: 850, gap: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Records Pressed
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
                {savingRecordsPressed ? 'Saving...' : 'Save Pressed Count'}
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

export default function DashboardClient({ jobs: initialJobs }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs ?? []);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useMediaQuery('(max-width: 760px)');

  useEffect(() => {
    fetch('/api/norp-jobs')
      .then(response => response.json())
      .then(data => {
        if (data.error) setError(data.error);
        if (data.jobs) setJobs(data.jobs);
        if (data.source) setSource(data.source);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleJobs = useMemo(() => (
    normalizedSearch
      ? jobs.filter(job => searchableJobText(job).includes(normalizedSearch))
      : jobs
  ), [jobs, normalizedSearch]);
  const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
  const visibleActiveJobs = visibleJobs.filter(job => stationOf(job) !== 'completed');
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
    setJobs(current => current.map(updateJob));
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
    setJobs(current => current.map(updateJob));
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
    setJobs(current => current.map(updateJob));
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
      setJobs(current => current.map(candidate => (
        jobKey(candidate) === key ? body.job : candidate
      )));
    }
    setSelectedJob(null);
    setError('');
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
    const logTotal = logRecordsPressed(job);
    const updateJob = (candidate: Job) => {
      if (jobKey(candidate) !== key) return candidate;
      const next = {
        ...candidate,
        records_pressed: savedValue,
        'Records Pressed': savedValue,
        records_pressed_source: recordsPressed === null ? 'press_logs' : 'manual',
      } as Job;
      if (recordsPressed === null) {
        next.records_pressed_total = logTotal > 0 ? String(logTotal) : '';
        delete next.records_pressed_from_logs;
      } else {
        next.records_pressed_total = savedValue;
        if (logTotal > 0) next.records_pressed_from_logs = String(logTotal);
      }
      return next;
    };
    setJobs(current => current.map(updateJob));
    setSelectedJob(current => current && jobKey(current) === key ? updateJob(current) : current);
    setError('');
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
        alignItems: isMobile ? 'flex-start' : 'flex-end',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '10px' : '18px',
        justifyContent: 'space-between',
        margin: '0 auto 18px',
        maxWidth: '1920px',
      }}>
        <div>
          <div style={{ color: COLORS.green, fontSize: '12px', fontWeight: 950, letterSpacing: '0.12em', marginBottom: '7px', textTransform: 'uppercase' }}>
            New Orleans Record Press
          </div>
          <h1 style={{ color: COLORS.text, fontSize: isMobile ? '27px' : '36px', lineHeight: 1.05, margin: 0 }}>
            Press Room Production Pipeline
          </h1>
        </div>
        <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: isMobile ? 'left' : 'right' }}>
          {loading ? 'Loading Airtable...' : `${activeJobs.length} active jobs`}
          {source && <div style={{ marginTop: '4px' }}>Source: {source === 'airtable' ? 'Airtable' : 'Sheet fallback'}</div>}
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
              fontSize: isMobile ? '15px' : '24px',
              fontWeight: 900,
              lineHeight: 1,
              minHeight: isMobile ? '44px' : '56px',
              padding: isMobile ? '0 14px' : '0 18px',
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Airtable Database
          </a>
        </div>
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
          onJobsChange={setJobs}
          onJobOpen={setSelectedJob}
          onError={setError}
          isMobile={isMobile}
        />
      </div>

      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onDashNotesSave={saveDashNotes}
          onRushToggle={toggleRushOrder}
          onStageSpanSave={saveStageSpan}
          onSplitJob={splitJob}
          onRecordsPressedSave={saveRecordsPressed}
        />
      )}
    </main>
  );
}
