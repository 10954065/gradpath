import { BadgeCheck, CircleAlert, CircleDashed, FileText, GraduationCap, Landmark, Sparkles, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CLASSIFICATION_LABEL, type SelectionStatus } from '@/lib/curriculum'
import type { ContentSource, Course } from '@/types/database'

const SOURCE_META: Record<ContentSource, { label: string; icon: typeof FileText; tone: 'primary' | 'success' | 'neutral' | 'warning' }> = {
  lecturer: { label: 'Lecturer-provided material', icon: GraduationCap, tone: 'success' },
  institutional: { label: 'Verified institutional resource', icon: Landmark, tone: 'success' },
  supplementary: { label: 'Supplementary explanation', icon: FileText, tone: 'neutral' },
  ai_practice: { label: 'Supplementary practice questions', icon: Sparkles, tone: 'primary' },
  student: { label: 'Your own content', icon: UserRound, tone: 'neutral' },
}

/** Provenance label shown on lessons, questions and materials (see PROJECT_ARCHITECTURE.md). */
export function SourceBadge({ source }: { source: ContentSource }) {
  const meta = SOURCE_META[source]
  const Icon = meta.icon
  return (
    <Badge
      tone={meta.tone}
      title={source === 'supplementary' ? 'Original GradPath explanation, not official University of Ghana material' : undefined}
    >
      <Icon aria-hidden /> {meta.label}
    </Badge>
  )
}

/**
 * How a course sits in the programme (core, required, special topic, elective) and its credit slots. For an
 * elective, the student's own choice is shown: selected, to confirm, or not selected.
 */
export function ClassificationBadge({ course, selection }: { course: Pick<Course, 'classification' | 'credit_slots'>; selection?: SelectionStatus }) {
  const slots = `${course.credit_slots} credit slot${course.credit_slots === 1 ? '' : 's'}`
  if (course.classification !== 'elective') return <Badge>{CLASSIFICATION_LABEL[course.classification]} · {slots}</Badge>
  if (selection === 'enrolled') return <Badge tone="success">Selected elective · {slots}</Badge>
  if (selection === 'pending_confirmation') return <Badge tone="warning">Elective · confirm your choice</Badge>
  return <Badge>Elective · not selected</Badge>
}

export function VerificationBadge({ status }: { status: 'verified' | 'unverified' | 'unreachable' | 'citation' | undefined }) {
  if (status === 'verified')
    return (
      <Badge tone="success">
        <BadgeCheck aria-hidden /> Link verified
      </Badge>
    )
  if (status === 'unreachable')
    return (
      <Badge tone="danger">
        <CircleAlert aria-hidden /> Unreachable when checked
      </Badge>
    )
  if (status === 'citation' || status === undefined) return null
  return (
    <Badge tone="neutral" title="The site blocks automated checks. Open the link to confirm it.">
      <CircleDashed aria-hidden /> Not auto-verified
    </Badge>
  )
}

const ACCENTS: Record<string, string> = {
  indigo: 'bg-indigo-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
}

export function accentClass(accent: string): string {
  return ACCENTS[accent] ?? 'bg-primary'
}
