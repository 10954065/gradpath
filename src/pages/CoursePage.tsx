import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Circle, CircleDot, ClipboardCheck, CloudDownload, ExternalLink, PlayCircle, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CourseMaterials } from '@/components/courses/CourseMaterials'
import { CourseStatusBadge, SourceBadge, VerificationBadge, accentClass } from '@/components/courses/badges'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { Section } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { courseLessonIds, nextLesson, summariseProgress } from '@/lib/progress'
import { cn, safeExternalUrl } from '@/lib/utils'
import { listQuizzes } from '@/services/assessments'
import { getCourse, listResources, saveCourseForOffline } from '@/services/courses'
import { listMyProgress } from '@/services/progress'
import type { LessonProgress } from '@/types/database'

function LessonStatusIcon({ row }: { row: LessonProgress | undefined }) {
  if (row?.status === 'completed') return <CheckCircle2 className="size-4 text-success" aria-label="Completed" />
  if (row && row.reading_percent > 0) return <CircleDot className="size-4 text-primary" aria-label="In progress" />
  return <Circle className="size-4 text-muted-foreground/60" aria-label="Not started" />
}

export default function CoursePage() {
  const { courseSlug = '' } = useParams()
  const [params] = useSearchParams()
  const focusModule = params.get('module')
  const course = useQuery({ queryKey: ['course', courseSlug], queryFn: () => getCourse(courseSlug) })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const quizzes = useQuery({
    queryKey: ['quizzes', 'course', course.data?.id],
    queryFn: () => listQuizzes({ courseId: course.data?.id }),
    enabled: Boolean(course.data?.id),
  })
  const resources = useQuery({ queryKey: ['resources'], queryFn: listResources })
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const offline = useMutation({
    mutationFn: () => saveCourseForOffline(courseSlug, (done, total) => setDownloaded(`${done}/${total}`)),
    onSuccess: (count) => toast.success(`${count} lessons saved for offline reading on this device`),
    onError: (e) => toast.error(toUserMessage(e)),
  })

  if (course.isError) return <ErrorState message={toUserMessage(course.error)} onRetry={() => void course.refetch()} />
  if (!course.data) return <Skeleton className="h-[70vh]" />

  const c = course.data
  const rows = progress.data ?? []
  const byLesson = new Map(rows.map((r) => [r.lesson_id, r]))
  const ordered = c.modules.flatMap((m) => m.lessons)
  const summary = summariseProgress(courseLessonIds(c), rows)
  const upNext = nextLesson(ordered, rows)
  const courseResources = (resources.data ?? []).filter((r) => r.course_id === c.id)
  const moduleAssessments = (quizzes.data ?? []).filter((q) => q.kind === 'module_assessment')
  const mock = (quizzes.data ?? []).find((q) => q.kind === 'mock_exam')
  const isOpen = (slug: string, index: number) => open[slug] ?? (focusModule ? focusModule === slug : index === 0)

  return (
    <>
      <Breadcrumbs items={[{ label: 'My Courses', to: '/courses' }, { label: c.code }]} />
      <header className="relative mb-8 overflow-hidden rounded-2xl border bg-surface p-6 shadow-card sm:p-8">
        <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${accentClass(c.accent)}`} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-primary">{c.code}</span>
          <CourseStatusBadge course={c} />
          <SourceBadge source={c.source} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{c.title}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{c.description}</p>
        {c.status_note ? <p className="mt-2 text-xs text-muted-foreground">{c.status_note}</p> : null}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-md">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium">Course progress</span>
              <span className="tabular-nums">
                {summary.completed}/{summary.total} lessons · {summary.percent}%
              </span>
            </div>
            <ProgressBar value={summary.percent} label="Course progress" />
          </div>
          <div className="flex flex-wrap gap-2">
            {upNext ? (
              <Button asChild>
                <Link to={`/courses/${c.slug}/lessons/${upNext.slug}`}>
                  <PlayCircle /> {summary.completed || summary.inProgress ? 'Continue' : 'Start'}: {upNext.title.slice(0, 40)}
                  {upNext.title.length > 40 ? '…' : ''}
                </Link>
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => offline.mutate()} disabled={offline.isPending}>
              <CloudDownload /> {offline.isPending ? `Saving ${downloaded ?? ''}` : 'Save for offline'}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Section title={`Modules (${c.modules.length})`}>
            <ol className="flex flex-col gap-3">
              {c.modules.map((m, i) => {
                const moduleSummary = summariseProgress(
                  m.lessons.map((l) => l.id),
                  rows,
                )
                const assessment = moduleAssessments.find((q) => q.module_id === m.id)
                const expanded = isOpen(m.slug, i)
                return (
                  <li key={m.id} id={m.slug} className="rounded-xl border bg-surface shadow-card">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen((s) => ({ ...s, [m.slug]: !expanded }))}
                      className="flex w-full items-start gap-4 p-4 text-left"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold tracking-tight">{m.title}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{m.description}</span>
                        <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {moduleSummary.completed}/{moduleSummary.total} lessons
                          </span>
                          <ProgressBar value={moduleSummary.percent} label={`${m.title} progress`} className="max-w-40" tone="success" />
                        </span>
                      </span>
                      <ChevronDown className={cn('mt-1 size-4 shrink-0 transition', expanded && 'rotate-180')} aria-hidden />
                    </button>
                    {expanded ? (
                      <div className="border-t px-4 py-2">
                        <ul className="divide-y">
                          {m.lessons.map((l) => (
                            <li key={l.id}>
                              <Link
                                to={`/courses/${c.slug}/lessons/${l.slug}`}
                                className="flex items-center gap-3 rounded-md px-1 py-2.5 hover:bg-muted/60"
                              >
                                <LessonStatusIcon row={byLesson.get(l.id)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium">{l.title}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{l.summary}</span>
                                </span>
                                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{l.estimated_minutes} min</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {assessment ? (
                          <div className="mt-2 mb-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
                            <span className="inline-flex items-center gap-2 text-sm">
                              <ClipboardCheck className="size-4 text-primary" aria-hidden /> {assessment.title}
                            </span>
                            <Button asChild size="sm" variant="secondary">
                              <Link to={`/assessments/${assessment.id}`}>Open assessment</Link>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4 text-primary" aria-hidden /> Learning outcomes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {c.outcomes.map((o) => (
                  <li key={o} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                    {o}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <CourseMaterials courseId={c.id} />
          {mock ? (
            <Card>
              <CardHeader>
                <CardTitle>Course mock examination</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>{mock.description}</p>
                <Button asChild className="mt-3 w-full" variant="secondary">
                  <Link to={`/assessments/${mock.id}`}>View mock exam</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Learning resources</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {courseResources.slice(0, 8).map((r) => (
                  <li key={r.id} className="text-sm">
                    <a href={safeExternalUrl(r.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                      {r.title} <ExternalLink className="size-3" aria-hidden />
                    </a>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge>{r.provider}</Badge>
                      <VerificationBadge status={r.verification_status} />
                    </div>
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" variant="link" className="mt-3">
                <Link to={`/resources?course=${c.id}`}>All {c.code} resources</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}
