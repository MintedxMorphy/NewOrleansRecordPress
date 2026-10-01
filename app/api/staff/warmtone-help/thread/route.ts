import { NextRequest, NextResponse } from 'next/server';
import { readHelpMemory, resetHelpThread } from '@/lib/warmtone-manual/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const memory = await readHelpMemory();
  return NextResponse.json({ ok: true, shared: true, memory });
}

export async function POST(req: NextRequest) {
  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (body.action !== 'reset') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const memory = await resetHelpThread();
  return NextResponse.json({ ok: true, shared: true, memory });
}
