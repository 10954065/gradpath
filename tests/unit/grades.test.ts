import { describe, expect, it } from 'vitest'
import { courseStanding, formatMark, gradeFor, gradePointAverage, UG_GRADES, type MarkItem } from '@/lib/grades'

describe('the University of Ghana masters grading scale (Regulations 2025, Table 5)', () => {
  it('maps marks to grades and grade points', () => {
    expect(UG_GRADES.map((b) => [b.grade, b.min, b.point])).toEqual([
      ['A', 80, 4],
      ['B+', 70, 3.5],
      ['B', 60, 3],
      ['C', 50, 2],
      ['D', 30, 1.5],
      ['F', 0, 1],
    ])
    expect(gradeFor(80).grade).toBe('A')
    expect(gradeFor(79.6).grade).toBe('B+')
    expect(gradeFor(50).pass).toBe(true)
    expect(gradeFor(49.9)).toMatchObject({ grade: 'D', pass: false })
    expect(gradeFor(0).grade).toBe('F')
  })
})

const coursework = (weight: number, score: number | null, max = 100): MarkItem => ({ component: 'coursework', weight_percent: weight, score, max_score: max })
const exam = (weight: number, score: number | null): MarkItem => ({ component: 'examination', weight_percent: weight, score, max_score: 100 })

describe('a course standing', () => {
  it('is empty before any mark', () => {
    const s = courseStanding([coursework(30, null), exam(70, null)])
    expect(s).toMatchObject({ weightTotal: 100, weightMarked: 0, earned: 0, average: null, remaining: 100, final: null, grade: null })
    expect(s.targets.map((t) => [t.band.grade, t.needed])).toEqual([
      ['A', 80],
      ['B+', 70],
      ['B', 60],
      ['C', 50],
    ])
  })

  it('shows the average so far and what the examination needs for each grade', () => {
    // Two tests worth 15% each: 20/25 and 26/30.
    const s = courseStanding([coursework(15, 20, 25), coursework(15, 26, 30), exam(70, null)])
    expect(s.earned).toBe(25)
    expect(s.average).toBe(83.33)
    expect(s.grade?.grade).toBe('A')
    expect(s.remaining).toBe(70)
    expect(s.targets.map((t) => [t.band.grade, t.status, t.needed])).toEqual([
      ['A', 'possible', 78.6],
      ['B+', 'possible', 64.3],
      ['B', 'possible', 50],
      ['C', 'possible', 35.8],
    ])
  })

  it('marks grades as secured or out of reach', () => {
    const strong = courseStanding([coursework(60, 100), exam(40, null)])
    expect(strong.targets.find((t) => t.band.grade === 'C')?.status).toBe('secured')
    const weak = courseStanding([coursework(60, 10), exam(40, null)])
    expect(weak.targets.find((t) => t.band.grade === 'A')).toMatchObject({ status: 'out-of-reach', needed: null })
  })

  it('gives the final mark and grade once every component is marked', () => {
    // 24/30 coursework (24 points) and 61% in the examination (42.7 points).
    const s = courseStanding([coursework(30, 24, 30), exam(70, 61)])
    expect(s.final).toBe(66.7)
    expect(s.grade?.grade).toBe('B')
    expect(s.targets.find((t) => t.band.grade === 'B+')?.status).toBe('out-of-reach')
  })
})

describe('grade point average', () => {
  it('weights grade points by credits and ignores courses without a mark', () => {
    // A (4.0) in a 3-credit course, B (3.0) in a 3-credit course, C (2.0) in a 1-credit course: 23 / 7.
    expect(gradePointAverage([{ credits: 3, mark: 85 }, { credits: 3, mark: 65 }, { credits: 1, mark: 55 }, { credits: 3, mark: null }])).toBe(3.29)
    expect(gradePointAverage([{ credits: 3, mark: null }])).toBeNull()
  })

  it('formats marks without needless decimals', () => {
    expect(formatMark(78)).toBe('78')
    expect(formatMark(78.57)).toBe('78.6')
  })
})
