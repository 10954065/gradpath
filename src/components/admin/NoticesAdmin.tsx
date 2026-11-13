import { useQuery } from '@tanstack/react-query'
import { Download, Pencil, Pin, Plus, Upload } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { toUserMessage } from '@/lib/errors'
import { openMaterial } from '@/services/courses'
import {
  deleteMaterial,
  deleteRow,
  insertRow,
  listAllAnnouncements,
  listMaterials,
  MATERIAL_TYPES,
  setPublished,
  updateRow,
  uploadMaterial,
} from '@/services/admin'
import type { Announcement, UploadedMaterial } from '@/types/database'
import { formatDateTime } from '@/utils/dates'
import { useAdminAction, useAdminCatalogue } from './hooks'
import { ConfirmDeleteButton, PublishSwitch } from './shared'

const ANNOUNCEMENTS_KEY = ['admin', 'announcements']
const MATERIALS_KEY = ['admin', 'materials']

// --- announcements -------------------------------------------------------------------------------
export function AnnouncementAdmin() {
  const announcements = useQuery({ queryKey: ANNOUNCEMENTS_KEY, queryFn: listAllAnnouncements })
  const catalogue = useAdminCatalogue()
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const invalidate = [ANNOUNCEMENTS_KEY, ['announcements'], ['notifications']]
  const publish = useAdminAction((input: { id: string; value: boolean }) => setPublished('announcements', input.id, input.value), {
    success: 'Publication status updated',
    invalidate,
  })
  const remove = useAdminAction((id: string) => deleteRow('announcements', id), { success: 'Announcement deleted', invalidate })

  if (announcements.isError) return <ErrorState message={toUserMessage(announcements.error)} onRetry={() => void announcements.refetch()} />
  if (announcements.isPending) return <Skeleton className="h-64" />
  const codeOf = (id: string | null) => catalogue.data?.find((c) => c.id === id)?.code ?? 'All students'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">Publishing an announcement notifies every student once.</p>
        <Button onClick={() => setEditing('new')}>
          <Plus /> New announcement
        </Button>
      </div>
      {announcements.data.length === 0 ? (
        <EmptyState icon={Plus} title="No announcements yet" description="Create one to inform students about platform or course updates." />
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-surface">
          {announcements.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {a.is_pinned ? <Pin className="size-3.5 text-primary" aria-label="Pinned" /> : null}
                  <span className="font-medium">{a.title}</span>
                  <Badge>{codeOf(a.course_id)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{a.published_at ? `Published ${formatDateTime(a.published_at)}` : 'Draft'}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label={`Edit ${a.title}`}>
                <Pencil />
              </Button>
              <ConfirmDeleteButton label={a.title} disabled={remove.isPending} onConfirm={() => remove.mutate(a.id)} />
              <PublishSwitch label={a.title} checked={a.is_published} onChange={(value) => publish.mutate({ id: a.id, value })} />
            </li>
          ))}
        </ul>
      )}
      {editing ? <AnnouncementDialog announcement={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function AnnouncementDialog({ announcement, onClose }: { announcement: Announcement | null; onClose: () => void }) {
  const catalogue = useAdminCatalogue()
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')
  const [courseId, setCourseId] = useState(announcement?.course_id ?? '')
  const [isPinned, setIsPinned] = useState(announcement?.is_pinned ?? false)
  const save = useAdminAction(
    () => {
      const row = { title: title.trim(), body: body.trim(), course_id: courseId || null, is_pinned: isPinned }
      return announcement ? updateRow('announcements', announcement.id, row) : insertRow('announcements', { ...row, is_published: false })
    },
    { success: announcement ? 'Announcement saved' : 'Draft created — publish it when ready', invalidate: [ANNOUNCEMENTS_KEY, ['announcements']] },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={announcement ? 'Edit announcement' : 'New announcement'} size="lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Title" htmlFor="ann-title">
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} />
          </Field>
          <Field label="Audience" htmlFor="ann-course">
            <Select id="ann-course" value={courseId} onValueChange={(next) => setCourseId(next)}>
              <SelectItem value="">All students</SelectItem>
              {(catalogue.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Message" htmlFor="ann-body" hint="Markdown is supported. Do not state official University dates unless confirmed.">
            <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={isPinned} onCheckedChange={setIsPinned} aria-label="Pin announcement" />
            Pin to the top
          </label>
          <DialogFooter>
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

// --- uploaded course materials -------------------------------------------------------------------
const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export function MaterialsAdmin() {
  const materials = useQuery({ queryKey: MATERIALS_KEY, queryFn: () => listMaterials() })
  const catalogue = useAdminCatalogue()
  const invalidate = [MATERIALS_KEY, ['materials']]
  const publish = useAdminAction((input: { id: string; value: boolean }) => setPublished('uploaded_course_materials', input.id, input.value), {
    success: 'Publication status updated',
    invalidate,
  })
  const remove = useAdminAction(deleteMaterial, { success: 'Material deleted', invalidate })

  const codeOf = (id: string) => catalogue.data?.find((c) => c.id === id)?.code ?? ''
  return (
    <div className="flex flex-col gap-6">
      <UploadForm />
      {materials.isError ? <ErrorState message={toUserMessage(materials.error)} onRetry={() => void materials.refetch()} /> : null}
      {materials.isPending ? (
        <Skeleton className="h-40" />
      ) : (materials.data ?? []).length === 0 ? (
        <EmptyState icon={Upload} title="No uploaded materials" description="Lecture slides, handouts and course outlines you upload appear here." />
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-surface">
          {(materials.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{codeOf(m.course_id)}</span>
                  <span className="font-medium">{m.title}</span>
                  <Badge>{MATERIAL_TYPES[m.mime_type] ?? 'File'}</Badge>
                  <Badge tone="outline">{m.source}</Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {m.file_name} · {formatSize(m.size_bytes)} · uploaded {formatDateTime(m.created_at)}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => openMaterial(m).catch((e: unknown) => toast.error(toUserMessage(e)))} aria-label={`Open ${m.title}`}>
                <Download />
              </Button>
              <ConfirmDeleteButton label={m.title} disabled={remove.isPending} onConfirm={() => remove.mutate(m)} />
              <PublishSwitch label={m.title} checked={m.is_published} onChange={(value) => publish.mutate({ id: m.id, value })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UploadForm() {
  const catalogue = useAdminCatalogue()
  const [courseId, setCourseId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState<UploadedMaterial['source']>('lecturer')
  const [file, setFile] = useState<File | null>(null)
  const [formKey, setFormKey] = useState(0)
  const course = catalogue.data?.find((c) => c.id === courseId)
  const module = course?.modules.find((m) => m.id === moduleId)
  const upload = useAdminAction(
    () => {
      if (!course || !file) throw new Error('Choose a course and a file.')
      return uploadMaterial({ course, moduleId: moduleId || null, lessonId: lessonId || null, title: title.trim(), description: description.trim(), source, file })
    },
    { success: 'Uploaded — it stays hidden until you publish it', invalidate: [MATERIALS_KEY] },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    upload.mutate(undefined, {
      onSuccess: () => {
        setTitle('')
        setDescription('')
        setFile(null)
        setFormKey((k) => k + 1)
      },
    })
  }
  return (
    <form key={formKey} onSubmit={handleSubmit} className="rounded-xl border bg-surface p-4 shadow-card">
      <h3 className="font-semibold">Upload course material</h3>
      <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX, PPTX or TXT up to 25 MB. Files are private; students receive a short-lived link only after you publish.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Course" htmlFor="mat-course">
          <Select
            id="mat-course"
            value={courseId}
            required
            onValueChange={(next) => {
              setCourseId(next)
              setModuleId('')
              setLessonId('')
            }}
          >
            <SelectItem value="">Choose…</SelectItem>
            {(catalogue.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Module (optional)" htmlFor="mat-module">
          <Select
            id="mat-module"
            value={moduleId}
            disabled={!course}
            onValueChange={(next) => {
              setModuleId(next)
              setLessonId('')
            }}
          >
            <SelectItem value="">Whole course</SelectItem>
            {(course?.modules ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.title}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Lesson (optional)" htmlFor="mat-lesson">
          <Select id="mat-lesson" value={lessonId} disabled={!module} onValueChange={(next) => setLessonId(next)}>
            <SelectItem value="">Whole module</SelectItem>
            {(module?.lessons ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.title}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor="mat-title" hint="Defaults to the file name.">
          <Input id="mat-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Source" htmlFor="mat-source">
          <Select id="mat-source" value={source} onValueChange={(next) => setSource(next as UploadedMaterial['source'])}>
            <SelectItem value="lecturer">Lecturer</SelectItem>
            <SelectItem value="institutional">Institutional</SelectItem>
            <SelectItem value="supplementary">Supplementary</SelectItem>
          </Select>
        </Field>
        <Field label="File" htmlFor="mat-file">
          <Input id="mat-file" type="file" required accept={Object.keys(MATERIAL_TYPES).join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Description (optional)" htmlFor="mat-description" className="sm:col-span-3">
          <Textarea id="mat-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-16" />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={!course || !file || upload.isPending}>
          <Upload /> {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
    </form>
  )
}
