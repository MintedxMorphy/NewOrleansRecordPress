import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type StickyBody = {
  message?: string
  updated_by?: string
  target?: string
}

function targetToId(target?: string): number {
  return target === 'leadership' ? 2 : 1
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = targetToId(searchParams.get('target') ?? 'qc')

    const supabase = await createClient()
    const { data: sticky, error } = await supabase
      .from('qc_sticky')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching QC sticky:', error)
      return NextResponse.json({ error: 'Failed to fetch sticky note' }, { status: 500 })
    }

    return NextResponse.json({ sticky: sticky || null })
  } catch (error) {
    console.error('Error fetching QC sticky:', error)
    return NextResponse.json({ error: 'Failed to fetch sticky note' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StickyBody
    const message = body.message?.trim() || ''
    const updatedBy = body.updated_by?.trim() || 'NORP staff'
    const id = targetToId(body.target)

    const supabase = await createClient()
    const { data: sticky, error } = await supabase
      .from('qc_sticky')
      .upsert({
        id,
        message,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating QC sticky:', error)
      return NextResponse.json({ error: 'Failed to update sticky note' }, { status: 500 })
    }

    return NextResponse.json({ sticky })
  } catch (error) {
    console.error('Error updating QC sticky:', error)
    return NextResponse.json({ error: 'Failed to update sticky note' }, { status: 500 })
  }
}
