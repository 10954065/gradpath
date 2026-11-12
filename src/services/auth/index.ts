import { AppError, toUserMessage } from '@/lib/errors'
import { siteUrl, supabase } from '@/lib/supabase'

export async function signUp(input: { email: string; password: string; fullName: string }): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim() },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  })
  if (error) throw new AppError(toUserMessage(error, 'We could not create your account.'), { cause: error, code: error.code })
  // With email confirmation enabled Supabase returns no session until the link is clicked.
  return { needsConfirmation: !data.session }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new AppError(toUserMessage(error, 'We could not sign you in.'), { cause: error, code: error.code })
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${siteUrl()}/reset-password`,
  })
  if (error) throw new AppError(toUserMessage(error, 'We could not send the reset email.'), { cause: error, code: error.code })
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new AppError(toUserMessage(error, 'We could not update your password.'), { cause: error, code: error.code })
}

export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  })
  if (error) throw new AppError(toUserMessage(error, 'We could not resend the confirmation email.'), { cause: error, code: error.code })
}

/** Exchange the PKCE code in an email link for a session (sign-up confirmation, password recovery). */
export async function completeEmailLink(url: string): Promise<void> {
  const code = new URL(url).searchParams.get('code')
  if (!code) return
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw new AppError('This link is invalid or has expired. Please request a new one.', { cause: error })
}
