'use client';

import { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
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

function affirmative(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['no', 'n', 'false', '0'].includes(normalized)) return false;
  return ['yes', 'y', 'true', 'approved', 'done', 'complete', 'completed', '1'].some(term =>
    normalized === term || normalized.startsWith(`${term} `)
  );
}

function testPressingApproved(job: Job) {
  return affirmative(value(job, ['test_pressings_approved', 'approved?', 'Test Pressings Approved', 'TP Approved']));
}

function stationOf(job: Job): Station {
  const raw = value(job, ['stage', 'Dashboard Stage']).toLowerCase().replace(/[\s-]+/g, '_');
  if (STATIONS.includes(raw as Station)) return raw as Station;
  if (['quote', 'deposit', 'plates'].includes(raw)) return 'pre_production';
  if (['approved', 'test_pressing', 'test_pressings'].includes(raw)) return 'press_queue';
  if (['press', 'pressing'].includes(raw)) return 'now_pressing';
  if (['qc', 'quality'].includes(raw)) return 'quality_control';
  if (['pack', 'packing'].includes(raw)) return 'assembly';
  if (['ship', 'shipped'].includes(raw)) return 'shipping';
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

function StatusPill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      color,
      background: `${color}1F`,
      border: `1px solid ${color}66`,
      borderRadius: '999px',
      fontSize: '10px',
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
}: {
  job: Job;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const station = stationOf(job);
  const meta = STATION_META[station];
  const customer = value(job, ['customer', 'Customer', 'Customer Name', 'Artist', 'Title']) || 'Untitled job';
  const matrix = value(job, ['matrix', 'MATRIX', 'Matrix ID', 'job_id']);
  const quantity = value(job, ['quantity', 'Quantity', 'Qty', 'Run Size']);
  const colors = value(job, ['colors', 'Colors', 'color', 'Color', 'Vinyl Color']);
  const weight = value(job, ['weight', 'Weight', 'Weight (g)']);
  const speed = value(job, ['speed', 'SPEED', 'Speed', 'RPM']);
  const shipDate = value(job, ['ship_date', 'SHIP DATE', 'Ship Date']);
  const notes = value(job, ['notes', 'Notes', 'Project Notes', 'Production Notes']);
  const artReady = job.art_received === true || job.art_received === 'true';
  const canComplete = station === 'shipping';

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
        padding: '9px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = meta.color)}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.borderLeftColor = meta.color;
      }}
    >
      <div>
        <div style={{ color: COLORS.text, fontSize: '12px', fontWeight: 850, lineHeight: 1.25 }}>
          {customer.length > 58 ? `${customer.slice(0, 58)}...` : customer}
        </div>
        {matrix && (
          <div style={{ color: COLORS.muted, fontFamily: 'monospace', fontSize: '10px', marginTop: '3px' }}>
            {matrix}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
        {quantity && <StatusPill color={meta.color}>{quantity}</StatusPill>}
        {colors && <StatusPill color="#C9A84C">{colors}</StatusPill>}
        {weight && <StatusPill color="#9CCFFF">{weight.replace('1900-05-29T00:00:00.000Z', '180g')}</StatusPill>}
        {speed && <StatusPill color="#B781FF">{speed}</StatusPill>}
        {artReady && <StatusPill color={COLORS.green}>Art</StatusPill>}
        {shipDate && <StatusPill color="#4DA3FF">{shipDate}</StatusPill>}
      </div>

      {notes && (
        <div style={{
          color: COLORS.muted,
          display: '-webkit-box',
          fontSize: '11px',
          lineHeight: 1.35,
          marginTop: '9px',
          overflow: 'hidden',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
        }}>
          {notes}
        </div>
      )}

      {canComplete && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onComplete();
          }}
          style={{
            alignItems: 'center',
            background: `${meta.color}18`,
            border: `1px solid ${meta.color}66`,
            borderRadius: '6px',
            color: meta.color,
            cursor: 'pointer',
            display: 'flex',
            fontSize: '10px',
            fontWeight: 850,
            gap: '5px',
            justifyContent: 'center',
            marginTop: '9px',
            padding: '6px 8px',
            width: '100%',
          }}
        >
          <BadgeCheck size={13} />
          Complete
        </button>
      )}
    </div>
  );
}

