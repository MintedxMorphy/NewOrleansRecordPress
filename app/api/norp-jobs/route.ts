import { NextResponse } from 'next/server';
import { getNORPJobs } from '@/lib/norp-sheet';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await getNORPJobs();
    return NextResponse.json({ count: jobs.length, jobs });
  } catch (error) {
    console.error('[norp-jobs] Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
