import { NextRequest, NextResponse } from 'next/server';
import { findRow, updateRow } from '@/lib/sheets';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { stage } = await req.json() as { stage: string };
    const found = await findRow('jobs', 'job_id', job_id);
    if (!found) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const updated = { ...found.row, stage };
    await updateRow('jobs', found.rowIndex, updated);
    return NextResponse.json({ ok: true, job: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
