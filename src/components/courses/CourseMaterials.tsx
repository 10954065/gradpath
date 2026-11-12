import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { SourceBadge } from '@/components/courses/badges'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toUserMessage } from '@/lib/errors'
import { listCourseMaterials, openMaterial } from '@/services/courses'

/** Lecturer and institutional files an administrator has published for this course. Renders nothing when there are none. */
export function CourseMaterials({ courseId }: { courseId: string }) {
  const materials = useQuery({ queryKey: ['materials', courseId], queryFn: () => listCourseMaterials(courseId) })
  if (!materials.data?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Course materials</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {materials.data.map((m) => (
            <li key={m.id} className="text-sm">
              <button type="button" onClick={() => openMaterial(m).catch((e: unknown) => toast.error(toUserMessage(e)))} className="inline-flex items-start gap-1.5 text-left font-medium hover:underline">
                <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {m.title}
              </button>
              {m.description ? <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p> : null}
              <div className="mt-1">
                <SourceBadge source={m.source} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
