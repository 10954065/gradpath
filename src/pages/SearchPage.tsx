import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form-controls'
import { PageHeader } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { plainText } from '@/lib/markdown'
import { useMyCourses } from '@/hooks/useMyCourses'
import { searchContent } from '@/services/study/overview'
import type { SearchResult } from '@/types/database'

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  course: 'Courses',
  module: 'Modules',
  lesson: 'Lessons and topics',
  resource: 'Resources',
  note: 'My notes',
  assignment: 'My assignments',
}
const ORDER: SearchResult['kind'][] = ['lesson', 'module', 'course', 'resource', 'note', 'assignment']

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [kind, setKind] = useState<SearchResult['kind'] | ''>('')
  const [text, setText] = useState(q)
  const raw = useQuery({ queryKey: ['search', q], queryFn: () => searchContent(q), enabled: q.trim().length >= 2 })
  const my = useMyCourses()
  // Course content from courses the student does not take is left out; their own notes and deadlines always show.
  const notTaken = new Set(my.summary.notTaking.map((c) => c.code))
  const results = { ...raw, data: raw.data?.filter((r) => !r.course_code || !notTaken.has(r.course_code)) }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim().length >= 2) setParams({ q: text.trim() })
  }
  const list = (results.data ?? []).filter((r) => !kind || r.kind === kind)
  const counts = new Map<string, number>()
  for (const r of results.data ?? []) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)

  return (
    <>
      <PageHeader title="Search" description="Search courses, modules, lessons, topics and resources, plus your own notes and assignments, which only you can see." />
      <form onSubmit={onSubmit} role="search" className="mb-5 flex max-w-2xl gap-2">
        <Input aria-label="Search" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. thematic analysis, BPMN gateways, hashing" />
        <Button type="submit">
          <Search /> Search
        </Button>
      </form>
      {results.data?.length ? (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter results">
          <Button size="sm" variant={kind === '' ? 'primary' : 'secondary'} onClick={() => setKind('')}>
            All ({results.data.length})
          </Button>
          {ORDER.filter((k) => counts.get(k)).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? 'primary' : 'secondary'} onClick={() => setKind(k)}>
              {KIND_LABEL[k]} ({counts.get(k)})
            </Button>
          ))}
        </div>
      ) : null}
      {results.isError ? <ErrorState message={toUserMessage(results.error)} onRetry={() => void results.refetch()} /> : null}
      {q.trim().length < 2 ? (
        <EmptyState icon={Search} title="Search GradPath" description="Type at least two characters." />
      ) : results.isPending ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <EmptyState icon={Search} title="No results" description={`Nothing matched “${q}”. Try a broader term.`} />
      ) : (
        <ul className="flex max-w-3xl flex-col gap-2">
          {list.map((r) => (
            <li key={`${r.kind}-${r.item_id}`}>
              <Link to={r.url} className="block rounded-xl border bg-surface p-4 hover:border-primary/40">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{KIND_LABEL[r.kind].replace(/s$/, '').replace('Lessons and topic', 'Lesson')}</Badge>
                  {r.course_code ? <span className="text-xs font-semibold text-muted-foreground">{r.course_code}</span> : null}
                </span>
                <span className="mt-1 block font-medium">{r.title}</span>
                {r.snippet ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{plainText(r.snippet, 220)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
