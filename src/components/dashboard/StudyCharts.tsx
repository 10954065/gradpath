import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { fontSize: 11, fill: 'var(--color-muted-foreground)' }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }

/** Weekly study hours (completed sessions) against planned time. */
export function WeeklyStudyChart({ weeks, targetHours }: { weeks: { start: Date; completedMinutes: number; plannedMinutes: number }[]; targetHours: number }) {
  const data = weeks.map((w) => ({
    week: format(w.start, 'd MMM'),
    studied: Math.round((w.completedMinutes / 60) * 10) / 10,
    planned: Math.round((w.plannedMinutes / 60) * 10) / 10,
  }))
  return (
    <figure>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: 'var(--color-muted)' }}
              formatter={(v: number, n: string) => [`${v} h`, n === 'studied' ? 'Studied' : 'Planned']}
            />
            <Bar dataKey="planned" fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="studied" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Weekly study hours: {data.map((d) => `${d.week}: ${d.studied} hours studied of ${d.planned} planned`).join('; ')}. Target {targetHours} hours.
      </figcaption>
    </figure>
  )
}

/** Average best score per course (practice assessments only). */
export function CoursePerformanceChart({ data }: { data: { code: string; score: number }[] }) {
  return (
    <figure>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} unit="%" />
            <YAxis type="category" dataKey="code" tick={axis} tickLine={false} axisLine={false} width={64} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-muted)' }} formatter={(v: number) => [`${v}%`, 'Average best score']} />
            <Bar dataKey="score" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Average best practice score by course: {data.map((d) => `${d.code} ${d.score}%`).join(', ')}.</figcaption>
    </figure>
  )
}

/** Score trend over submitted attempts. */
export function ScoreTrendChart({ data }: { data: { label: string; score: number }[] }) {
  return (
    <figure>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} unit="%" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'Score']} />
            <Line type="monotone" dataKey="score" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Assessment scores over time: {data.map((d) => `${d.label} ${d.score}%`).join(', ')}.</figcaption>
    </figure>
  )
}
