import { NextRequest, NextResponse } from 'next/server';
import { getAirtableJobs, isAirtableConfigured, updateAirtableJobPosition } from '@/lib/airtable';

type ReorderUpdate = {
  job_id: string;
  stage: string;
  order: number;
};

function isApproved(value = '') {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['no', 'n', 'false', '0'].includes(normalized)) return false;
  return ['yes', 'y', 'true', 'approved', 'done', 'complete', 'completed', '1'].some(term =>
    normalized === term || normalized.startsWith(`${term} `)
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const { updates } = await req.json() as { updates?: ReorderUpdate[] };
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Missing updates array' }, { status: 400 });
    }

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured for dashboard reordering' }, { status: 500 });
    }

    const nowPressingUpdates = updates.filter(update => update.stage === 'now_pressing');
    if (nowPressingUpdates.length > 0) {
      const jobs = await getAirtableJobs();
      const unapproved = nowPressingUpdates.find(update => {
        const job = jobs.find(item => item.job_id === update.job_id || item.airtable_record_id === update.job_id);
        return !isApproved(job?.test_pressings_approved);
      });

      if (unapproved) {
        return NextResponse.json(
          { error: 'Test pressing must be approved before a job can move into NOW PRESSING.' },
          { status: 400 }
        );
      }
    }

    await Promise.all(
      updates.map(update => updateAirtableJobPosition(update.job_id, update.stage, update.order))
    );

    return NextResponse.json({ ok: true, source: 'airtable', count: updates.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
