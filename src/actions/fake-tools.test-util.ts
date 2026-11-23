/**
 * In-memory stand-in for ActionTools, used by the action unit tests.
 * Mirrors the RBAC-off behavior the real tools have inside actions:
 * every collection is readable and writable, so the tests exercise the
 * actions' own authorization checks.
 */

import { RECORD_NOT_FOUND } from 'deepspace/worker'
import type { ActionResult, ActionTools } from 'deepspace/worker'

interface Row {
  recordId: string
  data: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

const UNIQUE: Record<string, string[]> = {
  team_members: ['teamId', 'userId'],
  votes: ['decisionId', 'userId'],
  decision_memos: ['decisionId'],
  memo_deliveries: ['decisionId', 'channel'],
}

export function createFakeTools(actingUserId: string, store = new Map<string, Map<string, Row>>()) {
  const table = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    return store.get(name)!
  }
  const matches = (row: Row, where?: Record<string, unknown>) =>
    !where || Object.entries(where).every(([k, v]) => (k === 'recordId' ? row.recordId : row.data[k]) === v)
  const okData = <T>(data: T) => ({ success: true, data }) as ActionResult<T>
  const err = (error: string) => ({ success: false, error }) as ActionResult<never>

  const tools: ActionTools = {
    async create(collection, data, recordId) {
      const id = recordId ?? `${collection}-${crypto.randomUUID()}`
      const rows = table(collection)
      if (rows.has(id)) return err('duplicate id')
      const unique = UNIQUE[collection]
      if (unique && [...rows.values()].some((r) => unique.every((k) => r.data[k] === data[k]))) {
        return err('unique constraint')
      }
      const now = new Date().toISOString()
      rows.set(id, { recordId: id, data: { ...data }, createdBy: actingUserId, createdAt: now, updatedAt: now })
      return okData({ recordId: id })
    },
    async update(collection, recordId, data) {
      const row = table(collection).get(recordId)
      if (!row) return err(RECORD_NOT_FOUND)
      row.data = { ...row.data, ...data }
      return okData({ recordId })
    },
    async remove(collection, recordId) {
      if (!table(collection).delete(recordId)) return err(RECORD_NOT_FOUND)
      return okData({ recordId })
    },
    async deleteWhere(collection, where) {
      let deleted = 0
      for (const [id, row] of table(collection)) {
        if (matches(row, where)) {
          table(collection).delete(id)
          deleted++
        }
      }
      return okData({ deleted })
    },
    async get(collection, recordId) {
      const row = table(collection).get(recordId)
      if (!row) return err(RECORD_NOT_FOUND)
      return okData({ record: structuredClone(row) } as never)
    },
    async query(collection, options) {
      const records = [...table(collection).values()]
        .filter((r) => matches(r, options?.where))
        .slice(0, options?.limit ?? 100)
        .map((r) => structuredClone(r))
      return okData({ records, count: records.length } as never)
    },
    async integration() {
      return err('not available in tests')
    },
    async registerUser() {
      return err('not available in tests')
    },
  }
  return { tools, store }
}

/** Seed a users row the way the RecordRoom does on first connection. */
export function seedUser(store: Map<string, Map<string, Row>>, userId: string, email: string, name = email) {
  if (!store.has('users')) store.set('users', new Map())
  const now = new Date().toISOString()
  store.get('users')!.set(userId, {
    recordId: userId,
    data: { email, name, role: 'member' },
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  })
}
