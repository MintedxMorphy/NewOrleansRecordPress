import { NextRequest, NextResponse } from 'next/server';
import { isAirtableConfigured, updateAirtableJobPosition } from '@/lib/airtable';

type ReorderUpdate = {
  job_id: string;
  stage: string;
  order: number;
};

export async function PATCH(req: NextRequest) {
  try {
    const { updates } = await req.json() as { updates?: ReorderUpdate[] };
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Missing updates array' }, { status: 400 });
    }

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured for dashboard reordering' }, { status: 500 });
    }

    await Promise.all(
      updates.map(update => updateAirtableJobPosition(update.job_id, update.stage, update.order))
    );

    return NextResponse.json({ ok: true, source: 'airtable', count: updates.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
