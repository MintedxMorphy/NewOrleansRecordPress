import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        create table if not exists press_log (
          id uuid primary key default gen_random_uuid(),
          operator_name text not null,
          shift text not null check (shift in ('day','night')),
          press_id text,
          job_ref text,
          records_pressed integer,
          duration_hours numeric(5,2),
          compound text,
          downtime_minutes integer,
          issues text,
          notes text,
          created_at timestamptz not null default now()
        );
        create index if not exists press_log_created_at_idx on press_log(created_at desc);
      `
    })

    // If rpc not available, try direct query via raw SQL
    if (error) {
      // Fallback: just try to select from the table; if it exists we're good
      const { error: selectError } = await supabase.from('press_log').select('id').limit(1)
      if (!selectError) return NextResponse.json({ ok: true, message: 'press_log table already exists' })
      return NextResponse.json({ ok: false, error: error.message, hint: 'Run the SQL in press-log-migration.sql manually in the Supabase dashboard' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'press_log table created' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
