/**
 * Daily keep-alive, called by the Vercel cron in vercel.json. Supabase pauses free projects after about a week
 * without database activity, which would take the site down over a semester break. One tiny query with the
 * public key (row-level security returns no rows to it) counts as activity. If CRON_SECRET is set, only Vercel's
 * cron, which sends it as a bearer token, may call this.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const TIMEOUT_MS = 10_000

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json(401, { ok: false })
  if (!SUPABASE_URL || !ANON_KEY) return json(500, { ok: false, error: 'Supabase is not configured' })

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/courses?select=id&limit=1`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return json(response.ok ? 200 : 502, { ok: response.ok, status: response.status })
  } catch {
    return json(502, { ok: false, error: 'Supabase did not respond' })
  }
}
