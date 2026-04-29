import { NextResponse } from 'next/server';
import {
  getNORPArtFiles, getNORPPriorityList, getNORPInventorySummary, getPressQueues,
  getStampersInventory, getMothersInventory, getSSTInventory, getIARCShipSplits,
  getNOVCInventory, getSleeversDoc,
} from '@/lib/norp-drive';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      artIndex, priorityRaw, inventory, pressQueues,
      stampers, mothers, sstCatalog, iarcSplits, novcStock, sleeversText,
    ] = await Promise.all([
      getNORPArtFiles().catch(e => { console.error('[drive-intel] art:', e); return {} as Record<string, never>; }),
      getNORPPriorityList().catch(e => { console.error('[drive-intel] priority:', e); return ''; }),
      getNORPInventorySummary().catch(e => { console.error('[drive-intel] inventory:', e); return null; }),
      getPressQueues().catch(e => { console.error('[drive-intel] press queues:', e); return null; }),
      getStampersInventory().catch(e => { console.error('[drive-intel] stampers:', e); return []; }),
      getMothersInventory().catch(e => { console.error('[drive-intel] mothers:', e); return []; }),
      getSSTInventory().catch(e => { console.error('[drive-intel] sst:', e); return []; }),
      getIARCShipSplits().catch(e => { console.error('[drive-intel] iarc:', e); return []; }),
      getNOVCInventory().catch(e => { console.error('[drive-intel] novc:', e); return []; }),
      getSleeversDoc().catch(e => { console.error('[drive-intel] sleevers:', e); return ''; }),
    ]);

    const artMatrixIds = Object.keys(artIndex).sort();

    return NextResponse.json({
      artIndex,
      artMatrixIds,
      artCount: artMatrixIds.length,
      priorityListText: priorityRaw,
      priorityListPreview: (priorityRaw as string).slice(0, 500),
      inventory,
      pressQueues,
      stampers,
      mothers,
      sstCatalog,
      iarcSplits,
      novcStock,
      sleeversText,
    });
  } catch (error) {
    console.error('[norp-drive-intel] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
