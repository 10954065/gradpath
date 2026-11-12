import { cn } from '@/lib/utils'

/** GradPath mark: an ascending path through three milestones. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary" />
      <path d="M7 23 L14 16 L19 19 L25 9" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="23" r="2" fill="white" />
      <circle cx="14" cy="16" r="2" fill="white" />
      <circle cx="25" cy="9" r="2.4" fill="#fbbf24" />
    </svg>
  )
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">GradPath</span>
        {subtitle ? <span className="block text-[11px] opacity-70">MSc IT for Business</span> : null}
      </span>
    </span>
  )
}
