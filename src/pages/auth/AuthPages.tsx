// Sign-in, registration and password-recovery screens.
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Alert, Spinner } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form-controls'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { completeEmailLink, requestPasswordReset, resendConfirmation, signIn, signUp, updatePassword } from '@/services/auth'

const HIGHLIGHTS = [
  'Seven structured courses with postgraduate-level lessons',
  'Practice quizzes, module assessments and timed mock exams',
  'Spaced-repetition revision, flashcards and a study planner',
  'Works offline once lessons are saved to your device',
]

function AuthLayout({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <Link to="/" className="relative">
          <Logo />
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="text-xs font-semibold tracking-[0.18em] text-sidebar-muted uppercase">University of Ghana, Legon · MSc IT for Business</p>
          <h2 className="mt-4 font-serif text-4xl leading-tight font-semibold text-balance">
            Learn with purpose. Master every course. Graduate with excellence.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-sidebar-foreground/85">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-xs leading-relaxed text-sidebar-muted">
            GradPath is an independent supplementary learning platform. It is not official University of Ghana teaching
            material and does not replace your lecturers' instructions.
          </p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}

const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number')

// ---------------------------------------------------------------------------------------------
const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { register, handleSubmit, getValues, formState } = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    setNotice(null)
    try {
      await signIn(values.email, values.password)
      navigate(from, { replace: true })
    } catch (e) {
      const message = toUserMessage(e)
      setNeedsConfirm(/confirm your email/i.test(message))
      setError(message)
    }
  })

  const onResend = async () => {
    try {
      await resendConfirmation(getValues('email'))
      setNotice('We have sent a new confirmation link. Check your inbox (and spam folder).')
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to continue your studies."
      footer={
        <>
          New to GradPath?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger">
            {error}
            {needsConfirm ? (
              <button type="button" onClick={onResend} className="mt-1 block font-medium text-primary hover:underline">
                Resend confirmation email
              </button>
            ) : null}
          </Alert>
        ) : null}
        {notice ? <Alert>{notice}</Alert> : null}
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(formState.errors.email)} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(formState.errors.password)} {...register('password')} />
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------------------------------------
const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.string().trim().email('Enter a valid email address'),
    password: passwordSchema,
    confirm: z.string(),
    agree: z.boolean().refine((v) => v, 'Please confirm you understand'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { agree: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const { needsConfirmation } = await signUp({ email: values.email, password: values.password, fullName: values.fullName })
      if (needsConfirmation) setSentTo(values.email)
      else navigate('/onboarding', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
  })

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" description={`We sent a confirmation link to ${sentTo}.`}>
        <div className="flex flex-col items-start gap-4 text-sm text-muted-foreground">
          <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
            <MailCheck className="size-5" aria-hidden />
          </div>
          <p>Open the link to verify your address, then sign in. If it expires you can request a new one from the sign-in page.</p>
          <Button asChild variant="secondary">
            <Link to="/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Your progress, notes and results stay private to you."
      footer={
        <>
          Already registered?{' '}
          <Link to="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Full name" htmlFor="fullName" error={formState.errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" aria-invalid={Boolean(formState.errors.fullName)} {...register('fullName')} />
        </Field>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(formState.errors.email)} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message} hint="At least 8 characters, with letters and numbers.">
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(formState.errors.password)} {...register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={formState.errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(formState.errors.confirm)} {...register('confirm')} />
        </Field>
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" {...register('agree')} />
          <span>
            I understand GradPath is an independent supplementary study platform, not official University of Ghana material, and that
            practice results are not official grades.
          </span>
        </label>
        {formState.errors.agree ? <p className="-mt-2 text-xs font-medium text-danger">{formState.errors.agree.message}</p> : null}
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------------------------------------
const forgotSchema = z.object({ email: z.string().trim().email('Enter a valid email address') })

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (e) {
      setError(toUserMessage(e))
    }
  })

  return (
    <AuthLayout
      title="Reset your password"
      description="We will email you a secure link to choose a new password."
      footer={
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert title="Check your inbox">
          If an account exists for that address, a reset link is on its way. For your security we do not confirm whether an email is registered.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(formState.errors.email)} {...register('email')} />
          </Field>
          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

// ---------------------------------------------------------------------------------------------
const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })

  useEffect(() => {
    let active = true
    completeEmailLink(window.location.href)
      .then(() => {
        if (active) setLinkState('ready')
      })
      .catch((e: unknown) => {
        if (!active) return
        setError(toUserMessage(e))
        setLinkState('invalid')
      })
    return () => {
      active = false
    }
  }, [])

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try {
      await updatePassword(password)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
  })

  return (
    <AuthLayout title="Choose a new password" description="Use a password you do not use anywhere else.">
      {linkState === 'checking' ? (
        <Spinner label="Checking your reset link" />
      ) : linkState === 'invalid' || !user ? (
        <Alert tone="danger" title="This reset link cannot be used">
          {error ?? 'The link is invalid or has expired.'}{' '}
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new link
          </Link>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="New password" htmlFor="password" error={formState.errors.password?.message} hint="At least 8 characters, with letters and numbers.">
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(formState.errors.password)} {...register('password')} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm" error={formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(formState.errors.confirm)} {...register('confirm')} />
          </Field>
          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

// ---------------------------------------------------------------------------------------------
/** Landing page for email-confirmation links. */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const description = params.get('error_description')
    if (description) {
      setError(description)
      return
    }
    completeEmailLink(window.location.href)
      .then(() => navigate('/onboarding', { replace: true }))
      .catch((e: unknown) => setError(toUserMessage(e)))
  }, [navigate])

  return (
    <AuthLayout title="Confirming your email">
      {error ? (
        <Alert tone="danger" title="We could not confirm your email">
          {error}{' '}
          <Link to="/sign-in" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        </Alert>
      ) : (
        <Spinner label="Confirming your email" />
      )}
    </AuthLayout>
  )
}
