import { type NextRequest, NextResponse } from 'next/server'
import { uploadSiteImage } from '@/lib/site-storage'
import { verifyAdminPassword } from '@/lib/team-data'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'])

function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension ? IMAGE_EXTENSIONS.has(extension) : false
}

function contentTypeFor(file: File, extension: string) {
  if (file.type.startsWith('image/')) return file.type
  switch (extension) {
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'heic': return 'image/heic'
    case 'heif': return 'image/heif'
    case 'avif': return 'image/avif'
    default: return 'image/jpeg'
  }
}

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

    if (!isImageFile(file)) {
      return NextResponse.json(
        { ok: false, error: 'File must be an image (JPG, PNG, WEBP, HEIC, etc.)' },
        { status: 400 },
      )
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const bytes = Buffer.from(await file.arrayBuffer())
    const storagePath = `team-photos/${memberId}-${Date.now()}.${extension}`
    const url = await uploadSiteImage(storagePath, bytes, contentTypeFor(file, extension))

    return NextResponse.json({ ok: true, url })
  } catch (error) {
    console.error('Team upload error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
