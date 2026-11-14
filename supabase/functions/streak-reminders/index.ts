// Sends GradPath Web Push notifications:
//  - "your flame is fading", once a day from public.queue_streak_reminders() (body: { day });
//  - lecture reminders and official timetable changes, from public.queue_lecture_reminders() and
//    public.publish_timetable_changes() (body: { kind: 'timetable', since }).
// The database creates the in-app notifications first. Deployed with verify_jwt = false: the caller proves itself
// with the shared secret that lives only in the database's Vault.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

interface TimetableTarget {
  subscription_id: string
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  link: string
  tag: string
}

interface Target {
  subscription_id: string
  endpoint: string
  p256dh: string
  auth: string
  streak: number
}

// Same rule as public.is_push_endpoint: only the browsers' real push services.
const PUSH_SERVICE = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//
const REMINDER_TTL_SECONDS = 6 * 60 * 60

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status })
}

function adminKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

function accraToday(): string {
  return new Date().toISOString().slice(0, 10) // Africa/Accra is UTC all year
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' })
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', adminKey(), { auth: { persistSession: false } })

  const { data: allowed } = await admin.rpc('streak_cron_secret_ok', { p_secret: req.headers.get('x-cron-secret') ?? '' })
  if (allowed !== true) return json(401, { error: 'Not allowed' })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return json(500, { error: 'Push keys are not configured' })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://gradpath-000-6c1c.vercel.app', publicKey, privateKey)

  const body = (await req.json().catch(() => ({}))) as { day?: unknown; kind?: unknown; since?: unknown }
  if (body.kind === 'timetable') {
    const since = typeof body.since === 'string' && !Number.isNaN(Date.parse(body.since)) ? body.since : new Date(Date.now() - 15 * 60_000).toISOString()
    const { data, error } = await admin.rpc('timetable_push_targets', { p_since: since })
    if (error) return json(500, { error: 'Could not load timetable targets' })
    const targets = (data ?? []) as TimetableTarget[]
    const result = await sendAll(
      admin,
      targets.map((t) => ({ target: t, payload: { title: t.title, body: t.body, url: t.link.startsWith('/') ? t.link : '/timetable/official', tag: t.tag } })),
    )
    return json(200, { kind: 'timetable', since, targets: targets.length, ...result })
  }

  const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : accraToday()
  const { data, error } = await admin.rpc('streak_push_targets', { p_today: day })
  if (error) return json(500, { error: 'Could not load reminder targets' })

  const result = await sendAll(
    admin,
    ((data ?? []) as Target[]).map((target) => ({
      target,
      payload: {
        title: 'Your flame is fading',
        body: `Take a lesson before midnight to keep your ${target.streak} day streak alive.`,
        url: '/dashboard',
        tag: `streak-${day}`,
      },
    })),
  )
  return json(200, { day, targets: (data ?? []).length, ...result })
})

type Admin = ReturnType<typeof createClient>
interface Device {
  subscription_id: string
  endpoint: string
  p256dh: string
  auth: string
}

async function sendAll(admin: Admin, jobs: { target: Device; payload: { title: string; body: string; url: string; tag: string } }[]) {
  let sent = 0
  let removed = 0
  let failed = 0
  for (const { target, payload: message } of jobs) {
    if (!PUSH_SERVICE.test(target.endpoint)) continue
    const payload = JSON.stringify(message)
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
        TTL: REMINDER_TTL_SECONDS,
      })
      sent += 1
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      // 404 and 410 mean the browser dropped the subscription; anything else may be temporary.
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', target.subscription_id)
        removed += 1
      } else {
        failed += 1
      }
    }
  }
  return { sent, removed, failed }
}
