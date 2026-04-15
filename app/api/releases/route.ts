import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Fetch all releases (public)
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: releases, error } = await supabase
      .from('releases')
      .select('*')
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching releases:', error)
      // Return empty array so fallback releases are used
      return NextResponse.json({ releases: [] })
    }

    return NextResponse.json({ releases: releases || [] })
  } catch (error) {
    console.error('Error:', error)
    // Return empty array so fallback releases are used
    return NextResponse.json({ releases: [] })
  }
}

// POST - Create a new release (admin only)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { artist, album, image_url, link } = body

    if (!artist || !album || !image_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get the highest display_order
    const { data: maxOrderData } = await supabase
      .from('releases')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const newOrder = (maxOrderData?.display_order ?? -1) + 1

    const { data: release, error } = await supabase
      .from('releases')
      .insert({
        artist,
        album,
        image_url,
        link: link || null,
        display_order: newOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating release:', error)
      return NextResponse.json({ error: 'Failed to create release' }, { status: 500 })
    }

    return NextResponse.json({ release })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to create release' }, { status: 500 })
  }
}

// DELETE - Delete a release (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing release ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('releases')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting release:', error)
      return NextResponse.json({ error: 'Failed to delete release' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to delete release' }, { status: 500 })
  }
}

// PATCH - Update release order (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { releases } = body

    if (!releases || !Array.isArray(releases)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    // Update each release's display_order
    for (let i = 0; i < releases.length; i++) {
      const { error } = await supabase
        .from('releases')
        .update({ display_order: i })
        .eq('id', releases[i].id)

      if (error) {
        console.error('Error updating order:', error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
