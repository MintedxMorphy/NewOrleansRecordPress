import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type QcEntryBody = {
  worker_name?: string
  shift?: string
  job_ref?: string
  task_types?: string[]
  duration_hours?: number | string | null
  quantity?: number | string | null
  status?: string
  notes?: string
  created_at?: string
}

const VALID_SHIFTS = new Set(['day', 'night'])
const VALID_STATUSES = new Set(['pass', 'flag', 'fail'])

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: entries, error } = await supabase
      .from('qc_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching QC entries:', error)
      return NextResponse.json({ error: 'Failed to fetch QC entries' }, { status: 500 })
    }

    return NextResponse.json({ entries: entries || [] })
  } catch (error) {
    console.error('Error fetching QC entries:', error)
    return NextResponse.json({ error: 'Failed to fetch QC entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QcEntryBody
    const workerName = body.worker_name?.trim()
    const shift = body.shift?.toLowerCase()
    const status = body.status?.toLowerCase()

    if (!workerName || !shift || !VALID_SHIFTS.has(shift) || !status || !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 })
    }

    const durationHours = body.duration_hours === '' || body.duration_hours == null
      ? null
      : Number(body.duration_hours)
    const quantity = body.quantity === '' || body.quantity == null
      ? null
      : Number.parseInt(String(body.quantity), 10)

    if (durationHours !== null && Number.isNaN(durationHours)) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
    }

    if (quantity !== null && Number.isNaN(quantity)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const supabase = await createClient()
    const createdAt = body.created_at ? new Date(body.created_at) : null

    if (createdAt && Number.isNaN(createdAt.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const { data: entry, error } = await supabase
      .from('qc_log')
      .insert({
        worker_name: workerName,
        shift,
        job_ref: body.job_ref?.trim() || null,
        task_types: Array.isArray(body.task_types) ? body.task_types : [],
        duration_hours: durationHours,
        quantity,
        status,
        notes: body.notes?.trim() || null,
        is_director: workerName === 'Sarah',
        ...(createdAt ? { created_at: createdAt.toISOString() } : {}),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating QC entry:', error)
      return NextResponse.json({ error: 'Failed to create QC entry' }, { status: 500 })
    }

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error('Error creating QC entry:', error)
    return NextResponse.json({ error: 'Failed to create QC entry' }, { status: 500 })
  }
}
