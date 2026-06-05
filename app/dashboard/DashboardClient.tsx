'use client';

import { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DraggableProvidedDragHandleProps, DropResult } from '@hello-pangea/dnd';
import {
  BadgeCheck,
  Boxes,
  ClipboardList,
  Disc3,
  Layers3,
  PackageCheck,
  SearchCheck,
  Truck,
} from 'lucide-react';

interface Job { [key: string]: string | boolean | undefined }

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

function stationAnchor(station: Station) {
  return `station-${station}`;
}

function searchableJobText(job: Job) {
  return [
    value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']),
    value(job, ['matrix', 'MATRIX', 'Matrix ID', 'job_id']),
    value(job, ['order_number', 'ORDER NUMBER']),
    value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']),
    value(job, ['colors', 'Colors', 'color', 'Color', 'Vinyl Color']),
    value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']),
    value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']),
  ].join(' ').toLowerCase();
}

function runLabelFromNotes(notes: string) {
  const match = notes.match(/\[Run\s+(\d+)\s*\/\s*(\d+)\]/i);
  return match ? `Run ${match[1]}/${match[2]}` : '';
}

function visibleDashNotes(notes: string) {
  return notes
    .replace(/\[Run\s+\d+\s*\/\s*\d+\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function dashNotesWithRunMarker(originalNotes: string, visibleNotes: string) {
  const match = originalNotes.match(/\[Run\s+\d+\s*\/\s*\d+\]/i);
  return [match?.[0], visibleNotes.trim()].filter(Boolean).join(visibleNotes.trim() ? '\n' : '');
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
  return fetch('/api/jobs/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      updates: updates.map((job, index) => ({
        job_id: jobKey(job),
        stage: stationOf(job),
        order: index + 1,
      })),
    }),
  });
}

