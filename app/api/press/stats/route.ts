import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { monday, sunday } = getWeekBounds()

    // This week's entries
    const { data: weekEntries, error: weekErr } = await supabase
      .from('press_log')
      .select('shift, operator_name, records_pressed')
      .gte('created_at', monday.toISOString())
      .lte('created_at', sunday.toISOString())
      .not('records_pressed', 'is', null)

    if (weekErr) throw weekErr

    // All-time entries for individual leaderboard
    const { data: allEntries, error: allErr } = await supabase
      .from('press_log')
      .select('operator_name, records_pressed')
      .not('records_pressed', 'is', null)

    if (allErr) throw allErr

    // Day vs Night this week
    const dayTotal = (weekEntries ?? [])
      .filter(e => e.shift === 'day')
      .reduce((s, e) => s + (e.records_pressed ?? 0), 0)

    const nightTotal = (weekEntries ?? [])
      .filter(e => e.shift === 'night')
      .reduce((s, e) => s + (e.records_pressed ?? 0), 0)

    // Individual leaderboard (all-time)
    const operatorTotals: Record<string, number> = {}
    for (const e of allEntries ?? []) {
      if (!e.operator_name) continue
      operatorTotals[e.operator_name] = (operatorTotals[e.operator_name] ?? 0) + (e.records_pressed ?? 0)
    }
    const leaderboard = Object.entries(operatorTotals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({
      ok: true,
      weekOf: monday.toISOString().split('T')[0],
      dayTotal,
      nightTotal,
      leader: dayTotal > nightTotal ? 'day' : nightTotal > dayTotal ? 'night' : 'tied',
      leaderboard,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
