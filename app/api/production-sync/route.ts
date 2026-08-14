import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const [pressResult, qcResult] = await Promise.all([
      supabase
        .from('press_log')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('qc_log')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (pressResult.error || qcResult.error) {
      throw pressResult.error || qcResult.error;
    }

    return NextResponse.json({
      press_log_at: pressResult.data?.[0]?.created_at || '',
      qc_log_at: qcResult.data?.[0]?.created_at || '',
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to read production log heartbeat',
    }, { status: 500 });
  }
}
