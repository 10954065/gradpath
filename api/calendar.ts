/**
 * GET /api/calendar?token=…  → text/calendar   (Vercel Function, Node.js runtime)
 *
 * The private calendar subscription that calendar apps poll: a student's official lectures, planner blocks and
 * examinations. The 64-character token is the only credential; the database function calendar_feed() returns the
 * calendar of the student it belongs to, or null. Uses only the public URL and anon key.
 */
import { buildCalendar, type CalendarFeed } from '../src/lib/ics.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const TOKEN = /^[0-9a-f]{64}$/

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!TOKEN.test(token)) return text(404, 'Calendar not found')
  if (!SUPABASE_URL || !ANON_KEY) return text(503, 'Calendar unavailable')

  let feed: CalendarFeed | null
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_feed`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    })
    if (!response.ok) return text(502, 'Calendar unavailable')
    feed = (await response.json()) as CalendarFeed | null
  } catch {
    return text(502, 'Calendar unavailable')
  }
  if (!feed) return text(404, 'Calendar not found')

  return new Response(buildCalendar(feed), {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="gradpath.ics"',
      'cache-control': 'private, no-store',
    },
  })
}