function Pipeline({
  jobs,
  onJobsChange,
  onJobOpen,
  onError,
}: {
  jobs: Job[];
  onJobsChange: (jobs: Job[]) => void;
  onJobOpen: (job: Job) => void;
  onError: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const saveStation = async (nextJobs: Job[], touchedStations: Station[]) => {
    const touched = touchedStations.flatMap(station => stationJobs(nextJobs, station));
    const response = await persistReorder(touched);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Airtable save failed (${response.status})`);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const fromStation = result.source.droppableId as Station;
    const toStation = result.destination.droppableId as Station;
    const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
    const hiddenJobs = jobs.filter(job => stationOf(job) === 'completed');
    const sourceList = stationJobs(activeJobs, fromStation);
    const destinationList = fromStation === toStation ? sourceList : stationJobs(activeJobs, toStation);
    const [moved] = sourceList.splice(result.source.index, 1);

    if (!moved) return;

    if (toStation === 'now_pressing' && !testPressingApproved(moved)) {
      onError('Test pressing must be approved before a job can move into NOW PRESSING.');
      return;
    }

    const movedNext = { ...moved, stage: toStation };

    if (fromStation === toStation) {
      sourceList.splice(result.destination.index, 0, movedNext);
    } else {
      destinationList.splice(result.destination.index, 0, movedNext);
    }

    const touchedStations = fromStation === toStation ? [fromStation] : [fromStation, toStation];
    const rebuilt = activeJobs.map(job => {
      const key = jobKey(job);
      const replacement = [...sourceList, ...destinationList].find(candidate => jobKey(candidate) === key);
      return replacement ?? job;
    });

    const orderedTouched = touchedStations.flatMap(station =>
      stationJobs(rebuilt, station).map((job, index) => ({ ...job, dashboard_order: String(index + 1) }))
    );
    const nextJobs = [...rebuilt, ...hiddenJobs].map(job => {
      const replacement = orderedTouched.find(candidate => jobKey(candidate) === jobKey(job));
      return replacement ?? job;
    });

    onJobsChange(nextJobs);
    onError('');

    try {
      await saveStation(nextJobs, touchedStations);
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
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '10px',
        paddingBottom: '12px',
      }}>
        {STATIONS.map(station => {
          const meta = STATION_META[station];
          const list = stationJobs(jobs, station);
          const isNowPressing = station === 'now_pressing';

          return (
            <section
              key={station}
              style={{
                background: isNowPressing ? `linear-gradient(180deg, ${meta.color}18 0%, ${COLORS.panel} 24%)` : COLORS.panel,
                border: `1px solid ${isNowPressing ? meta.color : COLORS.border}`,
                borderRadius: '8px',
                boxShadow: isNowPressing ? `0 0 28px ${meta.color}30` : undefined,
                minHeight: '620px',
                minWidth: 0,
                padding: '8px',
              }}
            >
              <div style={{ borderBottom: `1px solid ${COLORS.border}`, marginBottom: '8px', paddingBottom: '9px' }}>
                <div style={{ alignItems: 'center', display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                  <div style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
                    <StationIcon station={station} size={16} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        color: meta.color,
                        fontSize: isNowPressing ? '11px' : '10px',
                        fontWeight: 950,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        whiteSpace: 'normal',
                        lineHeight: 1.1,
                      }}>
                        {meta.label}
                      </div>
                      <div style={{ color: COLORS.faint, fontSize: '10px', marginTop: '2px', lineHeight: 1.15 }}>
                        {meta.description}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    background: `${meta.color}22`,
                    border: `1px solid ${meta.color}66`,
                    borderRadius: '999px',
                    color: meta.color,
                    fontSize: '11px',
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
                      minHeight: '540px',
                      transition: 'background 0.15s',
                    }}
                  >
                    {list.map((job, index) => (
                      <Draggable key={jobKey(job)} draggableId={jobKey(job)} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: dragSnapshot.isDragging ? 0.88 : 1,
                            }}
                          >
                            <JobCard job={job} onOpen={() => onJobOpen(job)} onComplete={() => completeJob(job)} />
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
    </DragDropContext>
  );
}

function JobDrawer({ job, onClose }: { job: Job; onClose: () => void }) {
  const station = stationOf(job);
  const meta = STATION_META[station];
  const details = [
    ['Station', meta.label],
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
              Notes
            </div>
            <div style={{ color: COLORS.text, fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {notes}
            </div>
          </div>
        )}
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

  const activeJobs = jobs.filter(job => stationOf(job) !== 'completed');
  const counts = useMemo(() => Object.fromEntries(
    STATIONS.map(station => [station, stationJobs(jobs, station).length])
  ) as Record<Station, number>, [jobs]);

  return (
    <main style={{
      background:
        'radial-gradient(circle at 18% 0%, rgba(0,232,106,0.12), transparent 28%), radial-gradient(circle at 78% 8%, rgba(77,163,255,0.12), transparent 24%), #090909',
      color: COLORS.text,
      minHeight: '100vh',
      padding: '18px',
    }}>
      <header style={{ alignItems: 'flex-end', display: 'flex', gap: '18px', justifyContent: 'space-between', margin: '0 auto 18px', maxWidth: '1920px' }}>
        <div>
          <div style={{ color: COLORS.green, fontSize: '12px', fontWeight: 950, letterSpacing: '0.12em', marginBottom: '7px', textTransform: 'uppercase' }}>
            New Orleans Record Press
          </div>
          <h1 style={{ color: COLORS.text, fontSize: '36px', lineHeight: 1.05, margin: 0 }}>
            Press Room Production Pipeline
          </h1>
        </div>
        <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: 'right' }}>
          {loading ? 'Loading Airtable...' : `${activeJobs.length} active jobs`}
          {source && <div style={{ marginTop: '4px' }}>Source: {source === 'airtable' ? 'Airtable' : 'Sheet fallback'}</div>}
        </div>
      </header>

      <section style={{
        display: 'grid',
        gap: '10px',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        margin: '0 auto 16px',
        maxWidth: '1920px',
      }}>
        {STATIONS.map(station => {
          const meta = STATION_META[station];
          return (
            <div key={station} style={{
              alignItems: 'center',
              background: station === 'now_pressing' ? `${meta.color}18` : COLORS.panel,
              border: `1px solid ${station === 'now_pressing' ? meta.color : COLORS.border}`,
              borderRadius: '8px',
              display: 'flex',
              gap: '8px',
              minHeight: '66px',
              minWidth: 0,
              padding: '9px',
            }}>
              <StationIcon station={station} size={17} />
              <div>
                <div style={{ color: meta.color, fontSize: '24px', fontWeight: 950, lineHeight: 1 }}>{counts[station]}</div>
                <div style={{ color: COLORS.muted, fontSize: '10px', fontWeight: 850, letterSpacing: '0.06em', marginTop: '4px', textTransform: 'uppercase' }}>{meta.shortLabel}</div>
              </div>
            </div>
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
        <Pipeline jobs={jobs} onJobsChange={setJobs} onJobOpen={setSelectedJob} onError={setError} />
      </div>

      {selectedJob && <JobDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </main>
  );
}
