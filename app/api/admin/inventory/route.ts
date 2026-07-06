import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { appendRow, findRow, updateRow } from '@/lib/sheets'

const filePath = () => join(process.cwd(), 'app', 'admin', 'inventory.json')
const CACHE_KEY = 'shop_admin_inventory'

function readBundledInventory() {
  const data = readFileSync(filePath(), 'utf-8')
  return JSON.parse(data)
}

async function readSavedInventory() {
  const cached = await findRow('qbo_cache', 'key', CACHE_KEY)
  const raw = cached?.row.value
  if (!raw) return null
  return JSON.parse(raw)
}

async function saveInventory(inventory: unknown) {
  if (!inventory || typeof inventory !== 'object') {
    throw new Error('Inventory payload is required')
  }

  const row = {
    key: CACHE_KEY,
    value: JSON.stringify(inventory),
    updated_at: new Date().toISOString(),
  }

  const existing = await findRow('qbo_cache', 'key', CACHE_KEY)
  if (existing) await updateRow('qbo_cache', existing.rowIndex, row)
  else await appendRow('qbo_cache', row)
}

export async function GET() {
  try {
    return NextResponse.json(await readSavedInventory() ?? readBundledInventory())
  } catch (err) {
    console.error('Read inventory error:', err)
    try {
      return NextResponse.json({
        ...readBundledInventory(),
        warning: err instanceof Error ? err.message : 'Failed to read saved inventory',
      })
    } catch {
      return NextResponse.json({ error: 'Failed to read inventory' }, { status: 500 })
    }
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { inventory, password } = await req.json()
    const adminPassword = process.env.SHOP_ADMIN_PASSWORD || 'norp2026'
    if (password !== adminPassword) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    await saveInventory(inventory)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Save inventory error:', err)
    const message = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
