import { head, put } from '@vercel/blob'
import { createAdminClient, siteStorageBucket } from '@/lib/supabase/admin'

const TEAM_JSON_PATH = 'team-json/team.json'

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim()
  return token || null
}

function storageError(error: unknown) {
  return error instanceof Error ? error.message : 'Storage request failed'
}

export async function readSiteJson<T>(blobPath: string, fileFallback: () => T): Promise<T> {
  const supabase = createAdminClient()
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.from(siteStorageBucket()).download(blobPath)
      if (!error && data) {
        return JSON.parse(await data.text()) as T
      }
    } catch {
      // Try the next backend.
    }
  }

  const token = blobToken()
  if (token) {
    try {
      const metadata = await head(blobPath, { token })
      if (metadata?.url) {
        const response = await fetch(metadata.url, { cache: 'no-store' })
        if (response.ok) {
          return (await response.json()) as T
        }
      }
    } catch {
      // Fall back to committed file data.
    }
  }

  return fileFallback()
}

export async function writeSiteJson<T>(blobPath: string, value: T, fileFallback: (value: T) => void): Promise<void> {
  const json = JSON.stringify(value, null, 2)
  const errors: string[] = []

  const supabase = createAdminClient()
  if (supabase) {
    try {
      const { error } = await supabase.storage.from(siteStorageBucket()).upload(blobPath, json, {
        contentType: 'application/json',
        upsert: true,
      })
      if (!error) return
      errors.push(`Supabase: ${error.message}`)
    } catch (error) {
      errors.push(`Supabase: ${storageError(error)}`)
    }
  }

  const token = blobToken()
  if (token) {
    try {
      await put(blobPath, json, {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
        token,
      })
      return
    } catch (error) {
      errors.push(`Blob: ${storageError(error)}`)
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    fileFallback(value)
    return
  }

  throw new Error(
    errors.length > 0
      ? errors.join(' ')
      : 'No storage backend configured. Add SUPABASE_SERVICE_ROLE_KEY or a Vercel Blob store.',
  )
}

export async function uploadSiteImage(
  storagePath: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const errors: string[] = []

  const supabase = createAdminClient()
  if (supabase) {
    try {
      const bucket = siteStorageBucket()
      const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
        contentType,
        upsert: true,
      })
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath)
        return data.publicUrl
      }
      errors.push(`Supabase: ${error.message}`)
    } catch (error) {
      errors.push(`Supabase: ${storageError(error)}`)
    }
  }

  const token = blobToken()
  if (token) {
    try {
      const blob = await put(storagePath, bytes, {
        access: 'public',
        contentType,
        token,
      })
      return blob.url
    } catch (error) {
      errors.push(`Blob: ${storageError(error)}`)
    }
  }

  throw new Error(
    errors.length > 0
      ? errors.join(' ')
      : 'No storage backend configured. Add SUPABASE_SERVICE_ROLE_KEY or a Vercel Blob store.',
  )
}

export { TEAM_JSON_PATH }
