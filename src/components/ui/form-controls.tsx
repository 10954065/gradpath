import { Switch as SwitchPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-md border bg-surface px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldBase, 'h-9 py-1', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

interface FieldProps {
  label: string
  htmlFor: string
  error?: string | undefined
  hint?: string
  children: ReactNode
  className?: string
}

/** Label + control + hint/error, wired for screen readers via aria-describedby on the control. */
export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  )
}
