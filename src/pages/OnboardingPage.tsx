import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { BookOpenCheck, CalendarClock, CheckCircle2, ClipboardCheck, GraduationCap, Target } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { listCourses } from '@/services/courses'
import { completeOnboarding } from '@/services/profile'

const STEPS = ['Welcome', 'Your courses', 'Study target', 'How GradPath works', 'Your planner'] as const

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [target, setTarget] = useState(profile?.weekly_study_target_hours ?? 15)
  const [createTimetable, setCreateTimetable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })

  const finish = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      await completeOnboarding(user.id, { weeklyTarget: target, createTimetable })
      await refreshProfile()
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
      setSaving(false)
    }
  }

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there'
  const isLast = step === STEPS.length - 1

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Logo />
        <Button variant="ghost" size="sm" onClick={finish} disabled={saving}>
          Skip setup
        </Button>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16">
        <ol className="mb-8 flex gap-1.5" aria-label="Onboarding progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <span className={`block h-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
              <span className="sr-only">
                Step {i + 1}: {label} {i === step ? '(current)' : ''}
              </span>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border bg-surface p-6 shadow-card sm:p-8"
            aria-labelledby="onboarding-title"
          >
            {step === 0 ? (
              <>
                <GraduationCap className="size-8 text-primary" aria-hidden />
                <h1 id="onboarding-title" className="mt-4 text-2xl font-semibold tracking-tight">
                  Welcome to GradPath, {firstName}.
                </h1>
                <p className="mt-3 max-w-xl text-muted-foreground">
                  GradPath supports you through Semester 1 of the MSc IT for Business: structured lessons, practice assessments,
                  spaced-repetition revision, a study planner and progress analytics — all in one place.
                </p>
                <Alert className="mt-6" title="An independent study companion">
                  Lessons are original supplementary explanations and all questions are practice questions. They are not official
                  University of Ghana material and do not replace your lecturers, course outlines or examination regulations.
                </Alert>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h1 id="onboarding-title" className="text-xl font-semibold tracking-tight">
                  Your seven courses
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  These courses make up GradPath's initial curriculum. Confirm each one against your official registration — not every
                  course is necessarily compulsory for you.
                </p>
                <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {courses.isPending
                    ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)
                    : (courses.data ?? []).map((c) => (
                        <li key={c.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-primary">{c.code}</span>
                            {c.status === 'recommended_elective' ? <Badge tone="warning">Recommended elective</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm font-medium">{c.title}</p>
                        </li>
                      ))}
                </ul>
                {courses.isError ? (
                  <Alert tone="danger" className="mt-4">
                    {toUserMessage(courses.error)}
                  </Alert>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Target className="size-7 text-primary" aria-hidden />
                <h1 id="onboarding-title" className="mt-3 text-xl font-semibold tracking-tight">
                  Set a weekly study target
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We recommend 15–20 hours of independent study per week alongside lectures. You can change this at any time.
                </p>
                <div className="mt-6">
                  <label htmlFor="target" className="flex items-baseline justify-between text-sm font-medium">
                    Hours per week
                    <span className="text-3xl font-semibold tabular-nums">{target}</span>
                  </label>
                  <input
                    id="target"
                    type="range"
                    min={1}
                    max={40}
                    step={1}
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                    className="mt-3 w-full accent-[var(--color-primary)]"
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>Recommended 15–20</span>
                    <span>40</span>
                  </div>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h1 id="onboarding-title" className="text-xl font-semibold tracking-tight">
                  How learning works here
                </h1>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <BookOpenCheck className="size-5 text-primary" aria-hidden />
                    <h2 className="mt-2 text-sm font-semibold">Completing lessons</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Opening a lesson never marks it complete. Read at least 80% of it, then choose “Mark as complete”. Your reading
                      progress is saved as you go.
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <ClipboardCheck className="size-5 text-primary" aria-hidden />
                    <h2 className="mt-2 text-sm font-semibold">Assessments and mastery</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Quizzes are scored securely on the server. Scoring 80% or more records mastery; below that, weak topics are added
                      to your revision queue and you can try again.
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <CalendarClock className="size-7 text-primary" aria-hidden />
                <h1 id="onboarding-title" className="mt-3 text-xl font-semibold tracking-tight">
                  Start your study planner
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We can add a provisional weekly study schedule (Monday–Sunday blocks for each course). It is a suggested study plan,
                  not an official lecture timetable — edit it or replace it with your real timetable whenever you like.
                </p>
                <label className="mt-5 flex items-start gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    checked={createTimetable}
                    onChange={(e) => setCreateTimetable(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Add the provisional study timetable</span>
                    <span className="block text-muted-foreground">Times use Africa/Accra.</span>
                  </span>
                </label>
                {error ? (
                  <Alert tone="danger" className="mt-4">
                    {error}
                  </Alert>
                ) : null}
              </>
            ) : null}

            <div className="mt-8 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
                Back
              </Button>
              <div className="flex gap-2">
                {!isLast && step > 0 ? (
                  <Button variant="secondary" onClick={() => setStep((s) => s + 1)}>
                    Skip
                  </Button>
                ) : null}
                {isLast ? (
                  <Button onClick={finish} disabled={saving}>
                    <CheckCircle2 /> {saving ? 'Setting up…' : 'Finish and go to dashboard'}
                  </Button>
                ) : (
                  <Button onClick={() => setStep((s) => s + 1)}>Continue</Button>
                )}
              </div>
            </div>
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  )
}
