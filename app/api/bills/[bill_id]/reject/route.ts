import { NextRequest, NextResponse } from 'next/server';
import { findRow, updateRow } from '@/lib/sheets';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bill_id: string }> }) {
  try {
    const { bill_id } = await params;
    const found = await findRow('bills_inbox', 'email_id', bill_id);
    if (!found) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    const updated = { ...found.row, status: 'rejected' };
    await updateRow('bills_inbox', found.rowIndex, updated);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
