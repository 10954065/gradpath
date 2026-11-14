import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, serviceClient, type TestUser } from './helpers'

/** Streak reminders: who gets one, that it is not duplicated, and that push subscriptions stay private. */

let fading: TestUser
let studiedToday: TestUser
let other: TestUser
let lessonIds: string[]

const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

function subscriptionKeys() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url')
  return { p256dh, auth: randomBytes(16).toString('base64url') }
}

const fcmEndpoint = () => `https://fcm.googleapis.com/fcm/send/gradpath-test-${randomBytes(8).toString('hex')}`

beforeAll(async () => {
  fading = await createStudent('reminder-fading')
  studiedToday = await createStudent('reminder-today')
  other = await createStudent('reminder-other')
  const admin = serviceClient()
  const { data } = await admin.from('lessons').select('id').limit(3)
  if (!data || data.length < 3) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
  lessonIds = data.map((l) => l.id as string)
  const rows = [
    { user_id: fading.id, day: day(-3), lesson_id: lessonIds[0] },
    { user_id: fading.id, day: day(-2), lesson_id: lessonIds[0] },
    { user_id: fading.id, day: day(-1), lesson_id: lessonIds[1] },
    { user_id: studiedToday.id, day: day(-1), lesson_id: lessonIds[0] },
    { user_id: studiedToday.id, day: day(0), lesson_id: lessonIds[2] },
  ]
  const { error } = await admin.from('lesson_days').insert(rows)
  if (error) throw error
})

afterAll(async () => {
  await deleteUser(fading)
  await deleteUser(studiedToday)
  await deleteUser(other)
})

const remindersOf = async (user: TestUser) => {
  const { data } = await user.client.from('notifications').select('title, body, link').eq('title', 'Your flame is fading')
  return data ?? []
}

describe('streak reminders', () => {
  it('reminds only students whose flame is fading, with their streak length, once per day', async () => {
    const admin = serviceClient()
    const first = await admin.rpc('queue_streak_reminders')
    expect(first.error).toBeNull()
    await admin.rpc('queue_streak_reminders')

    const mine = await remindersOf(fading)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ body: 'Take a lesson before midnight to keep your 3 day streak alive.', link: '/dashboard' })
    expect(await remindersOf(studiedToday)).toEqual([])
    expect(await remindersOf(other)).toEqual([])
  })

  it('keeps the reminder machinery out of students’ reach', async () => {
    for (const [fn, args] of [
      ['queue_streak_reminders', {}],
      ['fading_streaks', { p_today: day(0) }],
      ['streak_push_targets', { p_today: day(0) }],
      ['streak_cron_secret_ok', { p_secret: 'guess' }],
    ] as const) {
      const { error } = await fading.client.rpc(fn, args)
      expect(error, fn).not.toBeNull()
    }
  })
})

describe('push subscriptions', () => {
  it('accepts only the browsers’ real push services', async () => {
    const keys = subscriptionKeys()
    for (const endpoint of ['https://evil.example.com/collect', 'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.io/x']) {
      const { error } = await fading.client.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
      expect(error?.message, endpoint).toContain('not supported')
    }
    const { error } = await fading.client.rpc('save_push_subscription', { p_endpoint: fcmEndpoint(), p_p256dh: keys.p256dh, p_auth: keys.auth })
    expect(error).toBeNull()
  })

  it('cannot be written directly, and stays private to its owner', async () => {
    const keys = subscriptionKeys()
    const direct = await fading.client.from('push_subscriptions').insert({ user_id: fading.id, endpoint: fcmEndpoint(), ...keys })
    expect(direct.error).not.toBeNull()

    expect(await other.client.from('push_subscriptions').select('id').then((r) => r.data)).toEqual([])
    const { data: deleted } = await other.client.from('push_subscriptions').delete().eq('user_id', fading.id).select()
    expect(deleted ?? []).toEqual([])
    expect((await fading.client.from('push_subscriptions').select('id')).data).toHaveLength(1)
  })

  it('hands a shared device to whoever subscribed on it last', async () => {
    const keys = subscriptionKeys()
    const endpoint = fcmEndpoint()
    await fading.client.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
    await other.client.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
    const owners = await serviceClient().from('push_subscriptions').select('user_id').eq('endpoint', endpoint)
    expect(owners.data).toEqual([{ user_id: other.id }])
  })

  it('lists a device for the push sender only when its owner allows browser notifications', async () => {
    const admin = serviceClient()
    const targets = async () => ((await admin.rpc('streak_push_targets', { p_today: day(0) })).data ?? []) as { streak: number }[]
    await admin.from('student_preferences').upsert({ user_id: fading.id, browser_notifications: false })
    expect(await targets()).toEqual([])
    await admin.from('student_preferences').upsert({ user_id: fading.id, browser_notifications: true })
    const list = await targets()
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((t) => t.streak === 3)).toBe(true)
  })
})
