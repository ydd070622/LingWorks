/**
 * Session persistence via Dexie (IndexedDB).
 * Used by AgentPanel to restore conversations across app restarts.
 */
import Dexie, { type Table } from 'dexie'
import type { AgentMessage } from '../types'

interface SessionRow {
  id: string
  title: string
  modelId: string | null
  messages: AgentMessage[]
  updatedAt: number
}

class SessionDB extends Dexie {
  sessions!: Table<SessionRow, string>

  constructor() {
    super('LingWorksSessions')
    this.version(1).stores({
      sessions: 'id, updatedAt',
    })
  }
}

const db = new SessionDB()

export async function loadSessions(): Promise<SessionRow[]> {
  try {
    return await db.sessions.orderBy('updatedAt').reverse().toArray()
  } catch {
    return []
  }
}

export async function saveSessions(sessions: SessionRow[]): Promise<void> {
  try {
    await db.transaction('rw', db.sessions, async () => {
      await db.sessions.clear()
      await db.sessions.bulkPut(sessions)
    })
  } catch { /* ignore */ }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await db.sessions.delete(id)
  } catch { /* ignore */ }
}
