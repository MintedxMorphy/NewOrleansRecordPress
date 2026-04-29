import { NextResponse } from 'next/server';
import { getNORPArtFiles, getNORPPriorityList, getNORPInventorySummary, getPressQueues } from '@/lib/norp-drive';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [artIndex, priorityRaw, inventory, pressQueues] = await Promise.all([
      getNORPArtFiles().catch(e => { console.error('[drive-intel] art:', e); return {}; }),
      getNORPPriorityList().catch(e => { console.error('[drive-intel] priority:', e); return ''; }),
      getNORPInventorySummary().catch(e => { console.error('[drive-intel] inventory:', e); return null; }),
      getPressQueues().catch(e => { console.error('[drive-intel] press queues:', e); return null; }),
    ]);

    const artMatrixIds = Object.keys(artIndex).sort();

    return NextResponse.json({
      artIndex,
      artMatrixIds,
      artCount: artMatrixIds.length,
      priorityListText: priorityRaw,
      priorityListPreview: priorityRaw.slice(0, 500),
      inventory,
      pressQueues,
    });
  } catch (error) {
    console.error('[norp-drive-intel] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
