import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { head, put } from '@vercel/blob'

export type TeamMember = {
  id: string
  name: string
  title: string
  department: string
  image: string
}

const TEAM_BLOB_PATH = 'admin/team.json'

function teamFilePath() {
  return join(process.cwd(), 'app', 'team', 'team.json')
}

function readTeamFromFile(): TeamMember[] {
  const data = readFileSync(teamFilePath(), 'utf-8')
  return JSON.parse(data) as TeamMember[]
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const metadata = await head(TEAM_BLOB_PATH)
      if (metadata?.url) {
        const response = await fetch(metadata.url, { cache: 'no-store' })
        if (response.ok) {
          return (await response.json()) as TeamMember[]
        }
      }
    } catch {
      // Fall back to the committed team.json when blob is empty or unavailable.
    }
  }

  return readTeamFromFile()
}

export async function saveTeamMembers(members: TeamMember[]): Promise<void> {
  const json = JSON.stringify(members, null, 2)

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(TEAM_BLOB_PATH, json, {
      access: 'public',
      contentType: 'application/json',
      allowOverwrite: true,
    })
    return
  }

  writeFileSync(teamFilePath(), json)
}

export function verifyAdminPassword(password: string) {
  const adminPassword = process.env.SHOP_ADMIN_PASSWORD || 'norp2026'
  return password === adminPassword
}
