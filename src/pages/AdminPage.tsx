import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { AssessmentAdmin } from '@/components/admin/AssessmentAdmin'
import { ContentAdmin } from '@/components/admin/ContentAdmin'
import { useAdminAction, useAdminCatalogue } from '@/components/admin/hooks'
import { AnnouncementAdmin, MaterialsAdmin } from '@/components/admin/NoticesAdmin'
import { ResourceAdmin } from '@/components/admin/ResourceAdmin'
import { Button } from '@/components/ui/button'
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form-controls'
import { PageHeader, StatTile } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toUserMessage } from '@/lib/errors'
import { listAllResources, updateSettings } from '@/services/admin'
import { getPlatformSettings } from '@/services/study/overview'
import type { PlatformSettings } from '@/types/database'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'content', label: 'Content' },
  { value: 'assessments', label: 'Assessments' },
  { value: 'resources', label: 'Resources' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'materials', label: 'Materials' },
  { value: 'settings', label: 'Settings' },
] as const

export default function AdminPage() {
  const [tab, setTab] = useState<string>('overview')
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Admin console"
        description="Manage courses, lessons, assessments, resources, announcements and uploaded materials. Every change is enforced by row-level security on the server."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Admin sections">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="content">
          <ContentAdmin />
        </TabsContent>
        <TabsContent value="assessments">
          <AssessmentAdmin />
        </TabsContent>
        <TabsContent value="resources">
          <ResourceAdmin />
        </TabsContent>
        <TabsContent value="announcements">
          <AnnouncementAdmin />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialsAdmin />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </>
  )
}

function Overview() {
  const catalogue = useAdminCatalogue()
  const resources = useQuery({ queryKey: ['admin', 'resources'], queryFn: listAllResources })
  if (catalogue.isError) return <ErrorState message={toUserMessage(catalogue.error)} onRetry={() => void catalogue.refetch()} />
  if (catalogue.isPending || resources.isPending) return <Skeleton className="h-40" />

  const lessons = catalogue.data.flatMap((c) => c.modules.flatMap((m) => m.lessons))
  const hiddenLessons = lessons.filter((l) => !l.is_published).length
  const words = lessons.reduce((sum, l) => sum + l.word_count, 0)
  const byStatus = (status: string) => (resources.data ?? []).filter((r) => r.verification_status === status).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Courses" value={catalogue.data.length} hint={`${catalogue.data.filter((c) => !c.is_published).length} hidden`} />
        <StatTile label="Modules" value={catalogue.data.reduce((sum, c) => sum + c.modules.length, 0)} />
        <StatTile label="Lessons" value={lessons.length} hint={`${hiddenLessons} hidden · ${Math.round(words / 1000)}k words`} />
        <StatTile
          label="Resources"
          value={resources.data?.length ?? 0}
          hint={`${byStatus('verified')} verified · ${byStatus('unverified')} unverified · ${byStatus('unreachable')} unreachable`}
        />
      </div>
      {byStatus('unreachable') > 0 ? (
        <Alert tone="warning" title="Some resource links are unreachable">
          Review them on the Resources tab: re-check, replace the address, or hide them from students.
        </Alert>
      ) : null}
      <Alert title="Content provenance">
        Practice questions and lesson content generated for GradPath are labelled as supplementary. Mark lecturer or institutional uploads with the correct source on the
        Materials tab, and do not present unconfirmed dates or policies as official.
      </Alert>
    </div>
  )
}

function SettingsPanel() {
  const settings = useQuery({ queryKey: ['platform-settings'], queryFn: getPlatformSettings })
  if (settings.isError) return <ErrorState message={toUserMessage(settings.error)} onRetry={() => void settings.refetch()} />
  if (settings.isPending) return <Skeleton className="h-48" />
  return <SettingsForm key={settings.data.updated_at} settings={settings.data} />
}

// Bounds mirror the platform_settings check constraints.
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value) || min))

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [mastery, setMastery] = useState(settings.mastery_threshold)
  const [mockMinutes, setMockMinutes] = useState(settings.default_mock_exam_minutes)
  const [grace, setGrace] = useState(settings.attempt_grace_seconds)
  const save = useAdminAction(
    () => updateSettings({ mastery_threshold: clamp(mastery, 50, 100), default_mock_exam_minutes: clamp(mockMinutes, 10, 300), attempt_grace_seconds: clamp(grace, 0, 900) }),
    { success: 'Settings saved', invalidate: [['platform-settings']] },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(undefined)
  }
  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4 rounded-xl border bg-surface p-5 shadow-card">
      <Field label="Mastery threshold (%)" htmlFor="set-mastery" hint="Score needed to master a lesson or pass an assessment without its own pass mark. Default 80.">
        <Input id="set-mastery" type="number" min={50} max={100} value={mastery} onChange={(e) => setMastery(Number(e.target.value))} />
      </Field>
      <Field label="Default mock exam length (minutes)" htmlFor="set-mock">
        <Input id="set-mock" type="number" min={10} max={300} value={mockMinutes} onChange={(e) => setMockMinutes(Number(e.target.value))} />
      </Field>
      <Field label="Submission grace period (seconds)" htmlFor="set-grace" hint="Extra time allowed after a timer expires, to absorb network delays.">
        <Input id="set-grace" type="number" min={0} max={900} value={grace} onChange={(e) => setGrace(Number(e.target.value))} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  )
}
