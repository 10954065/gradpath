import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { VerificationBadge } from '@/components/courses/badges'
import { toUserMessage } from '@/lib/errors'
import { deleteRow, insertRow, listAllResources, setPublished, updateRow, verifyResource } from '@/services/admin'
import type { LessonResource, ResourceCategory } from '@/types/database'
import { useAdminAction, useAdminCatalogue } from './hooks'
import { ConfirmDeleteButton, PublishSwitch } from './shared'

const RESOURCES_KEY = ['admin', 'resources']
const INVALIDATE = [RESOURCES_KEY, ['resources']]
const CATEGORIES: ResourceCategory[] = ['database', 'course', 'documentation', 'tool', 'guide', 'standard', 'organisation', 'video', 'reference']
const STAGES: LessonResource['stage'][] = ['foundation', 'core', 'advanced', 'revision']
const ACCESS: LessonResource['access_type'][] = ['free', 'freemium', 'registration', 'paid', 'unknown']

export function ResourceAdmin() {
  const resources = useQuery({ queryKey: RESOURCES_KEY, queryFn: listAllResources })
  const catalogue = useAdminCatalogue()
  const [courseId, setCourseId] = useState('')
  const [editing, setEditing] = useState<LessonResource | 'new' | null>(null)
  const publish = useAdminAction((input: { id: string; value: boolean }) => setPublished('lesson_resources', input.id, input.value), {
    success: 'Publication status updated',
    invalidate: INVALIDATE,
  })
  const verify = useAdminAction(verifyResource, { success: 'Link checked', invalidate: INVALIDATE })
  const remove = useAdminAction((id: string) => deleteRow('lesson_resources', id), { success: 'Resource deleted', invalidate: INVALIDATE })

  if (resources.isError) return <ErrorState message={toUserMessage(resources.error)} onRetry={() => void resources.refetch()} />
  if (resources.isPending) return <Skeleton className="h-96" />

  const codeOf = (id: string) => catalogue.data?.find((c) => c.id === id)?.code ?? ''
  const visible = resources.data.filter((r) => !courseId || r.course_id === courseId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-auto">
          <option value="">All courses ({resources.data.length})</option>
          {(catalogue.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <Button onClick={() => setEditing('new')}>
          <Plus /> Add resource
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        “Check link” asks the server whether the address responds. Sites that block automated checks are recorded as unverified rather than broken.
      </p>
      <ul className="flex flex-col divide-y rounded-xl border bg-surface">
        {visible.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{codeOf(r.course_id)}</span>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                  {r.title} <ExternalLink className="size-3" aria-hidden />
                </a>
                <VerificationBadge status={r.verification_status} />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.provider} · {r.category} · {r.verification_note || 'Not yet checked'}
              </p>
            </div>
            <Button size="sm" variant="ghost" disabled={verify.isPending} onClick={() => verify.mutate(r)}>
              <ShieldCheck /> Check link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.title}`}>
              <Pencil />
            </Button>
            <ConfirmDeleteButton label={r.title} disabled={remove.isPending} onConfirm={() => remove.mutate(r.id)} />
            <PublishSwitch label={r.title} checked={r.is_published} onChange={(value) => publish.mutate({ id: r.id, value })} />
          </li>
        ))}
      </ul>
      {editing ? <ResourceDialog resource={editing === 'new' ? null : editing} defaultCourseId={courseId} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function ResourceDialog({ resource, defaultCourseId, onClose }: { resource: LessonResource | null; defaultCourseId: string; onClose: () => void }) {
  const catalogue = useAdminCatalogue()
  const [form, setForm] = useState({
    course_id: resource?.course_id ?? defaultCourseId,
    title: resource?.title ?? '',
    description: resource?.description ?? '',
    provider: resource?.provider ?? '',
    url: resource?.url ?? '',
    category: resource?.category ?? ('reference' as ResourceCategory),
    difficulty: resource?.difficulty ?? 'intermediate',
    stage: resource?.stage ?? 'core',
    access_type: resource?.access_type ?? 'free',
  })
  const [error, setError] = useState<string | undefined>()
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const save = useAdminAction(
    () => {
      const row = { ...form, title: form.title.trim(), url: form.url.trim(), provider: form.provider.trim(), description: form.description.trim() }
      if (resource) {
        const urlChanged = row.url !== resource.url
        return updateRow('lesson_resources', resource.id, urlChanged ? { ...row, verification_status: 'unverified', verification_note: 'Address changed; not yet checked', last_verified_at: null } : row)
      }
      return insertRow('lesson_resources', { ...row, verification_status: 'unverified', verification_note: 'Not yet checked', is_published: false })
    },
    { success: resource ? 'Resource saved' : 'Resource added (hidden until published)', invalidate: INVALIDATE },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isHttpsUrl(form.url.trim())) return setError('Enter a full https:// address.')
    setError(undefined)
    save.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={resource ? 'Edit resource' : 'Add resource'} size="lg">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Course" htmlFor="res-course">
            <Select id="res-course" value={form.course_id} onChange={(e) => set('course_id', e.target.value)} required>
              <option value="">Choose…</option>
              {(catalogue.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Provider" htmlFor="res-provider">
            <Input id="res-provider" value={form.provider} onChange={(e) => set('provider', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Title" htmlFor="res-title" className="sm:col-span-2">
            <Input id="res-title" value={form.title} onChange={(e) => set('title', e.target.value)} required minLength={2} maxLength={200} />
          </Field>
          <Field label="Address (URL)" htmlFor="res-url" error={error} className="sm:col-span-2">
            <Input id="res-url" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} required aria-invalid={Boolean(error)} />
          </Field>
          <Field label="Description" htmlFor="res-description" className="sm:col-span-2">
            <Textarea id="res-description" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
          </Field>
          <Field label="Category" htmlFor="res-category">
            <Select id="res-category" value={form.category} onChange={(e) => set('category', e.target.value as ResourceCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Difficulty" htmlFor="res-difficulty">
            <Select id="res-difficulty" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as LessonResource['difficulty'])}>
              <option>introductory</option>
              <option>intermediate</option>
              <option>advanced</option>
            </Select>
          </Field>
          <Field label="Stage" htmlFor="res-stage">
            <Select id="res-stage" value={form.stage} onChange={(e) => set('stage', e.target.value as LessonResource['stage'])}>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Access" htmlFor="res-access">
            <Select id="res-access" value={form.access_type} onChange={(e) => set('access_type', e.target.value as LessonResource['access_type'])}>
              {ACCESS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
