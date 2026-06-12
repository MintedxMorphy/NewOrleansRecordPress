import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OPTIONS_ID = 3

const DEFAULT_OPTIONS = {
  workers: ['Sarah', 'August', 'Mun', 'Jen', 'Anker'],
  operators: ['Blake', 'Stormy', 'John', 'Sarah'],
}

type OptionsBody = {
  workers?: unknown
  operators?: unknown
}

function cleanNames(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const names = value
    .map(name => String(name || '').trim())
    .filter(Boolean)
  return [...new Set(names)]
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('qc_sticky')
      .select('message')
      .eq('id', OPTIONS_ID)
      .maybeSingle()

    if (error) {
      console.error('Error fetching QC options:', error)
      return NextResponse.json({ options: DEFAULT_OPTIONS })
    }

    if (!data?.message) return NextResponse.json({ options: DEFAULT_OPTIONS })

    const parsed = JSON.parse(data.message) as OptionsBody
    return NextResponse.json({
      options: {
        workers: cleanNames(parsed.workers, DEFAULT_OPTIONS.workers),
        operators: cleanNames(parsed.operators, DEFAULT_OPTIONS.operators),
      },
    })
  } catch (error) {
    console.error('Error fetching QC options:', error)
    return NextResponse.json({ options: DEFAULT_OPTIONS })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OptionsBody
    const options = {
      workers: cleanNames(body.workers, DEFAULT_OPTIONS.workers),
      operators: cleanNames(body.operators, DEFAULT_OPTIONS.operators),
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('qc_sticky')
      .upsert({
        id: OPTIONS_ID,
        message: JSON.stringify(options),
        updated_by: 'NORP staff',
        updated_at: new Date().toISOString(),
      })
      .select('message')
      .single()

    if (error) {
      console.error('Error saving QC options:', error)
      return NextResponse.json({ error: 'Failed to save options' }, { status: 500 })
    }

    return NextResponse.json({ options: data?.message ? JSON.parse(data.message) : options })
  } catch (error) {
    console.error('Error saving QC options:', error)
    return NextResponse.json({ error: 'Failed to save options' }, { status: 500 })
  }
}
