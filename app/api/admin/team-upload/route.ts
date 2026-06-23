import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyAdminPassword } from '@/lib/team-data'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const password = String(formData.get('password') || '')
    const memberId = String(formData.get('memberId') || '').trim()
    const file = formData.get('file')

    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!memberId) {
      return NextResponse.json({ ok: false, error: 'Member ID is required' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'File must be an image' }, { status: 400 })
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { ok: false, error: 'Image uploads require BLOB_READ_WRITE_TOKEN on the server' },
        { status: 503 },
      )
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const blob = await put(`team/${memberId}-${Date.now()}.${extension}`, file, {
      access: 'public',
    })

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (error) {
    console.error('Team upload error:', error)
    return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 })
  }
}
