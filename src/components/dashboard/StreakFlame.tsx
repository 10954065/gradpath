import { useId } from 'react'
import type { FlameState } from '@/lib/analytics'
import { cn } from '@/lib/utils'

const OUTER = 'M12 2c1.5 3.5 5.5 6 5.5 11.5 0 4.5-2.5 8-5.5 8s-5.5-3-5.5-6.7c0-2.8 1.5-4.6 2.8-6.2.2 1.8 1 3 2 3.4-.5-3.4-.3-7 .7-10z'
const CORE = 'M12 12.5c1.4 1.5 2.6 2.9 2.6 4.9 0 1.8-1.2 3.1-2.6 3.1s-2.6-1.2-2.6-2.8c0-1.5 1-2.5 1.8-3.3.2.9.6 1.4 1.1 1.6-.3-1.2-.4-2.4-.3-3.5z'

const LABEL: Record<FlameState, string> = {
  lit: 'Flame lit: today’s lesson is done',
  fading: 'Flame fading: take a lesson today to keep it alive',
  out: 'Flame out: take a lesson to relight it',
}

/** The study-streak flame. Lit after a lesson today, fading while today's lesson is still open, out when the streak has ended. */
export function StreakFlame({ state, className, decorative = false }: { state: FlameState; className?: string; decorative?: boolean }) {
  const gradient = useId()
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('gp-flame shrink-0', `gp-flame-${state}`, className)}
      data-state={state}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : LABEL[state]}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      {state === 'out' ? (
        <path d={OUTER} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      ) : (
        <>
          <path d={OUTER} fill={`url(#${gradient})`} />
          <path d={CORE} fill="#fde68a" fillOpacity={state === 'lit' ? 1 : 0.55} />
        </>
      )}
    </svg>
  )
}
