import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, CheckCircle2, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { RichText } from '@/components/lessons/RichText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form-controls'
import { PageHeader, Section, StatTile } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { intervalLabel, isDue } from '@/lib/scheduler'
import { getCatalogue } from '@/services/courses'
import { addToQueue, listFlashcards, listReviews, listRevisionItems, removeFromQueue, reviewItem } from '@/services/study/revision'
import type { ReviewRating, RevisionItem } from '@/types/database'
import { formatDate, relativeTime } from '@/utils/dates'

const RATINGS: { rating: ReviewRating; label: string; variant: 'danger' | 'secondary' | 'primary' | 'subtle' }[] = [
  { rating: 'again', label: 'Again', variant: 'danger' },
  { rating: 'hard', label: 'Difficult', variant: 'secondary' },
  { rating: 'good', label: 'Good', variant: 'primary' },
  { rating: 'easy', label: 'Easy', variant: 'subtle' },
]

export default function RevisionPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const items = useQuery({ queryKey: ['revision-items'], queryFn: listRevisionItems })
  const reviews = useQuery({ queryKey: ['revision-reviews'], queryFn: () => listReviews() })
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const flashcards = useQuery({ queryKey: ['flashcards'], queryFn: listFlashcards })
  const [revealed, setRevealed] = useState(false)
  const [topic, setTopic] = useState('')

  const lessons = useMemo(() => {
    const m = new Map<string, { title: string; course: string; url: string; summary: string }>()
    for (const c of catalogue.data ?? []) for (const mod of c.modules) for (const l of mod.lessons) m.set(l.id, { title: l.title, course: c.code, url: `/courses/${c.slug}/lessons/${l.slug}`, summary: l.summary })
    return m
  }, [catalogue.data])
  const cards = useMemo(() => new Map((flashcards.data ?? []).map((f) => [f.id, f])), [flashcards.data])

  const all = (items.data ?? []).filter((i) => i.status !== 'suspended')
  const due = all.filter((i) => isDue(i.due_at) && i.status !== 'mastered')
  const now = new Date()
  const overdue = due.filter((i) => now.getTime() - new Date(i.due_at).getTime() > 86_400_000)
  const upcoming = all.filter((i) => !isDue(i.due_at) && i.status !== 'mastered')
  const mastered = all.filter((i) => i.status === 'mastered')
  const weak = all.filter((i) => i.item_type === 'lesson' && (i.lapses > 0 || i.reason.startsWith('Scored')) && i.status !== 'mastered')
  const current = due[0]

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['revision-items'] })
    void queryClient.invalidateQueries({ queryKey: ['revision-reviews'] })
  }
  const review = useMutation({
    mutationFn: ({ item, rating }: { item: RevisionItem; rating: ReviewRating }) => reviewItem(user?.id as string, item, rating),
    onSuccess: (updated) => {
      queryClient.setQueryData<RevisionItem[]>(['revision-items'], (l) => (l ?? []).map((i) => (i.id === updated.id ? updated : i)))
      setRevealed(false)
      void queryClient.invalidateQueries({ queryKey: ['revision-reviews'] })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const add = useMutation({
    mutationFn: () => addToQueue(user?.id as string, { topic: topic.trim(), reason: 'Added by you' }),
    onSuccess: () => {
      setTopic('')
      invalidate()
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const remove = useMutation({ mutationFn: (id: string) => removeFromQueue(user?.id as string, id), onSuccess: invalidate })

  const describe = (i: RevisionItem) => {
    if (i.item_type === 'lesson') return lessons.get(i.lesson_id ?? '')?.title ?? 'Lesson'
    if (i.item_type === 'flashcard') return cards.get(i.flashcard_id ?? '')?.front ?? 'Flashcard'
    return i.topic ?? 'Topic'
  }
  const state = (i: RevisionItem) => ({ easeFactor: Number(i.ease_factor), intervalDays: Number(i.interval_days), repetitions: i.repetitions, lapses: i.lapses })

  if (items.isError) return <ErrorState message={toUserMessage(items.error)} onRetry={() => void items.refetch()} />

  return (
    <>
      <PageHeader
        title="Revision Centre"
        description="Spaced repetition and active recall: retrieve what you know before checking, rate how well you remembered, and GradPath schedules the next review."
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Due today" value={due.length} icon={<RefreshCcw className="size-4" aria-hidden />} />
        <StatTile label="Overdue" value={overdue.length} hint="Due more than a day ago" />
        <StatTile label="Upcoming" value={upcoming.length} />
        <StatTile label="Mastered" value={mastered.length} hint="Interval of 21 days or more" />
      </div>

      {items.isPending ? (
        <Skeleton className="h-64" />
      ) : current ? (
        <section aria-label="Review session" className="mb-8 rounded-2xl border bg-surface p-6 shadow-card">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone="primary" className="capitalize">
              {current.item_type}
            </Badge>
            <span>{due.length} remaining</span>
            {current.reason ? <span>· {current.reason}</span> : null}
          </div>
          {current.item_type === 'flashcard' ? (
            <>
              <RichText markdown={cards.get(current.flashcard_id ?? '')?.front ?? ''} className="font-sans text-lg font-medium" />
              {revealed ? <RichText markdown={cards.get(current.flashcard_id ?? '')?.back ?? ''} className="mt-4 border-t pt-4 font-sans" /> : null}
            </>
          ) : current.item_type === 'lesson' ? (
            <>
              <p className="text-lg font-medium">{describe(current)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Active recall: without looking, write or say the key ideas, definitions and one example from this lesson. Then open the lesson's
                revision summary to check yourself.
              </p>
              {revealed ? (
                <div className="mt-4 border-t pt-4 text-sm">
                  <p>{lessons.get(current.lesson_id ?? '')?.summary}</p>
                  <Button asChild variant="link" size="sm" className="mt-2">
                    <Link to={`${lessons.get(current.lesson_id ?? '')?.url ?? '/courses'}#h-revision-summary`}>
                      <BookOpen /> Open the revision summary
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-lg font-medium">{current.topic}</p>
              <p className="mt-2 text-sm text-muted-foreground">Recall everything you can about this topic, then check your notes.</p>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {!revealed && current.item_type !== 'topic' ? (
              <Button onClick={() => setRevealed(true)}>
                <Brain /> Show answer
              </Button>
            ) : (
              RATINGS.map((r) => (
                <Button key={r.rating} variant={r.variant} onClick={() => review.mutate({ item: current, rating: r.rating })} disabled={review.isPending}>
                  {r.label} <span className="text-xs opacity-75">· {intervalLabel(state(current), r.rating)}</span>
                </Button>
              ))
            )}
          </div>
        </section>
      ) : (
        <EmptyState
          className="mb-8"
          icon={CheckCircle2}
          title="Nothing due right now"
          description="Assessments add weak lessons here automatically. You can also add flashcards from the Flashcards page or a topic below."
          action={
            <Button asChild variant="secondary">
              <Link to="/flashcards">Study flashcards</Link>
            </Button>
          }
        />
      )}

      <form
        className="mb-8 flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (topic.trim()) add.mutate()
        }}
      >
        <Input aria-label="Topic to revise" placeholder="Add a topic to revise, e.g. “Cronbach's alpha”" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!topic.trim()}>
          <Plus /> Add
        </Button>
      </form>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="weak">Weak topics</TabsTrigger>
          <TabsTrigger value="mastered">Mastered</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        {(
          [
            ['upcoming', [...overdue, ...upcoming]],
            ['weak', weak],
            ['mastered', mastered],
          ] as const
        ).map(([key, list]) => (
          <TabsContent key={key} value={key}>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in this list yet.</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-surface">
                {list.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Badge className="capitalize">{i.item_type}</Badge>
                    <span className="min-w-0 flex-1 truncate">{describe(i)}</span>
                    <span className="text-xs text-muted-foreground">{isDue(i.due_at) ? 'Due now' : `Due ${formatDate(i.due_at)}`}</span>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove from revision" onClick={() => remove.mutate(i.id)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
        <TabsContent value="history">
          <Section title={`Recent reviews (${reviews.data?.length ?? 0})`}>
            {(reviews.data ?? []).length === 0 ? (
              <Alert>Your review history will appear here.</Alert>
            ) : (
              <ul className="divide-y rounded-xl border bg-surface">
                {(reviews.data ?? []).slice(0, 50).map((r) => {
                  const item = all.find((i) => i.id === r.revision_item_id)
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <Badge tone={r.rating === 'again' ? 'danger' : r.rating === 'easy' ? 'success' : 'neutral'} className="capitalize">
                        {r.rating === 'hard' ? 'difficult' : r.rating}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate">{item ? describe(item) : 'Item'}</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(r.reviewed_at)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </>
  )
}
