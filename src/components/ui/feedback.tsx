import { AlertCircle, Info, Loader2, type LucideIcon } from 'lucide-react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

interface ProgressBarProps {
  value: number
  label: string
  className?: string
  tone?: 'primary' | 'success' | 'warning'
}

export function ProgressBar({ value, label, className, tone = 'primary' }: ProgressBarProps) {
  const bounded = Math.min(100, Math.max(0, value))
  const color = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning' }[tone]
  return (
    <ProgressPrimitive.Root
      aria-label={label}
      value={bounded}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', color)}
        style={{ width: `${bounded}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center', className)}>
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

interface AlertProps {
  tone?: 'info' | 'danger' | 'warning'
  title?: string
  children: ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const Icon = tone === 'info' ? Info : AlertCircle
  const styles = {
    info: 'border-primary/20 bg-accent text-accent-foreground',
    warning: 'border-warning/30 bg-warning/8 text-warning',
    danger: 'border-danger/30 bg-danger/8 text-danger',
  }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3 text-sm', styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title && 'mt-0.5', 'text-foreground/80')}>{children}</div>
      </div>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" title="We couldn't load this">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium text-primary hover:underline">
          Try again
        </button>
      ) : null}
    </Alert>
  )
}
