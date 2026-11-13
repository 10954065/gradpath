import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { LESSON_DAYS_KEY } from '@/hooks/useLessonStreak'
import { readingPercentFromScroll } from '@/lib/progress'
import { saveReading } from '@/services/progress'

const SAVE_INTERVAL_MS = 15_000

interface TrackerOptions {
  userId: string | undefined
  lessonId: string | undefined
  initialPercent: number
  initialSeconds: number
}

/**
 * Tracks how far the student has read and how long they have spent on the lesson (only while the tab is
 * visible), saving periodically and when the page is hidden. Never marks a lesson complete.
 */
export function useReadingTracker(articleRef: RefObject<HTMLElement | null>, options: TrackerOptions) {
  const { userId, lessonId, initialPercent, initialSeconds } = options
  const [percent, setPercent] = useState(initialPercent)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const maxPercent = useRef(initialPercent)
  const seconds = useRef(initialSeconds)
  const lastSaved = useRef({ percent: initialPercent, seconds: initialSeconds })
  const section = useRef<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    maxPercent.current = Math.max(maxPercent.current, initialPercent)
    seconds.current = Math.max(seconds.current, initialSeconds)
    lastSaved.current = { percent: maxPercent.current, seconds: seconds.current }
    setPercent(maxPercent.current)
  }, [initialPercent, initialSeconds])

  useEffect(() => {
    if (!userId || !lessonId) return
    const article = articleRef.current
    if (!article) return

    const measure = () => {
      const rect = article.getBoundingClientRect()
      const value = readingPercentFromScroll(rect.top + window.scrollY, article.offsetHeight, window.scrollY, window.innerHeight)
      if (value > maxPercent.current) {
        maxPercent.current = value
        setPercent(value)
      }
    }

    const save = () => {
      const readMore = maxPercent.current > lastSaved.current.percent
      const changed = readMore || seconds.current - lastSaved.current.seconds >= 10
      if (!changed) return
      lastSaved.current = { percent: maxPercent.current, seconds: seconds.current }
      void saveReading({
        userId,
        lessonId,
        readingPercent: maxPercent.current,
        timeSpentSeconds: seconds.current,
        lastSection: section.current,
      })
        // Reading further counts as today's lesson, so the streak flame may have just lit.
        .then(({ queued }) => {
          if (readMore && !queued) void queryClient.invalidateQueries({ queryKey: LESSON_DAYS_KEY })
        })
        .catch(() => undefined)
    }

    const headings = Array.from(article.querySelectorAll<HTMLElement>('[data-section]'))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const id = visible?.target.getAttribute('data-section')
        if (id) {
          section.current = id
          setActiveSection(id)
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    headings.forEach((h) => observer.observe(h))

    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') seconds.current += 1
    }, 1000)
    const saver = window.setInterval(save, SAVE_INTERVAL_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    measure()

    return () => {
      save()
      observer.disconnect()
      window.clearInterval(tick)
      window.clearInterval(saver)
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
    }
  }, [articleRef, userId, lessonId, queryClient])

  return { percent, activeSection }
}
