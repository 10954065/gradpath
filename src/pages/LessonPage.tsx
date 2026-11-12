import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Lightbulb,
  ListChecks,
  Minus,
  MoonStar,
  NotebookPen,
  Plus,
  PlayCircle,
  WifiOff,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { SourceBadge, VerificationBadge } from '@/components/courses/badges'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { LessonNotes } from '@/components/lessons/LessonNotes'
import { RichText } from '@/components/lessons/RichText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Alert, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { useAuth } from '@/contexts/AuthContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useReadingTracker } from '@/hooks/useReadingTracker'
import { toUserMessage } from '@/lib/errors'
import { slugify } from '@/lib/markdown'
import { cn, safeExternalUrl } from '@/lib/utils'
import { listQuizzes } from '@/services/assessments'
import { getLesson } from '@/services/courses'
import { getPreferences, updatePreferences } from '@/services/profile'
import { addBookmark, listBookmarks, listMyProgress, removeBookmark, setLessonCompleted } from '@/services/progress'
import type { LessonContent } from '@/types/database'

interface TocItem {
  id: string
  label: string
}

function SectionBlock({ id, title, icon, children, tone }: { id: string; title: string; icon?: ReactNode; children: ReactNode; tone?: 'callout' }) {
  return (
    <section aria-labelledby={`h-${id}`} className={cn('scroll-mt-24', tone === 'callout' && 'rounded-xl border bg-surface-2/60 p-5')}>
      <h2 id={`h-${id}`} data-section={id} className="mb-3 flex items-center gap-2 font-sans text-xl font-semibold tracking-tight">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function MarkdownList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className="prose-gp">
      {items.map((item, i) => (
        <li key={i}>
          <RichText markdown={item} className="[&>p]:m-0" />
        </li>
      ))}
    </Tag>
  )
}

function buildToc(content: LessonContent): TocItem[] {
  const items: TocItem[] = [{ id: 'introduction', label: 'Introduction' }]
  if (content.objectives?.length) items.push({ id: 'objectives', label: 'Learning objectives' })
  if (content.keyTerms?.length) items.push({ id: 'key-terms', label: 'Key terminology' })
  for (const b of content.body ?? []) items.push({ id: `s-${slugify(b.heading)}`, label: b.heading })
  if (content.misconceptions?.length) items.push({ id: 'misconceptions', label: 'Common misconceptions' })
  if (content.examMistakes?.length) items.push({ id: 'exam-mistakes', label: 'Examination mistakes' })
  if (content.criticalQuestions?.length) items.push({ id: 'critical-thinking', label: 'Critical thinking' })
  if (content.exercises?.length) items.push({ id: 'exercises', label: 'Practical exercises' })
  if (content.takeaways?.length) items.push({ id: 'takeaways', label: 'Key takeaways' })
  if (content.revisionSummary) items.push({ id: 'revision-summary', label: 'Revision summary' })
  if (content.furtherReading?.length || content.videos?.length) items.push({ id: 'resources', label: 'Reading & videos' })
  items.push({ id: 'complete', label: 'Check & complete' })
  return items
}

