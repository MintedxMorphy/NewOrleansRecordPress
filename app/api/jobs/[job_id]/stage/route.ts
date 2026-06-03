import { NextRequest, NextResponse } from 'next/server';
import { findRow, updateRow } from '@/lib/sheets';
import { completeAirtableJob, getAirtableJobs, isAirtableConfigured, updateAirtableJobPosition } from '@/lib/airtable';

function isApproved(value = '') {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['no', 'n', 'false', '0'].includes(normalized)) return false;
  return ['yes', 'y', 'true', 'approved', 'done', 'complete', 'completed', '1'].some(term =>
    normalized === term || normalized.startsWith(`${term} `)
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { stage, order } = await req.json() as { stage: string; order?: number };
    if (isAirtableConfigured()) {
      if (stage === 'completed') {
        const result = await completeAirtableJob(job_id);
        return NextResponse.json({ ok: true, source: 'airtable', job: { job_id, stage }, ...result });
      }

      if (stage === 'now_pressing') {
        const jobs = await getAirtableJobs();
        const job = jobs.find(item => item.job_id === job_id || item.airtable_record_id === job_id);
        const approved = isApproved(job?.test_pressings_approved);

        if (!approved) {
          return NextResponse.json(
            { error: 'Test pressing must be approved before a job can move into NOW PRESSING.' },
            { status: 400 }
          );
        }
      }

      await updateAirtableJobPosition(job_id, stage, order);
      return NextResponse.json({ ok: true, source: 'airtable', job: { job_id, stage, order } });
    }

    const found = await findRow('jobs', 'job_id', job_id);
    if (!found) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const updated = { ...found.row, stage };
    await updateRow('jobs', found.rowIndex, updated);
    return NextResponse.json({ ok: true, job: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
