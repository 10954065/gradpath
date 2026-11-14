import { describe, expect, it } from 'vitest'
import { buildCalendar, escapeText, firstOnOrAfter, fold, type CalendarFeed } from '@/lib/ics'

const NOW = new Date('2026-11-14T10:00:00Z')

const feed: CalendarFeed = {
  lecturesStartOn: '2026-11-16',
  lectures: [
    { id: 'l601', code: 'CSIT 601', title: 'Research Methods', day_of_week: 1, start_time: '19:30', end_time: '21:30', venue: 'Earth Science Room 1' },
    { id: 'l613', code: 'CSIT 613', title: 'Elective', day_of_week: 6, start_time: '07:30', end_time: '09:30', venue: 'Earth Science Room 2' },
  ],
  events: [
    { id: 'w1', title: 'CSIT 601 preview', kind: 'study', recurrence: 'weekly', day_of_week: 0, event_date: null, start_time: '16:00', end_time: '17:00', starts_on: null, ends_on: '2027-02-28', created_on: '2026-11-13', location: '', notes: 'Read ahead; then summarise, briefly' },
    { id: 'o1', title: 'CSIT 601 revision: Foundations', kind: 'revision', recurrence: 'once', day_of_week: null, event_date: '2027-03-05', start_time: '18:00', end_time: '19:30', starts_on: null, ends_on: null, created_on: '2026-11-14', location: '', notes: '' },
    { id: 'gone', title: 'Ended block', kind: 'study', recurrence: 'weekly', day_of_week: 2, event_date: null, start_time: '10:00', end_time: '11:00', starts_on: '2026-11-13', ends_on: '2026-11-15', created_on: '2026-11-13', location: '', notes: '' },
  ],
  exams: [{ id: 'x1', title: 'CSIT 601 examination', due_at: '2027-03-12T09:00:00+00:00', description: 'Venue: Great Hall' }],
}

describe('the calendar subscription', () => {
  const ics = buildCalendar(feed, NOW)
  const unfolded = ics.replace(/\r\n /g, '')

  it('is a valid calendar with CRLF line endings that apps refresh', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('X-WR-CALNAME:GradPath')
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H')
    expect(ics.split('BEGIN:VEVENT')).toHaveLength(6)
  })

  it('repeats each lecture weekly from its first day once lectures begin, in Ghana time (UTC)', () => {
    expect(unfolded).toContain('UID:lecture-l601@gradpath\r\nDTSTAMP:20261114T100000Z\r\nDTSTART:20261116T193000Z\r\nDTEND:20261116T213000Z\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:CSIT 601 lecture\r\nLOCATION:Earth Science Room 1')
    // The Saturday lecture starts on 21 November, not the 14th or 15th before teaching begins.
    expect(unfolded).toContain('DTSTART:20261121T073000Z')
  })

  it('includes weekly blocks until their end date, one-off blocks, and exams with a reminder the day before', () => {
    expect(unfolded).toContain('DTSTART:20261115T160000Z\r\nDTEND:20261115T170000Z\r\nRRULE:FREQ=WEEKLY;UNTIL=20270228T235959Z\r\nSUMMARY:CSIT 601 preview')
    expect(unfolded).toContain('DESCRIPTION:Read ahead\\; then summarise\\, briefly')
    expect(unfolded).toContain('DTSTART:20270305T180000Z\r\nDTEND:20270305T193000Z\r\nSUMMARY:CSIT 601 revision: Foundations\r\nCATEGORIES:Revision')
    expect(unfolded).not.toContain('Ended block')
    expect(unfolded).toContain('UID:exam-x1@gradpath\r\nDTSTAMP:20261114T100000Z\r\nDTSTART:20270312T090000Z\r\nDTEND:20270312T120000Z\r\nSUMMARY:CSIT 601 examination\r\nLOCATION:Great Hall')
    expect(unfolded).toContain('TRIGGER:-P1D')
  })
})

describe('calendar text', () => {
  it('finds the first weekday on or after a date', () => {
    expect(firstOnOrAfter('2026-11-16', 1)).toBe('2026-11-16')
    expect(firstOnOrAfter('2026-11-16', 0)).toBe('2026-11-22')
  })

  it('escapes special characters and folds long lines at 75 octets without splitting characters', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const line = `DESCRIPTION:${'é'.repeat(60)}`
    const folded = fold(line)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })
})