export default function LessonPage() {
  const { courseSlug = '', lessonSlug = '' } = useParams()
  const { user } = useAuth()
  const online = useOnlineStatus()
  const queryClient = useQueryClient()
  const articleRef = useRef<HTMLElement>(null)
  const [readerDark, setReaderDark] = useState(false)

  const data = useQuery({ queryKey: ['lesson', courseSlug, lessonSlug], queryFn: () => getLesson(courseSlug, lessonSlug) })
  const lessonId = data.data?.lesson.id
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: listBookmarks })
  const prefs = useQuery({ queryKey: ['preferences', user?.id], queryFn: () => getPreferences(user?.id as string), enabled: Boolean(user) })
  const quizzes = useQuery({
    queryKey: ['quizzes', 'lesson', lessonId],
    queryFn: () => listQuizzes({ kind: 'lesson_quiz', lessonId }),
    enabled: Boolean(lessonId),
  })

  const row = progress.data?.find((p) => p.lesson_id === lessonId)
  const bookmark = bookmarks.data?.find((b) => b.lesson_id === lessonId)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    if (prefs.data) setScale(prefs.data.reader_font_scale)
  }, [prefs.data])

  const { percent, activeSection } = useReadingTracker(articleRef, {
    userId: user?.id,
    lessonId,
    initialPercent: row?.reading_percent ?? 0,
    initialSeconds: row?.time_spent_seconds ?? 0,
  })

  const content = data.data?.lesson.content
  const toc = useMemo(() => (content ? buildToc(content) : []), [content])

  const changeScale = (delta: number) => {
    const next = Math.min(1.6, Math.max(0.8, Math.round((scale + delta) * 100) / 100))
    setScale(next)
    if (user) void updatePreferences(user.id, { reader_font_scale: next }).catch(() => undefined)
  }

  const toggleBookmark = useMutation({
    mutationFn: async () => {
      if (!user || !lessonId) return
      if (bookmark) await removeBookmark(user.id, bookmark.id)
      else await addBookmark(user.id, { lessonId })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast.success(bookmark ? 'Bookmark removed' : 'Lesson bookmarked')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const completed = row?.status === 'completed'
  const minReading = data.data?.lesson.min_reading_percent ?? 80
  const complete = useMutation({
    mutationFn: (value: boolean) => setLessonCompleted(user?.id as string, lessonId as string, value, percent),
    onSuccess: (_, value) => {
      void queryClient.invalidateQueries({ queryKey: ['progress'] })
      toast.success(value ? 'Lesson marked as complete' : 'Lesson marked as not complete')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  if (data.isError) return <ErrorState message={toUserMessage(data.error)} onRetry={() => void data.refetch()} />
  if (!data.data || !content) return <Skeleton className="h-[80vh]" />

  const { lesson, module, course, previous, next, position } = data.data
  const quiz = quizzes.data?.[0]
  const readyToComplete = percent >= minReading

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 h-0.5 bg-transparent lg:left-64" aria-hidden>
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <Breadcrumbs
        items={[
          { label: 'My Courses', to: '/courses' },
          { label: course.code, to: `/courses/${course.slug}` },
          { label: module.title, to: `/courses/${course.slug}?module=${module.slug}` },
          { label: lesson.title },
        ]}
      />
      {!online ? (
        <Alert tone="warning" className="mb-4" title="You are offline">
          You are reading a copy saved on this device. Progress and notes will sync when you reconnect; quizzes need a connection.
        </Alert>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className={cn('min-w-0 rounded-2xl', readerDark && 'reader-dark p-4 sm:p-6')} style={{ ['--reader-scale' as string]: scale }}>
          <header className="mb-8">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {course.code} · Module {module.sort_order}: {module.title} · Lesson {position.index} of {position.total}
            </p>
            <h1 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-tight text-balance sm:text-[2.1rem]">{lesson.title}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{lesson.summary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SourceBadge source={lesson.source} />
              <Badge>
                <Clock aria-hidden /> {lesson.estimated_minutes} min
              </Badge>
              <Badge className="capitalize">{lesson.difficulty}</Badge>
              {completed ? (
                <Badge tone="success">
                  <CheckCircle2 aria-hidden /> Completed
                </Badge>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Reading tools">
              <Button variant="secondary" size="sm" onClick={() => toggleBookmark.mutate()} aria-pressed={Boolean(bookmark)}>
                {bookmark ? <BookmarkCheck /> : <Bookmark />} {bookmark ? 'Bookmarked' : 'Bookmark'}
              </Button>
              <div className="flex items-center rounded-md border bg-surface">
                <Button variant="ghost" size="icon-sm" onClick={() => changeScale(-0.1)} aria-label="Decrease text size">
                  <Minus />
                </Button>
                <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
                  {Math.round(scale * 100)}%
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => changeScale(0.1)} aria-label="Increase text size">
                  <Plus />
                </Button>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setReaderDark((v) => !v)} aria-pressed={readerDark}>
                <MoonStar /> {readerDark ? 'Standard reading' : 'Dark reading'}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" className="xl:hidden">
                    <NotebookPen /> Notes
                  </Button>
                </DialogTrigger>
                <DialogContent title="My notes for this lesson" description="Private to you.">
                  {user ? <LessonNotes userId={user.id} courseId={course.id} moduleId={module.id} lessonId={lesson.id} /> : null}
                </DialogContent>
              </Dialog>
            </div>
          </header>

          <article ref={articleRef} className="flex max-w-3xl flex-col gap-10">
            <SectionBlock id="introduction" title="Introduction">
              <RichText markdown={content.introduction ?? ''} />
            </SectionBlock>

            {content.objectives?.length ? (
              <SectionBlock id="objectives" title="Learning objectives" icon={<ListChecks className="size-5 text-primary" aria-hidden />} tone="callout">
                <p className="mb-2 text-sm text-muted-foreground">By the end of this lesson you should be able to:</p>
                <MarkdownList items={content.objectives} />
                {content.prerequisites?.length ? (
                  <>
                    <h3 className="mt-4 mb-1 text-sm font-semibold">Prerequisite knowledge</h3>
                    <MarkdownList items={content.prerequisites} />
                  </>
                ) : null}
              </SectionBlock>
            ) : null}

            {content.keyTerms?.length ? (
              <SectionBlock id="key-terms" title="Key terminology">
                <dl className="grid gap-3 sm:grid-cols-2">
                  {content.keyTerms.map((k) => (
                    <div key={k.term} className="rounded-lg border bg-surface p-3">
                      <dt className="text-sm font-semibold">{k.term}</dt>
                      <dd className="mt-1 text-sm text-muted-foreground">
                        <RichText markdown={k.definition} inline />
                      </dd>
                    </div>
                  ))}
                </dl>
              </SectionBlock>
            ) : null}

            {(content.body ?? []).map((section) => (
              <SectionBlock key={section.heading} id={`s-${slugify(section.heading)}`} title={section.heading}>
                <RichText markdown={section.markdown} />
              </SectionBlock>
            ))}

            {content.misconceptions?.length ? (
              <SectionBlock id="misconceptions" title="Common misconceptions" icon={<Lightbulb className="size-5 text-warning" aria-hidden />} tone="callout">
                <MarkdownList items={content.misconceptions} />
              </SectionBlock>
            ) : null}

            {content.examMistakes?.length ? (
              <SectionBlock id="exam-mistakes" title="Common examination mistakes" icon={<AlertTriangle className="size-5 text-danger" aria-hidden />} tone="callout">
                <MarkdownList items={content.examMistakes} />
              </SectionBlock>
            ) : null}

            {content.criticalQuestions?.length ? (
              <SectionBlock id="critical-thinking" title="Critical thinking questions">
                <MarkdownList items={content.criticalQuestions} ordered />
              </SectionBlock>
            ) : null}

            {content.exercises?.length ? (
              <SectionBlock id="exercises" title="Practical exercises">
                <MarkdownList items={content.exercises} ordered />
              </SectionBlock>
            ) : null}

            {content.takeaways?.length ? (
              <SectionBlock id="takeaways" title="Key takeaways" tone="callout">
                <MarkdownList items={content.takeaways} />
              </SectionBlock>
            ) : null}

            {content.revisionSummary ? (
              <SectionBlock id="revision-summary" title="Revision summary">
                <RichText markdown={content.revisionSummary} />
              </SectionBlock>
            ) : null}

            {content.furtherReading?.length || content.videos?.length ? (
              <SectionBlock id="resources" title="Further reading and videos">
                {content.furtherReading?.length ? (
                  <ul className="flex flex-col gap-3">
                    {content.furtherReading.map((r, i) => (
                      <li key={i} className="text-sm">
                        <RichText markdown={r.text} inline />
                        {r.url ? (
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <a href={safeExternalUrl(r.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              Open <ExternalLink className="size-3" aria-hidden />
                            </a>
                            <VerificationBadge status={r.verification} />
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {content.videos?.length ? (
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {content.videos.map((v) => (
                      <li key={v.url}>
                        <a
                          href={safeExternalUrl(v.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-full gap-3 rounded-lg border bg-surface p-3 text-sm hover:border-primary/40"
                        >
                          <PlayCircle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                          <span>
                            <span className="font-medium">{v.title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{v.description}</span>
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              <Badge>Opens externally · needs internet</Badge>
                              <VerificationBadge status={v.verification} />
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </SectionBlock>
            ) : null}

            <SectionBlock id="complete" title="Check your understanding and complete">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-surface p-4">
                  <ClipboardCheck className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-2 font-sans text-sm font-semibold">Lesson quiz</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Supplementary practice questions on this lesson. Score {quiz ? 'at least the mastery threshold' : ''} to record mastery.
                    {row?.quiz_best_percent != null ? ` Your best: ${Math.round(row.quiz_best_percent)}%.` : ''}
                  </p>
                  {quiz ? (
                    <Button asChild size="sm" className="mt-3">
                      <Link to={`/assessments/${quiz.id}`}>Take the quiz</Link>
                    </Button>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">No quiz is published for this lesson yet.</p>
                  )}
                </div>
                <div className="rounded-xl border bg-surface p-4">
                  <CheckCircle2 className={cn('size-5', completed ? 'text-success' : 'text-muted-foreground')} aria-hidden />
                  <h3 className="mt-2 font-sans text-sm font-semibold">{completed ? 'Lesson completed' : 'Mark as complete'}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {completed
                      ? 'Well done. You can revisit this lesson at any time.'
                      : readyToComplete
                        ? 'You have read enough of this lesson to mark it complete.'
                        : `Read at least ${minReading}% of the lesson first (you have read ${percent}%).`}
                    {lesson.requires_quiz_pass && !completed ? ' This lesson also requires a passing quiz score.' : ''}
                  </p>
                  <ProgressBar value={percent} label="Reading progress" className="mt-3" tone={readyToComplete ? 'success' : 'primary'} />
                  <Button
                    size="sm"
                    className="mt-3"
                    variant={completed ? 'secondary' : 'primary'}
                    disabled={complete.isPending || (!completed && !readyToComplete) || !online}
                    onClick={() => complete.mutate(!completed)}
                  >
                    {completed ? 'Mark as not complete' : 'Mark as complete'}
                  </Button>
                  {!online ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <WifiOff className="size-3" aria-hidden /> Completion is confirmed by the server, so it needs a connection.
                    </p>
                  ) : null}
                </div>
              </div>
            </SectionBlock>
          </article>

          <nav aria-label="Lesson navigation" className="mt-12 grid max-w-3xl gap-3 border-t pt-6 sm:grid-cols-2">
            {previous ? (
              <Link to={`/courses/${course.slug}/lessons/${previous.slug}`} className="group rounded-xl border bg-surface p-4 hover:border-primary/40">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="size-3.5" aria-hidden /> Previous lesson
                </span>
                <span className="mt-1 block text-sm font-medium">{previous.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link to={`/courses/${course.slug}/lessons/${next.slug}`} className="group rounded-xl border bg-surface p-4 text-right hover:border-primary/40">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Next lesson <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <span className="mt-1 block text-sm font-medium">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-5 overflow-y-auto pb-6">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
              <nav aria-label="Table of contents">
                <ol className="flex flex-col gap-0.5 border-l">
                  {toc.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#h-${item.id}`}
                        className={cn(
                          '-ml-px block border-l-2 border-transparent py-1 pl-3 text-[13px] text-muted-foreground hover:text-foreground',
                          activeSection === item.id && 'border-primary font-medium text-foreground',
                        )}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
            <div className="rounded-xl border bg-surface p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Reading progress</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{percent}%</p>
              <ProgressBar value={percent} label="Reading progress" className="mt-2" />
            </div>
            <div className="rounded-xl border bg-surface p-4">
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">My notes</p>
              {user ? <LessonNotes userId={user.id} courseId={course.id} moduleId={module.id} lessonId={lesson.id} /> : null}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
