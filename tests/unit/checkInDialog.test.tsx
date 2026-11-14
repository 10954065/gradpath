import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckInDialog } from '@/components/lectures/CheckInDialog'
import type { OfficialSession } from '@/lib/officialTimetable'

const save = vi.fn()
const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const ENTRY = '33333333-3333-4333-8333-333333333333'

vi.mock('@/hooks/useLectureLogs', () => ({
  useLectureLogs: () => ({
    courses: [
      {
        id: 'course-601',
        modules: [
          {
            id: 'm1',
            title: 'Foundations',
            lessons: [
              { id: L1, title: 'What a research question is', slug: 'question' },
              { id: L2, title: 'Reviewing the literature', slug: 'literature' },
            ],
          },
        ],
      },
    ],
    paces: new Map([['course-601', { lectureReach: 1 }]]),
    save,
    saving: false,
  }),
}))

const session = {
  id: ENTRY,
  courseId: 'course-601',
  code: 'CSIT 601',
  title: 'Research Methods',
  dayOfWeek: 1,
  start: '19:30',
  end: '21:30',
} as OfficialSession

beforeEach(() => save.mockReset())

describe('the check-in dialog', () => {
  it('saves the lessons covered and the ones to review, and suggests the next lesson in order', async () => {
    const user = userEvent.setup()
    render(<CheckInDialog target={{ session, date: '2026-11-16' }} onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'CSIT 601 check-in' })).toHaveTextContent('Monday 16 Nov')
    expect(screen.getByText('Next in order').closest('label')).toHaveTextContent('Reviewing the literature')

    await user.click(screen.getByRole('checkbox', { name: /^What a research question is/ }))
    await user.click(screen.getByRole('checkbox', { name: /^Reviewing the literature/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Review Reviewing the literature later' }))
    // Unticking a lesson also drops it from review.
    await user.click(screen.getByRole('checkbox', { name: /^What a research question is/ }))
    await user.type(screen.getByLabelText('Notes from the lecture'), 'Proposal due in week 4.')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0]).toEqual({
      courseId: 'course-601',
      courseCode: 'CSIT 601',
      input: {
        entry_id: ENTRY,
        held_on: '2026-11-16',
        attendance: 'attended',
        covered_lesson_ids: [L2],
        review_lesson_ids: [L2],
        note: 'Proposal due in week 4.',
      },
    })
  })

  it('records a cancelled lecture without lessons', async () => {
    const user = userEvent.setup()
    render(
      <CheckInDialog
        target={{
          session,
          date: '2026-11-16',
          existing: { id: 'g', entry_id: ENTRY, course_id: 'course-601', held_on: '2026-11-16', attendance: 'attended', covered_lesson_ids: [L1], review_lesson_ids: [L1], note: '', updated_at: '' },
        }}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByRole('checkbox', { name: /^What a research question is/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Cancelled/ }))
    expect(screen.queryByText('What did it cover?')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(save.mock.calls[0]?.[0].input).toMatchObject({ attendance: 'cancelled', covered_lesson_ids: [], review_lesson_ids: [] })
  })
})