function persistJobPosition(job: Job, stage: Station, order: number) {
  return fetch(`/api/jobs/${encodeURIComponent(jobKey(job))}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, order }),
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
}: {
  job: Job;
  onOpen: () => void;
  onComplete: () => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  compact?: boolean;
}) {
  const jobStage = stationOf(job);
  const station: Station = jobStage === 'completed' ? 'shipping' : jobStage;
  const meta = STATION_META[station];
  const customer = value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']) || 'Untitled job';
  const matrix = value(job, ['matrix', 'MATRIX', 'Matrix ID', 'job_id']);
  const quantity = value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']);
  const colors = value(job, ['colors', 'Colors', 'color', 'Color', 'Vinyl Color']);
  const weight = value(job, ['weight', 'Weight', 'Weight (g)']);
  const speed = value(job, ['speed', 'SPEED', 'Speed', 'RPM']);
  const shipDate = value(job, ['ship_date', 'SHIP DATE', 'Ship Date']);
  const notes = value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']);
  const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
  const dashNotes = visibleDashNotes(rawDashNotes);
  const runLabel = runLabelFromNotes(rawDashNotes);
  const inferredReason = value(job, ['inferred_stage_reason']);
  const inferredAt = value(job, ['inferred_stage_at']);
  const duplicateCount = value(job, ['duplicate_count']);
  const artReady = job.art_received === true || job.art_received === 'true';
  const canComplete = station === 'shipping';
  const completeColor = COLORS.red;

  return (
    <div
      onClick={onOpen}
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid ${meta.color}`,
        borderRadius: '8px',
        boxShadow: station === 'now_pressing' ? `0 0 0 1px ${meta.color}44, 0 12px 30px #00000055` : '0 8px 18px #00000035',
        cursor: 'pointer',
        marginBottom: '8px',
        padding: compact ? '13px' : '10px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = meta.color)}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.borderLeftColor = meta.color;
      }}
    >
      <div {...dragHandleProps}>
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
          {quantity && <StatusPill color={meta.color}>{quantity}</StatusPill>}
          {colors && <StatusPill color="#C9A84C">{colors}</StatusPill>}
          {weight && <StatusPill color="#9CCFFF">{weight.replace('1900-05-29T00:00:00.000Z', '180g')}</StatusPill>}
          {speed && <StatusPill color="#B781FF">{speed}</StatusPill>}
          {runLabel && <StatusPill color={COLORS.green}>{runLabel}</StatusPill>}
          {artReady && <StatusPill color={COLORS.green}>Art</StatusPill>}
          {shipDate && <StatusPill color="#4DA3FF">{shipDate}</StatusPill>}
          {duplicateCount && Number(duplicateCount) > 1 && <StatusPill color="#FFB84D">{duplicateCount} merged</StatusPill>}
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
          onMouseDownCapture={event => event.stopPropagation()}
          onPointerDownCapture={event => event.stopPropagation()}
          onTouchStartCapture={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
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
  searchActive = false,
}: {
  jobs: Job[];
  visibleJobs?: Job[];
  onJobsChange: (jobs: Job[]) => void;
  onJobOpen: (job: Job) => void;
  onError: (message: string) => void;
  isMobile?: boolean;
  searchActive?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [confirmCompleteJob, setConfirmCompleteJob] = useState<Job | null>(null);
  useEffect(() => setMounted(true), []);

  const saveMovedJob = async (job: Job, stage: Station, order: number) => {
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

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (searchActive) {
      onError('Clear search before dragging jobs.');
      return;
    }

    const fromStation = result.source.droppableId as Station;
    const toStation = result.destination.droppableId as Station;
    const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
    const hiddenJobs = jobs.filter(job => stationOf(job) === 'completed');
    const sourceList = stationJobs(activeJobs, fromStation);
    const destinationList = fromStation === toStation ? sourceList : stationJobs(activeJobs, toStation);
    const [moved] = sourceList.splice(result.source.index, 1);

    if (!moved) return;

    const movedNext = { ...moved, stage: toStation };

    if (fromStation === toStation) {
      sourceList.splice(result.destination.index, 0, movedNext);
    } else {
      destinationList.splice(result.destination.index, 0, movedNext);
    }

    const destinationAfterMove = fromStation === toStation ? sourceList : destinationList;
    const movedOrder = orderForInsertion(destinationAfterMove, result.destination.index);
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
      await saveMovedJob(movedPersisted, toStation, movedOrder);
    } catch (error) {
      onJobsChange(jobs);
      onError(error instanceof Error ? error.message : String(error));
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
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobKey(job))}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: target, order: 999999 }),
      });
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

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(0, 1fr))',
        gap: isMobile ? '14px' : '10px',
        paddingBottom: '12px',
      }}>
        {STATIONS.map(station => {
          const meta = STATION_META[station];
          const list = stationJobs(visibleJobs, station);
          const isNowPressing = station === 'now_pressing';

          return (
            <section
              id={stationAnchor(station)}
              key={station}
              style={{
                background: isNowPressing ? `linear-gradient(180deg, ${meta.color}18 0%, ${COLORS.panel} 24%)` : COLORS.panel,
                border: `1px solid ${isNowPressing ? meta.color : COLORS.border}`,
                borderRadius: '8px',
                boxShadow: isNowPressing ? `0 0 28px ${meta.color}30` : undefined,
                minHeight: isMobile ? 'auto' : '620px',
                minWidth: 0,
                padding: isMobile ? '10px' : '8px',
                scrollMarginTop: isMobile ? '96px' : '112px',
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
                    {list.length}
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
                    transition: 'background 0.15s',
                  }}
                  >
                    {list.map((job, index) => (
                      <Draggable key={jobKey(job)} draggableId={jobKey(job)} index={index} isDragDisabled={searchActive}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: dragSnapshot.isDragging ? 0.88 : 1,
                            }}
                          >
                            <JobCard
                              job={job}
                              onOpen={() => onJobOpen(job)}
                              onComplete={() => setConfirmCompleteJob(job)}
                              dragHandleProps={dragProvided.dragHandleProps}
                              compact={isMobile}
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
  onSplitJob,
}: {
  job: Job;
  onClose: () => void;
  onDashNotesSave: (job: Job, dashNotes: string) => Promise<void>;
  onSplitJob: (job: Job, payload: { stage: Station; quantity: string }) => Promise<void>;
}) {
  const jobStage = stationOf(job);
  const station: Station = jobStage === 'completed' ? 'shipping' : jobStage;
  const meta = STATION_META[station];
  const rawDashNotes = value(job, ['dash_notes', 'Dash Notes', 'Dashboard Notes']);
  const dashNotes = visibleDashNotes(rawDashNotes);
  const runLabel = runLabelFromNotes(rawDashNotes);
  const [draftDashNotes, setDraftDashNotes] = useState(dashNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [splitStage, setSplitStage] = useState<Station>('now_pressing');
  const [splitQuantity, setSplitQuantity] = useState('');
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState('');

  useEffect(() => {
    setDraftDashNotes(dashNotes);
    setNotesError('');
  }, [dashNotes, job]);

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
  const saveDashNotes = async () => {
    setSavingNotes(true);
    setNotesError('');
    try {
      await onDashNotesSave(job, dashNotesWithRunMarker(rawDashNotes, draftDashNotes));
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingNotes(false);
    }
  };
  const notesDirty = draftDashNotes !== dashNotes;
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
    STATIONS.map(station => [station, stationJobs(visibleJobs, station).length])
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
          <a
            href={AIRTABLE_DATABASE_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              color: COLORS.text,
              fontSize: '13px',
              fontWeight: 850,
              padding: '12px 14px',
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
          searchActive={Boolean(normalizedSearch)}
        />
      </div>

      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onDashNotesSave={saveDashNotes}
          onSplitJob={splitJob}
        />
      )}
    </main>
  );
}
