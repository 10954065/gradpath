import { useState, type ChangeEvent } from 'react'
import { useAdminAction } from '@/components/admin/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { parseTimetableCsv } from '@/lib/officialTimetable'
import { importVersion, OFFICIAL_TIMETABLE_KEY, updateSource, type TimetableSource } from '@/services/timetable/official'

const MAX_FILE_BYTES = 200_000

/**
 * Source details and the import of a revised official timetable. An import creates a new version; the previous
 * version and its history are kept, and students are asked to confirm their sessions again.
 */
export function TimetableImport({ source }: { source: TimetableSource | null }) {
  const [title, setTitle] = useState(source?.title ?? '')
  const [url, setUrl] = useState(source?.source_url ?? '')
  const [note, setNote] = useState(source?.source_note ?? '')
  const [startedOn, setStartedOn] = useState(source?.teaching_started_on ?? '')
  const [csv, setCsv] = useState('')
  const [revisedTitle, setRevisedTitle] = useState(source ? `${source.title} (revised)` : '')
  const [academicYear, setAcademicYear] = useState(source?.academic_year ?? '')
  const [semester, setSemester] = useState(source?.semester ?? 'Semester 1')
  const [notify, setNotify] = useState(true)
  const parsed = csv.trim() ? parseTimetableCsv(csv) : null

  const saveSource = useAdminAction(() => updateSource(source?.id as string, { title: title.trim(), source_url: url.trim() || null, source_note: note.trim(), teaching_started_on: startedOn || null }), {
    success: 'Source details saved',
    invalidate: [[...OFFICIAL_TIMETABLE_KEY]],
  })
  const runImport = useAdminAction(
    () =>
      importVersion(
        {
          slug: `itb-${academicYear.replace('/', '-')}-${semester.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${(source?.version ?? 0) + 1}`,
          title: revisedTitle.trim(),
          academic_year: academicYear.trim(),
          semester: semester.trim(),
          programme_code: source?.programme_code ?? 'ITB',
          source_url: url.trim(),
          source_note: note.trim(),
        },
        parsed?.sessions ?? [],
        notify,
      ),
    { success: 'Revised timetable imported as a new version', invalidate: [[...OFFICIAL_TIMETABLE_KEY], ['admin', 'timetable']] },
  )

  const readFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) return void setCsv('')
    void file.text().then(setCsv)
  }
  const canImport = Boolean(parsed && !parsed.errors.length && revisedTitle.trim() && /^\d{4}\/\d{4}$/.test(academicYear.trim()) && semester.trim())

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {source ? (
        <Card>
          <CardHeader>
            <CardTitle>Source details</CardTitle>
            <CardDescription>Shown to students with the timetable. Say what was checked against the original and what was not.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Title" htmlFor="src-title">
              <Input id="src-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Official web page (https)" htmlFor="src-url">
              <Input id="src-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Field label="Lectures begin on" htmlFor="src-started" hint="No official lecture is shown or reminded before this day. Students' study weeks follow it unless they set their own start in Settings.">
              <Input id="src-started" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </Field>
            <Field label="Source note" htmlFor="src-note">
              <Textarea id="src-note" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div>
              <Button onClick={() => saveSource.mutate(undefined)} disabled={saveSource.isPending || !title.trim() || (Boolean(url.trim()) && !url.trim().startsWith('https://'))}>
                Save source details
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Upload a revised official timetable</CardTitle>
          <CardDescription>
            One session per line: day, start, end, course code, venue (24-hour Ghana time), for example “Monday,19:30,21:30,CSIT 601,Earth Science Room 1”.
            Upload a .csv file or paste the lines.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field label="CSV file" htmlFor="tt-file" hint="Up to 200 KB.">
            <Input id="tt-file" type="file" accept=".csv,text/csv,text/plain" onChange={readFile} />
          </Field>
          <Field label="Sessions" htmlFor="tt-csv">
            <Textarea id="tt-csv" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Title" htmlFor="tt-new-title" className="sm:col-span-3">
              <Input id="tt-new-title" maxLength={200} value={revisedTitle} onChange={(e) => setRevisedTitle(e.target.value)} />
            </Field>
            <Field label="Academic year" htmlFor="tt-year">
              <Input id="tt-year" placeholder="2026/2027" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
            </Field>
            <Field label="Semester" htmlFor="tt-semester" className="sm:col-span-2">
              <Input id="tt-semester" value={semester} onChange={(e) => setSemester(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Notify students who take an affected course
          </label>
          {parsed?.errors.length ? (
            <Alert tone="danger" title="Fix these lines first">
              {parsed.errors.slice(0, 8).join(' ')}
            </Alert>
          ) : parsed ? (
            <Alert>{parsed.sessions.length} sessions ready to import. Course codes are checked against the course list when you import.</Alert>
          ) : null}
          <div>
            <Button disabled={!canImport || runImport.isPending} onClick={() => runImport.mutate(undefined)}>
              Import as a new version
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
