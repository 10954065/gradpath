/** Application error carrying a message that is safe to show to students. */
export class AppError extends Error {
  readonly userMessage: string
  readonly code: string | undefined

  constructor(userMessage: string, options: { cause?: unknown; code?: string } = {}) {
    super(userMessage, { cause: options.cause })
    this.name = 'AppError'
    this.userMessage = userMessage
    this.code = options.code
  }
}

interface PostgrestLikeError {
  message?: string
  code?: string
  details?: string
  hint?: string
  status?: number
}

const FRIENDLY_BY_CODE: Record<string, string> = {
  '23505': 'That item already exists.',
  '23503': 'This item refers to something that no longer exists.',
  '23514': 'Some of the values are not allowed. Please check the form.',
  '42501': 'You do not have permission to do that.',
  PGRST116: 'We could not find what you were looking for.',
  P0002: 'We could not find what you were looking for.',
  invalid_credentials: 'The email or password is incorrect.',
  email_not_confirmed: 'Please confirm your email address before signing in. Check your inbox for the link.',
  user_already_exists: 'An account with this email already exists. Try signing in instead.',
  weak_password: 'Choose a stronger password (at least 8 characters, mixing letters and numbers).',
  over_email_send_rate_limit: 'Too many emails were requested. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
}

export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to fetch|NetworkError|Load failed|network/i.test(message)
}

/** Convert any thrown value into a safe, readable message. Raw database details are never shown. */
export function toUserMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof AppError) return error.userMessage
  if (isOfflineError(error)) return 'You appear to be offline. Changes will sync when you reconnect.'
  const e = (error ?? {}) as PostgrestLikeError
  if (e.code && FRIENDLY_BY_CODE[e.code]) return FRIENDLY_BY_CODE[e.code] as string
  // Business-rule errors raised deliberately by database functions (errcode P0001) are written for students.
  if (e.code === 'P0001' && e.message) return e.message
  if (typeof e.message === 'string' && /Invalid login credentials/i.test(e.message)) return FRIENDLY_BY_CODE.invalid_credentials as string
  return fallback
}

/** Throw an AppError when a Supabase call returned an error. */
export function ensureOk<T>(result: { data: T; error: unknown }, fallback?: string): T {
  if (result.error) throw new AppError(toUserMessage(result.error, fallback), { cause: result.error })
  return result.data
}
