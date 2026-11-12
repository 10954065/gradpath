/**
 * POST /api/verify-link  { url }  → { status, httpStatus }
 *
 * Server-side link check for administrators (browsers cannot read cross-origin status codes).
 * - Requires a valid Supabase session token whose user is an administrator (checked with is_admin()).
 * - Only http(s) URLs to public addresses are fetched (blocks SSRF to private/internal networks).
 * - Simple per-instance rate limit.
 * Uses only the public URL and anon key; no privileged credentials are needed.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30
const hits = new Map<string, number[]>()

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase()
    return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80') || a.startsWith('::ffff:')
  }
  const [a = 0, b = 0] = address.split('.').map(Number)
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

async function isAdmin(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !ANON_KEY) return false
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  })
  return res.ok && (await res.json()) === true
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Sign in required' })

  const now = Date.now()
  const recent = (hits.get(token) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) return json(429, { error: 'Too many checks; try again in a minute' })
  hits.set(token, [...recent, now])

  if (!(await isAdmin(token))) return json(403, { error: 'Administrators only' })

  let target: URL
  try {
    const body = (await request.json()) as { url?: unknown }
    target = new URL(String(body.url ?? ''))
  } catch {
    return json(400, { error: 'Provide a valid URL' })
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return json(400, { error: 'Only http(s) URLs can be checked' })

  try {
    const { address } = await lookup(target.hostname)
    if (isPrivateAddress(address)) return json(400, { error: 'This address cannot be checked' })
  } catch {
    return json(200, { status: 'unreachable' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    let res = await fetch(target, { method: 'HEAD', redirect: 'manual', signal: controller.signal }).catch(() => null)
    if (!res || res.status >= 400) res = await fetch(target, { method: 'GET', redirect: 'manual', signal: controller.signal })
    await res.body?.cancel().catch(() => undefined)
    const blocked = res.status === 401 || res.status === 403 || res.status === 429
    return json(200, { status: res.status < 400 ? 'verified' : blocked ? 'unverified' : 'unreachable', httpStatus: res.status })
  } catch {
    return json(200, { status: 'unreachable' })
  } finally {
    clearTimeout(timer)
  }
}
