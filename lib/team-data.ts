import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readSiteJson, TEAM_JSON_PATH, writeSiteJson } from '@/lib/site-storage'

export type TeamMember = {
  id: string
  name: string
  title: string
  department: string
  image: string
}

function teamFilePath() {
  return join(process.cwd(), 'app', 'team', 'team.json')
}

function readTeamFromFile(): TeamMember[] {
  const data = readFileSync(teamFilePath(), 'utf-8')
  return JSON.parse(data) as TeamMember[]
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  return readSiteJson(TEAM_JSON_PATH, readTeamFromFile)
}

export async function saveTeamMembers(members: TeamMember[]): Promise<void> {
  await writeSiteJson(TEAM_JSON_PATH, members, (value) => {
    writeFileSync(teamFilePath(), JSON.stringify(value, null, 2))
  })
}

export function verifyAdminPassword(password: string) {
  const adminPassword = process.env.SHOP_ADMIN_PASSWORD || 'norp2026'
  return password === adminPassword
}
