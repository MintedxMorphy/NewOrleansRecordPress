import { NextRequest, NextResponse } from 'next/server';
import { createAirtableJobSplit, isAirtableConfigured } from '@/lib/airtable';

export async function POST(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { stage, quantity, note } = await req.json() as {
      stage?: string;
      quantity?: string;
      note?: string;
    };

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured for job splitting' }, { status: 500 });
    }

    const job = await createAirtableJobSplit(job_id, {
      stage: stage || 'now_pressing',
      quantity,
      note,
    });

    return NextResponse.json({ ok: true, source: 'airtable', job });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
