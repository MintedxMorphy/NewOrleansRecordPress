import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';
import { getAirtableInventoryDashboard, isAirtableConfigured } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

function fallbackInventory() {
  const filePath = join(process.cwd(), 'app', 'admin', 'inventory.json');
  const inventory = JSON.parse(readFileSync(filePath, 'utf-8'));
  return {
    source: 'local',
    pvcCapacityLbs: inventory.pvc?.capacity || 10000,
    tables: [],
    legacy: inventory,
    items: [],
  };
}

export async function GET() {
  try {
    if (!isAirtableConfigured()) {
      return NextResponse.json(fallbackInventory());
    }

    const inventory = await getAirtableInventoryDashboard();
    return NextResponse.json(inventory);
  } catch (error) {
    console.error('[staff inventory] Airtable inventory failed:', error);
    try {
      return NextResponse.json({
        ...fallbackInventory(),
        warning: error instanceof Error ? error.message : String(error),
      });
    } catch {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
}
