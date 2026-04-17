import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const filePath = () => join(process.cwd(), 'app', 'admin', 'inventory.json')

export async function GET() {
  try {
    const data = readFileSync(filePath(), 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch {
    return NextResponse.json({ error: 'Failed to read inventory' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { inventory, password } = await req.json()
    const adminPassword = process.env.SHOP_ADMIN_PASSWORD || 'norp2026'
    if (password !== adminPassword) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    writeFileSync(filePath(), JSON.stringify(inventory, null, 2))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Save inventory error:', err)
    return NextResponse.json({ ok: false, error: 'Save failed' }, { status: 500 })
  }
}
