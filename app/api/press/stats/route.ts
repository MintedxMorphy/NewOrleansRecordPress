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

function getDayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function getMonthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { monday, sunday } = getWeekBounds()
    const day = getDayBounds()
    const month = getMonthBounds()

    const { data: periodEntries, error: periodErr } = await supabase
      .from('press_log')
      .select('operator_name, records_pressed, created_at')
      .gte('created_at', month.start.toISOString())
      .lte('created_at', month.end.toISOString())
      .not('records_pressed', 'is', null)

    if (periodErr) throw periodErr

    const { data: allEntries, error: allErr } = await supabase
      .from('press_log')
      .select('operator_name, records_pressed')
      .not('records_pressed', 'is', null)

    if (allErr) throw allErr

    const entries = periodEntries ?? []
    const todayTotal = entries
      .filter(e => {
        const created = new Date(e.created_at)
        return created >= day.start && created <= day.end
      })
      .reduce((s, e) => s + (e.records_pressed ?? 0), 0)
    const weekTotal = entries
      .filter(e => {
        const created = new Date(e.created_at)
        return created >= monday && created <= sunday
      })
      .reduce((s, e) => s + (e.records_pressed ?? 0), 0)
    const monthTotal = entries.reduce((s, e) => s + (e.records_pressed ?? 0), 0)

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
      todayTotal,
      weekTotal,
      monthTotal,
      leaderboard,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
