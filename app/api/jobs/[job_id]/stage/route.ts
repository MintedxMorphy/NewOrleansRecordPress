import { NextRequest, NextResponse } from 'next/server';
import { findRow, updateRow } from '@/lib/sheets';
import { completeAirtableJob, isAirtableConfigured, updateAirtableJobPosition } from '@/lib/airtable';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { stage, order } = await req.json() as { stage: string; order?: number };
    if (isAirtableConfigured()) {
      if (stage === 'completed') {
        const result = await completeAirtableJob(job_id);
        return NextResponse.json({ ok: true, source: 'airtable', job: { job_id, stage }, ...result });
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
