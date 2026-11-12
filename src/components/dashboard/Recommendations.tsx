import { ArrowRight, BookOpen, CalendarClock, ClipboardCheck, Flame, Lightbulb, RefreshCcw, Target, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import type { Recommendation } from '@/lib/recommendations'

const ICONS: Record<Recommendation['kind'], typeof BookOpen> = {
  revision: RefreshCcw,
  deadline: CalendarClock,
  'weak-topic': Target,
  continue: BookOpen,
  assessment: ClipboardCheck,
  'mock-exam': ClipboardCheck,
  insight: TrendingUp,
  start: Flame,
  pace: Lightbulb,
}

export function RecommendationList({ items, limit = 5 }: { items: Recommendation[]; limit?: number }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">You are on track. Keep following your study plan.</p>
  return (
    <ul className="flex flex-col gap-2">
      {items.slice(0, limit).map((r) => {
        const Icon = ICONS[r.kind]
        return (
          <li key={r.id}>
            <Link to={r.href} className="group flex items-start gap-3 rounded-lg border bg-surface p-3 hover:border-primary/40">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Why: {r.reason}</span>
              </span>
              <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
