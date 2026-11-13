import { cn } from '@/lib/utils'

/** Developer credit, centred under the dashboard and the sign-in and registration screens. */
export function BuiltBy({ className }: { className?: string }) {
  return (
    <p className={cn('text-center text-xs text-muted-foreground', className)}>
      Built by{' '}
      <a
        href="https://sunleonrouterenterprise.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        Sunleon Router Enterprise
      </a>
    </p>
  )
}
