import { NextResponse } from 'next/server';
import { getNORPJobs } from '@/lib/norp-sheet';
import { getNORPArtFiles } from '@/lib/norp-drive';
import { getAirtableJobs, isAirtableConfigured } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const source = isAirtableConfigured() ? 'airtable' : 'google_sheet';
    const jobs = source === 'airtable' ? await getAirtableJobs() : await getNORPJobs();

    // Best-effort enrichment with art file index. If Drive call fails,
    // jobs still return — we just skip art status.
    let artIndex: Awaited<ReturnType<typeof getNORPArtFiles>> = {};
    try {
      artIndex = await getNORPArtFiles();
    } catch (e) {
      console.error('[norp-jobs] art index lookup failed:', e);
    }

    const enriched = jobs.map(j => {
      const art = j.matrix ? artIndex[j.matrix] : undefined;
      return {
        ...j,
        art_received: !!art,
        art_received_date: art?.receivedDate ?? '',
        art_sides: art ? art.sides.join('+') : '',
      };
    });

    return NextResponse.json({ count: enriched.length, jobs: enriched, source });
  } catch (error) {
    console.error('[norp-jobs] Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
