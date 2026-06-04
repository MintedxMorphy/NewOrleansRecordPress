import { NextRequest, NextResponse } from 'next/server';
import { isAirtableConfigured, updateAirtableJobDashNotes } from '@/lib/airtable';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { dash_notes } = await req.json() as { dash_notes?: string };

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured for dashboard notes' }, { status: 500 });
    }

    await updateAirtableJobDashNotes(job_id, dash_notes ?? '');
    return NextResponse.json({ ok: true, source: 'airtable', job: { job_id, dash_notes: dash_notes ?? '' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
