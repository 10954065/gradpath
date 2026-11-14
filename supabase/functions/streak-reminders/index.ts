// Sends "your flame is fading" Web Push notifications. Called once a day by pg_cron through
// public.queue_streak_reminders(), which first creates the in-app reminders. Deployed with verify_jwt = false:
// the caller proves itself with the shared secret that lives only in the database's Vault.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

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

  const body = (await req.json().catch(() => ({}))) as { day?: unknown }
  const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : accraToday()
  const { data, error } = await admin.rpc('streak_push_targets', { p_today: day })
  if (error) return json(500, { error: 'Could not load reminder targets' })

  let sent = 0
  let removed = 0
  let failed = 0
  for (const target of (data ?? []) as Target[]) {
    if (!PUSH_SERVICE.test(target.endpoint)) continue
    const payload = JSON.stringify({
      title: 'Your flame is fading',
      body: `Take a lesson before midnight to keep your ${target.streak} day streak alive.`,
      url: '/dashboard',
      tag: `streak-${day}`,
    })
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
  return json(200, { day, targets: (data ?? []).length, sent, removed, failed })
})
