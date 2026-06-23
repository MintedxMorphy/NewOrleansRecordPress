import { NextRequest, NextResponse } from 'next/server'
import { getTeamMembers, saveTeamMembers, verifyAdminPassword } from '@/lib/team-data'

export async function GET() {
  try {
    const members = await getTeamMembers()
    return NextResponse.json(members)
  } catch (error) {
    console.error('Read team error:', error)
    return NextResponse.json([], { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { members, password } = await req.json()
    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    await saveTeamMembers(members)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Save team error:', err)
    const message = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
