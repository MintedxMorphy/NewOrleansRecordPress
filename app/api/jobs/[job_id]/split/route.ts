import { NextRequest, NextResponse } from 'next/server';
import { createAirtableJobSplit, isAirtableConfigured } from '@/lib/airtable';

export async function POST(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const { stage, quantity } = await req.json() as {
      stage?: string;
      quantity?: string;
    };

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured for job splitting' }, { status: 500 });
    }

    const result = await createAirtableJobSplit(job_id, {
      stage: stage || 'now_pressing',
      quantity,
    });

    return NextResponse.json({ ok: true, source: 'airtable', ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
