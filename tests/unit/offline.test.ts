import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true, siteUrl: () => 'http://localhost' }))

const { cacheGet, cacheSet, clearUserOfflineData, conflictPut, conflictsAll, outboxAll, outboxPut } = await import('@/services/offline/db')
const { filterNotes } = await import('@/services/notes')

describe('offline outbox', () => {
  it('merges repeated edits to one row into a single queued entry (no duplicates on sync)', async () => {
    const user = 'user-merge'
    await outboxPut(user, { table: 'student_notes', op: 'upsert', rowId: 'n1', match: { id: 'n1' }, payload: { title: 'Draft' }, baseUpdatedAt: '2026-11-01T10:00:00Z' })
    await outboxPut(user, { table: 'student_notes', op: 'upsert', rowId: 'n1', match: { id: 'n1' }, payload: { body: 'More text' }, baseUpdatedAt: '2026-11-02T10:00:00Z' })
    const entries = await outboxAll(user)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.payload).toEqual({ title: 'Draft', body: 'More text' })
    // The original server version is kept so conflicts are detected against what the student first edited.
    expect(entries[0]?.baseUpdatedAt).toBe('2026-11-01T10:00:00Z')
  })

  it('a delete after an edit replaces the queued upsert', async () => {
    const user = 'user-delete'
    await outboxPut(user, { table: 'assignments', op: 'upsert', rowId: 'a1', match: { id: 'a1' }, payload: { title: 'Essay' }, baseUpdatedAt: null })
    await outboxPut(user, { table: 'assignments', op: 'delete', rowId: 'a1', match: { id: 'a1' }, payload: null, baseUpdatedAt: null })
    const entries = await outboxAll(user)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.op).toBe('delete')
    expect(entries[0]?.payload).toBeNull()
  })

  it('keeps each student\'s offline data separate and wipes it on sign-out', async () => {
    await cacheSet('student-a', 'notes', ['private A'])
    await cacheSet('student-b', 'notes', ['private B'])
    await conflictPut('student-a', { key: 'k', table: 'student_notes', rowId: 'n', local: {}, server: null, detectedAt: 'now' })

    expect((await cacheGet<string[]>('student-b', 'notes'))?.value).toEqual(['private B'])
    await clearUserOfflineData('student-a')
    expect(await cacheGet('student-a', 'notes')).toBeNull()
    expect(await conflictsAll('student-a')).toEqual([])
    expect((await cacheGet<string[]>('student-b', 'notes'))?.value).toEqual(['private B'])
  })
})

describe('note search', () => {
  const base = { user_id: 'u', course_id: null, module_id: null, lesson_id: null, is_pinned: false, created_at: '', updated_at: '' }
  const notes = [
    { ...base, id: '1', title: 'Hashing', body: 'Salted bcrypt', tags: ['crypto'] },
    { ...base, id: '2', title: 'Sampling', body: 'Stratified sampling notes', tags: ['research'] },
  ]
  it('matches title, body and tags case-insensitively', () => {
    expect(filterNotes(notes, 'BCRYPT').map((n) => n.id)).toEqual(['1'])
    expect(filterNotes(notes, 'research').map((n) => n.id)).toEqual(['2'])
    expect(filterNotes(notes, '  ')).toHaveLength(2)
  })
})

describe('offline-aware fetch for the Supabase client', () => {
  it('rejects immediately with an AbortError while the browser is offline, so client retries stop', async () => {
    const { offlineAwareFetch } = await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(offlineAwareFetch('http://localhost/rest/v1/lessons')).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchSpy).not.toHaveBeenCalled()
    onLine.mockRestore()
    fetchSpy.mockRestore()
  })

  it('passes requests through to fetch when online', async () => {
    const { offlineAwareFetch } = await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
    const res = await offlineAwareFetch('http://localhost/rest/v1/lessons')
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledOnce()
    fetchSpy.mockRestore()
  })
})
