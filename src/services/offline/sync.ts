import { isOfflineError, toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import {
  conflictPut,
  conflictsAll,
  outboxAll,
  outboxPut,
  outboxRemove,
  outboxUpdate,
  type OutboxEntry,
} from './db'

/**
 * Offline-first writes for private records.
 *
 * Every write carries a client-generated primary key, so replaying it is an idempotent upsert and can
 * never create duplicates. Updates remember the server `updated_at` they were based on; if the server
 * copy changed in the meantime, the server version wins and the local edit is kept in a conflict list
 * for the student to review (see Settings → Offline & sync).
 */

export const SYNCABLE_TABLES = [
  'student_notes',
  'study_sessions',
  'assignments',
  'timetable_events',
  'lesson_progress',
  'bookmarks',
  'revision_items',
  'revision_reviews',
  'flashcards',
] as const
export type SyncableTable = (typeof SYNCABLE_TABLES)[number]

const MAX_ATTEMPTS = 5

// --- status store ---------------------------------------------------------------------------------
export interface SyncStatus {
  pending: number
  conflicts: number
  syncing: boolean
  lastSyncedAt: string | null
  lastError: string | null
}

let status: SyncStatus = { pending: 0, conflicts: 0, syncing: false, lastSyncedAt: null, lastError: null }
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncStatus(): SyncStatus {
  return status
}

export async function refreshSyncCounts(userId: string): Promise<void> {
  const [pending, conflicts] = await Promise.all([outboxAll(userId), conflictsAll(userId)])
  setStatus({ pending: pending.length, conflicts: conflicts.length })
}

// --- writes ---------------------------------------------------------------------------------------
export interface OfflineWrite {
  table: SyncableTable
  op: 'upsert' | 'delete'
  match: Record<string, string>
  payload?: Record<string, unknown>
  baseUpdatedAt?: string | null
  onConflict?: string
}

function rowIdOf(match: Record<string, string>): string {
  return Object.keys(match)
    .sort()
    .map((k) => match[k])
    .join('|')
}

async function applyRemote(write: OfflineWrite): Promise<void> {
  if (write.op === 'delete') {
    const { error } = await supabase.from(write.table).delete().match(write.match)
    if (error) throw error
    return
  }
  const row = { ...write.payload, ...write.match }
  const { error } = await supabase
    .from(write.table)
    .upsert(row, { onConflict: write.onConflict ?? Object.keys(write.match).join(',') })
  if (error) throw error
}

/**
 * Perform a write now when online, or queue it for later. Resolves with `queued: true` when the change
 * is waiting for connectivity. Non-network errors (validation, permissions) are rethrown.
 */
export async function writeOrQueue(userId: string, write: OfflineWrite): Promise<{ queued: boolean }> {
  if (navigator.onLine) {
    try {
      await applyRemote(write)
      return { queued: false }
    } catch (error) {
      if (!isOfflineError(error)) throw error
    }
  }
  await outboxPut(userId, {
    table: write.table,
    op: write.op,
    rowId: rowIdOf(write.match),
    match: write.match,
    payload: write.payload ?? null,
    baseUpdatedAt: write.baseUpdatedAt ?? null,
    ...(write.onConflict ? { onConflict: write.onConflict } : {}),
  })
  await refreshSyncCounts(userId)
  return { queued: true }
}

async function serverVersion(entry: OutboxEntry): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from(entry.table).select('*').match(entry.match).maybeSingle()
  if (error) throw error
  return (data as Record<string, unknown> | null) ?? null
}

let flushing: Promise<void> | null = null

/** Replay queued writes in order. Safe to call repeatedly; concurrent calls share one run. */
export function flushOutbox(userId: string): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    const entries = await outboxAll(userId)
    if (entries.length === 0) {
      setStatus({ pending: 0 })
      return
    }
    setStatus({ syncing: true, lastError: null })
    try {
      for (const entry of entries) {
        try {
          if (entry.op === 'upsert' && entry.baseUpdatedAt) {
            const server = await serverVersion(entry)
            const serverUpdated = typeof server?.updated_at === 'string' ? server.updated_at : null
            if (serverUpdated && new Date(serverUpdated) > new Date(entry.baseUpdatedAt)) {
              await conflictPut(userId, {
                key: entry.key,
                table: entry.table,
                rowId: entry.rowId,
                local: { ...entry.payload, ...entry.match },
                server,
                detectedAt: new Date().toISOString(),
              })
              await outboxRemove(userId, entry.key)
              continue
            }
          }
          await applyRemote({
            table: entry.table as SyncableTable,
            op: entry.op,
            match: entry.match,
            ...(entry.payload ? { payload: entry.payload } : {}),
            ...(entry.onConflict ? { onConflict: entry.onConflict } : {}),
          })
          await outboxRemove(userId, entry.key)
        } catch (error) {
          if (isOfflineError(error)) throw error
          const attempts = entry.attempts + 1
          if (attempts >= MAX_ATTEMPTS) {
            // Permanently rejected (e.g. validation): keep it visible as a conflict rather than dropping it.
            await conflictPut(userId, {
              key: entry.key,
              table: entry.table,
              rowId: entry.rowId,
              local: { ...entry.payload, ...entry.match, _error: toUserMessage(error) },
              server: null,
              detectedAt: new Date().toISOString(),
            })
            await outboxRemove(userId, entry.key)
          } else {
            await outboxUpdate(userId, { ...entry, attempts, lastError: toUserMessage(error) })
          }
        }
      }
      setStatus({ lastSyncedAt: new Date().toISOString() })
    } catch (error) {
      setStatus({ lastError: toUserMessage(error) })
    } finally {
      setStatus({ syncing: false })
      await refreshSyncCounts(userId)
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}
