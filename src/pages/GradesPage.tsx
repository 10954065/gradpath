import { Award, Scale, ShieldCheck } from 'lucide-react'
import { CourseGradeCard } from '@/components/grades/GradeParts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, Skeleton } from '@/components/ui/feedback'
import { PageHeader, StatTile } from '@/components/ui/page'
import { useCourseMarks } from '@/hooks/useCourseMarks'
import { toUserMessage } from '@/lib/errors'
import { GRADE_SOURCE, MAX_C_OR_LOWER, MIN_FINAL_GPA, UG_GRADES } from '@/lib/grades'

const gpaText = (gpa: number | null) => (gpa === null ? '–' : gpa.toFixed(2))

export default function GradesPage() {
  const grades = useCourseMarks()

  if (grades.error) return <ErrorState message={toUserMessage(grades.error)} />

  return (
    <>
      <PageHeader
        eyebrow="You"
        title="My Grades"
        description="Your official marks as they are released, the grade they give in each course and what you need in the rest to reach each grade. Private to you; nothing here is estimated except where it says projected."
      />
      {grades.isPending ? (
        <Skeleton className="h-[50vh]" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="Grade point average"
              value={<span data-testid="gpa">{gpaText(grades.gpa)}</span>}
              hint={grades.finishedCourses ? `From ${grades.finishedCourses} course${grades.finishedCourses === 1 ? '' : 's'} with every component marked` : 'Shown once a course has every component marked'}
              icon={<Award className="size-4" aria-hidden />}
            />
            <StatTile
              label="Projected grade point average"
              value={<span data-testid="projected-gpa">{gpaText(grades.projectedGpa)}</span>}
              hint="Final marks where known, otherwise your average so far"
              icon={<Scale className="size-4" aria-hidden />}
            />
            <StatTile
              label="Grades of C or lower"
              value={`${grades.cOrLower} of ${MAX_C_OR_LOWER} allowed`}
              hint={`Good standing also needs a final GPA of ${MIN_FINAL_GPA.toFixed(2)} or better`}
              icon={<ShieldCheck className="size-4" aria-hidden />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {grades.courses.map((c) => (
              <CourseGradeCard key={c.course.id} course={c.course} items={c.items} standing={c.standing} />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>How grades are worked out</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="overflow-x-auto">
                <table className="w-full max-w-md text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Grade</th>
                      <th className="py-1 font-medium">Marks</th>
                      <th className="py-1 font-medium">Grade point</th>
                      <th className="py-1 font-medium">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {UG_GRADES.map((b, i) => (
                      <tr key={b.grade} className="border-t">
                        <td className="py-1 font-semibold">{b.grade}</td>
                        <td className="py-1 tabular-nums">
                          {b.min}–{i === 0 ? 100 : (UG_GRADES[i - 1] as { min: number }).min - 1}
                        </td>
                        <td className="py-1 tabular-nums">{b.point.toFixed(2)}</td>
                        <td className="py-1">{b.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">
                Source: {GRADE_SOURCE}. A, B+, B and C are pass grades (3.25.1). The grade point average is the grade points times the
                credits of each course, divided by the credits (3.24.3). A final GPA of {MIN_FINAL_GPA.toFixed(2)} or better is required at the end of
                course work (3.23.4), with no more than {MAX_C_OR_LOWER} grades of C or lower (3.23.1). The regulations do not say how marks are
                rounded, so GradPath never rounds a mark up. Coursework and examination weights come from your course outlines, which you enter.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
