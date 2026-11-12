import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface LocalEnv {
  url: string
  anonKey: string
  serviceKey: string
}

let cached: LocalEnv | null = null

/**
 * Integration tests run against the local Supabase stack (`npx supabase start`).
 * Keys are read from the running stack at test time — never from the repository.
 */
export function localEnv(): LocalEnv {
  if (cached) return cached
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_SERVICE_KEY) {
    cached = {
      url: process.env.SUPABASE_TEST_URL,
      anonKey: process.env.SUPABASE_TEST_ANON_KEY,
      serviceKey: process.env.SUPABASE_TEST_SERVICE_KEY,
    }
    return cached
  }
  const raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
  const url = status.API_URL
  const anonKey = status.ANON_KEY
  const serviceKey = status.SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) throw new Error('Local Supabase is not running. Run `npx supabase start`.')
  cached = { url, anonKey, serviceKey }
  return cached
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

export function serviceClient(): SupabaseClient {
  const env = localEnv()
  return createClient(env.url, env.serviceKey, clientOptions)
}

export function anonClient(): SupabaseClient {
  const env = localEnv()
  return createClient(env.url, env.anonKey, clientOptions)
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

const PASSWORD = 'Integration-Test-Pass-2026!'

export async function createStudent(label: string): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.gradpath.local`
  const admin = serviceClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw signInError
  return { id: data.user.id, email, client }
}

export async function deleteUser(user: TestUser | undefined): Promise<void> {
  if (!user) return
  await serviceClient().auth.admin.deleteUser(user.id)
}
