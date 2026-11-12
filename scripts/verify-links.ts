/**
 * Check every external URL in the curriculum (resources, further reading, videos) and record the result in
 * content/link-verification.json. A link is "verified" only when it answers with a non-error HTTP status.
 *
 *   npm run content:verify-links
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadContent } from './content/loadContent'
import type { LinkStatus } from './content/writeSeed'

const CONCURRENCY = 8
const TIMEOUT_MS = 20_000
const USER_AGENT = 'Mozilla/5.0 (compatible; GradPathLinkCheck/1.0; +https://github.com/10954065/gradpath)'

function collectUrls(): string[] {
  const { courses } = loadContent()
  const urls = new Set<string>()
  for (const c of courses) {
    for (const r of c.resources) urls.add(r.url)
    for (const m of c.modules) {
      for (const l of m.lessons) {
        for (const f of l.parsed?.furtherReading ?? []) if (f.url) urls.add(f.url)
        for (const v of l.parsed?.videos ?? []) urls.add(v.url)
      }
    }
  }
  return [...urls].sort()
}

async function request(url: string, method: 'HEAD' | 'GET'): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8' },
    })
    if (method === 'GET') await res.body?.cancel().catch(() => undefined)
    return res.status
  } finally {
    clearTimeout(timer)
  }
}

async function check(url: string): Promise<LinkStatus> {
  const checkedAt = new Date().toISOString()
  try {
    let status = await request(url, 'HEAD').catch(() => 0)
    // Many servers reject HEAD; confirm with GET before judging.
    if (status === 0 || status >= 400) status = await request(url, 'GET')
    // 401/403/429 usually mean the site blocks automated checks, not that the page is gone.
    const blocked = status === 401 || status === 403 || status === 429
    return { status: status > 0 && status < 400 ? 'verified' : blocked ? 'unverified' : 'unreachable', checkedAt, httpStatus: status }
  } catch {
    return { status: 'unreachable', checkedAt }
  }
}

async function main(): Promise<void> {
  const urls = collectUrls()
  console.log(`Checking ${urls.length} URLs…`)
  const results: Record<string, LinkStatus> = {}
  let index = 0
  let done = 0
  const worker = async () => {
    while (index < urls.length) {
      const url = urls[index++] as string
      results[url] = await check(url)
      done += 1
      if (done % 50 === 0) console.log(`  ${done}/${urls.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  const sorted = Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(join(process.cwd(), 'content', 'link-verification.json'), `${JSON.stringify(sorted, null, 2)}\n`)
  const verified = Object.values(results).filter((r) => r.status === 'verified').length
  console.log(`Verified ${verified}/${urls.length}. Unreachable:`)
  for (const [url, r] of Object.entries(sorted)) if (r.status !== 'verified') console.log(`  ${r.httpStatus ?? 'ERR'}  ${url}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
