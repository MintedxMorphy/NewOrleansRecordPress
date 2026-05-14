import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type PressEntryBody = {
  operator_name?: string
  shift?: string
  press_id?: string
  job_ref?: string
  records_pressed?: number | string | null
  duration_hours?: number | string | null
  compound?: string | null
  downtime_minutes?: number | string | null
  issues?: string | null
  notes?: string | null
  created_at?: string
}

const VALID_SHIFTS = new Set(['day', 'night'])

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: entries, error } = await supabase
      .from('press_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching press entries:', error)
      return NextResponse.json({ error: 'Failed to fetch press entries' }, { status: 500 })
    }

    return NextResponse.json({ entries: entries || [] })
  } catch (error) {
    console.error('Error fetching press entries:', error)
    return NextResponse.json({ error: 'Failed to fetch press entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PressEntryBody
    const operatorName = body.operator_name?.trim()
    const shift = body.shift?.toLowerCase()

    if (!operatorName || !shift || !VALID_SHIFTS.has(shift)) {
      return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 })
    }

    const recordsPressed = body.records_pressed === '' || body.records_pressed == null
      ? null : Number.parseInt(String(body.records_pressed), 10)
    const durationHours = body.duration_hours === '' || body.duration_hours == null
      ? null : Number(body.duration_hours)
    const downtimeMinutes = body.downtime_minutes === '' || body.downtime_minutes == null
      ? null : Number.parseInt(String(body.downtime_minutes), 10)

    const supabase = await createClient()
    const createdAt = body.created_at ? new Date(body.created_at) : null

    const { data: entry, error } = await supabase
      .from('press_log')
      .insert({
        operator_name: operatorName,
        shift,
        press_id: body.press_id?.trim() || null,
        job_ref: body.job_ref?.trim() || null,
        records_pressed: recordsPressed,
        duration_hours: durationHours,
        compound: body.compound?.trim() || null,
        downtime_minutes: downtimeMinutes,
        issues: body.issues?.trim() || null,
        notes: body.notes?.trim() || null,
        ...(createdAt ? { created_at: createdAt.toISOString() } : {}),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating press entry:', error)
      return NextResponse.json({ error: 'Failed to create press entry' }, { status: 500 })
    }

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error('Error creating press entry:', error)
    return NextResponse.json({ error: 'Failed to create press entry' }, { status: 500 })
  }
}
