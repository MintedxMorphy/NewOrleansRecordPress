import { NextRequest, NextResponse } from 'next/server';
import { isAirtableConfigured, updateAirtableJobRecordsPressed } from '@/lib/airtable';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { records_pressed } = await req.json() as { records_pressed?: number | string | null };

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured for records pressed updates' }, { status: 500 });
    }

    let parsed: number | null = null;
    if (records_pressed !== null && records_pressed !== undefined && records_pressed !== '') {
      parsed = Number.parseInt(String(records_pressed).replace(/,/g, ''), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: 'Records pressed must be a non-negative whole number' }, { status: 400 });
      }
    }

    const saved = await updateAirtableJobRecordsPressed(job_id, parsed);
    return NextResponse.json({
      ok: true,
      source: 'airtable',
      job: {
        job_id,
        records_pressed: saved.records_pressed,
        'Records Pressed': saved.records_pressed,
        records_pressed_baseline_at: saved.records_pressed_baseline_at,
        'Records Pressed Baseline At': saved.records_pressed_baseline_at,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
