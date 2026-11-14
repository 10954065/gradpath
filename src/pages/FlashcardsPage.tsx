import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Layers, ListPlus, Plus, RotateCw, Shuffle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SourceBadge } from '@/components/courses/badges'
import { RichText } from '@/components/lessons/RichText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { useMyCourses } from '@/hooks/useMyCourses'
import { coursesForPicker } from '@/lib/curriculum'
import { addToQueue, deleteOwnFlashcard, flashcardSchema, listFlashcards, listRevisionItems, saveOwnFlashcard } from '@/services/study/revision'
import type { Flashcard } from '@/types/database'

export default function FlashcardsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const cards = useQuery({ queryKey: ['flashcards'], queryFn: listFlashcards })
  const my = useMyCourses()
  const queue = useQuery({ queryKey: ['revision-items'], queryFn: listRevisionItems })
  const [course, setCourse] = useState('')
  const [deck, setDeck] = useState<'all' | 'mine'>('all')
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [order, setOrder] = useState<string[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ front: '', back: '', course_id: '' })

  const list = useMemo(() => {
    // Curriculum cards come from the courses the student takes; their own cards are always shown.
    const base = (cards.data ?? []).filter(
      (c) =>
        (!course || c.course_id === course) &&
        (deck === 'all' || c.user_id === user?.id) &&
        (c.user_id === user?.id || my.isTaking(c.course_id)),
    )
    if (!order) return base
    const byId = new Map(base.map((c) => [c.id, c]))
    return order.map((id) => byId.get(id)).filter((c): c is Flashcard => Boolean(c))
  }, [cards.data, course, deck, order, user, my])
  const card = list[Math.min(index, Math.max(0, list.length - 1))]
  const queued = new Set((queue.data ?? []).map((q) => q.flashcard_id))

  const move = (delta: number) => {
    setFlipped(false)
    setIndex((i) => (list.length ? (i + delta + list.length) % list.length : 0))
  }
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['flashcards'] })
    void queryClient.invalidateQueries({ queryKey: ['revision-items'] })
  }
  const enqueue = useMutation({
    mutationFn: (c: Flashcard) => addToQueue(user?.id as string, { flashcardId: c.id, courseId: c.course_id, reason: 'Added from flashcards' }),
    onSuccess: () => {
      toast.success('Added to your revision queue')
      refresh()
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const create = useMutation({
    mutationFn: () => saveOwnFlashcard(user?.id as string, { front: draft.front, back: draft.back, course_id: draft.course_id || null, lesson_id: null }),
    onSuccess: () => {
      setCreating(false)
      setDraft({ front: '', back: '', course_id: '' })
      toast.success('Flashcard created')
      refresh()
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const remove = useMutation({ mutationFn: (id: string) => deleteOwnFlashcard(user?.id as string, id), onSuccess: refresh })

  return (
    <>
      <PageHeader
        title="Flashcards"
        description="Curriculum flashcards for every lesson plus your own cards. Test yourself, then add cards to your spaced-repetition queue."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New card
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Select aria-label="Course" value={course} onValueChange={(next) => (setCourse(next), setIndex(0), setOrder(null))} className="w-full sm:w-72">
          <SelectItem value="">All courses</SelectItem>
          {coursesForPicker(my.taking, my.all, course || null).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.code} {c.title}
            </SelectItem>
          ))}
        </Select>
        <Select aria-label="Deck" value={deck} onValueChange={(next) => (setDeck(next as 'all' | 'mine'), setIndex(0), setOrder(null))} className="w-full sm:w-48">
          <SelectItem value="all">All cards</SelectItem>
          <SelectItem value="mine">My cards</SelectItem>
        </Select>
        <Button
          variant="secondary"
          onClick={() => {
            const ids = list.map((c) => c.id).sort(() => Math.random() - 0.5)
            setOrder(ids)
            setIndex(0)
            setFlipped(false)
          }}
        >
          <Shuffle /> Shuffle
        </Button>
      </div>
      {cards.isError ? <ErrorState message={toUserMessage(cards.error)} onRetry={() => void cards.refetch()} /> : null}
      {cards.isPending ? (
        <Skeleton className="h-80" />
      ) : !card ? (
        <EmptyState icon={Layers} title="No flashcards here" description="Choose another course or create your own card." />
      ) : (
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show question side' : 'Reveal answer side'}
            className="flex min-h-64 w-full flex-col justify-center rounded-2xl border bg-surface p-8 text-left shadow-raised transition hover:border-primary/40"
          >
            <span className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{flipped ? 'Answer' : 'Question'}</span>
            <RichText markdown={flipped ? card.back : card.front} className="font-sans text-lg" />
            <span className="mt-6 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <RotateCw className="size-3.5" aria-hidden /> Click to {flipped ? 'see the question' : 'reveal the answer'}
            </span>
          </button>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon" onClick={() => move(-1)} aria-label="Previous card">
                <ChevronLeft />
              </Button>
              <span className="text-sm tabular-nums" aria-live="polite">
                {Math.min(index, list.length - 1) + 1} / {list.length}
              </span>
              <Button variant="secondary" size="icon" onClick={() => move(1)} aria-label="Next card">
                <ChevronRight />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={card.source} />
              {queued.has(card.id) ? (
                <Badge tone="success">In revision queue</Badge>
              ) : (
                <Button size="sm" variant="subtle" onClick={() => enqueue.mutate(card)}>
                  <ListPlus /> Add to revision
                </Button>
              )}
              {card.user_id === user?.id ? (
                <Button size="icon-sm" variant="ghost" aria-label="Delete my card" onClick={() => remove.mutate(card.id)}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="Create a flashcard">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              const parsed = flashcardSchema.safeParse({ ...draft, course_id: draft.course_id || null, lesson_id: null })
              if (!parsed.success) {
                toast.error(parsed.error.issues[0]?.message ?? 'Check the card')
                return
              }
              create.mutate()
            }}
          >
            <Field label="Question side" htmlFor="f-front">
              <Textarea id="f-front" rows={3} value={draft.front} onChange={(e) => setDraft({ ...draft, front: e.target.value })} />
            </Field>
            <Field label="Answer side" htmlFor="f-back">
              <Textarea id="f-back" rows={4} value={draft.back} onChange={(e) => setDraft({ ...draft, back: e.target.value })} />
            </Field>
            <Field label="Course" htmlFor="f-course">
              <Select id="f-course" value={draft.course_id} onValueChange={(next) => setDraft({ ...draft, course_id: next })}>
                <SelectItem value="">None</SelectItem>
                {coursesForPicker(my.taking, my.all, draft.course_id || null).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} {c.title}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit">Create card</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
