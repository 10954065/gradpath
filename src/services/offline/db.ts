import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Offline storage is namespaced per signed-in student (`gradpath-<userId>`) and deleted on sign-out,
 * so private data never leaks to the next person using a shared device.
 */

export type OutboxOp = 'upsert' | 'delete'

export interface OutboxEntry {
  /** Stable id `${table}:${rowId}` so repeated offline edits to one row collapse into one entry. */
  key: string
  table: string
  op: OutboxOp
  rowId: string
  /** Primary-key columns identifying the row on the server, e.g. { id } or { user_id, lesson_id }. */
  match: Record<string, string>
  payload: Record<string, unknown> | null
  /** Server `updated_at` the local edit was based on (null for new rows). Used for conflict detection. */
  baseUpdatedAt: string | null
  onConflict?: string
  queuedAt: string
  attempts: number
  lastError?: string
}

export interface ConflictEntry {
  key: string
  table: string
  rowId: string
  local: Record<string, unknown>
  server: Record<string, unknown> | null
  detectedAt: string
}

interface CachedValue {
  key: string
  value: unknown
  savedAt: string
}

interface GradPathDB extends DBSchema {
  kv: { key: string; value: CachedValue }
  outbox: { key: string; value: OutboxEntry; indexes: { byQueuedAt: string } }
  conflicts: { key: string; value: ConflictEntry }
}

const DB_VERSION = 1
const connections = new Map<string, Promise<IDBPDatabase<GradPathDB>>>()

function dbName(userId: string): string {
  return `gradpath-${userId}`
}

export function openUserDb(userId: string): Promise<IDBPDatabase<GradPathDB>> {
  let existing = connections.get(userId)
  if (!existing) {
    existing = openDB<GradPathDB>(dbName(userId), DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('kv', { keyPath: 'key' })
        const outbox = db.createObjectStore('outbox', { keyPath: 'key' })
        outbox.createIndex('byQueuedAt', 'queuedAt')
        db.createObjectStore('conflicts', { keyPath: 'key' })
      },
    })
    connections.set(userId, existing)
  }
  return existing
}

export async function cacheSet(userId: string, key: string, value: unknown): Promise<void> {
  const db = await openUserDb(userId)
  await db.put('kv', { key, value, savedAt: new Date().toISOString() })
}

export async function cacheGet<T>(userId: string, key: string): Promise<{ value: T; savedAt: string } | null> {
  const db = await openUserDb(userId)
  const entry = await db.get('kv', key)
  return entry ? { value: entry.value as T, savedAt: entry.savedAt } : null
}

export async function cacheKeys(userId: string, prefix: string): Promise<string[]> {
  const db = await openUserDb(userId)
  const keys = await db.getAllKeys('kv')
  return keys.filter((k) => k.startsWith(prefix))
}

export async function outboxPut(userId: string, entry: Omit<OutboxEntry, 'key' | 'queuedAt' | 'attempts'>): Promise<void> {
  const db = await openUserDb(userId)
  const key = `${entry.table}:${entry.rowId}`
  const previous = await db.get('outbox', key)
  // Merge successive edits to the same row; keep the original base version for conflict detection.
  const merged: OutboxEntry = {
    ...entry,
    key,
    payload: entry.op === 'delete' ? null : { ...(previous?.payload ?? {}), ...(entry.payload ?? {}) },
    baseUpdatedAt: previous ? previous.baseUpdatedAt : entry.baseUpdatedAt,
    queuedAt: previous?.queuedAt ?? new Date().toISOString(),
    attempts: 0,
  }
  await db.put('outbox', merged)
}

export async function outboxAll(userId: string): Promise<OutboxEntry[]> {
  const db = await openUserDb(userId)
  return db.getAllFromIndex('outbox', 'byQueuedAt')
}

export async function outboxRemove(userId: string, key: string): Promise<void> {
  const db = await openUserDb(userId)
  await db.delete('outbox', key)
}

export async function outboxUpdate(userId: string, entry: OutboxEntry): Promise<void> {
  const db = await openUserDb(userId)
  await db.put('outbox', entry)
}

export async function conflictPut(userId: string, conflict: ConflictEntry): Promise<void> {
  const db = await openUserDb(userId)
  await db.put('conflicts', conflict)
}

export async function conflictsAll(userId: string): Promise<ConflictEntry[]> {
  const db = await openUserDb(userId)
  return db.getAll('conflicts')
}

export async function conflictRemove(userId: string, key: string): Promise<void> {
  const db = await openUserDb(userId)
  await db.delete('conflicts', key)
}

export async function clearUserOfflineData(userId: string): Promise<void> {
  const pending = connections.get(userId)
  connections.delete(userId)
  if (pending) (await pending).close()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName(userId))
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}
