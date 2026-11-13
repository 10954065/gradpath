import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Designed dropdown built on Radix Select: the closed field matches the text inputs, and the open list uses the
 * same surface, border and shadow as the other popovers (instead of the operating system's native list).
 * Keyboard navigation, type-ahead, screen-reader semantics and form submission (hidden native select) come from
 * Radix. Radix reserves the empty string, so "" values (e.g. "All courses") are mapped to a private sentinel.
 */
const EMPTY = '__gp-empty__'
const toRadix = (value: string) => (value === '' ? EMPTY : value)
const fromRadix = (value: string) => (value === EMPTY ? '' : value)

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
}

export function Select({ value, onValueChange, children, id, name, placeholder, disabled, required, className, ...aria }: SelectProps) {
  return (
    <SelectPrimitive.Root value={toRadix(value)} onValueChange={(next) => onValueChange(fromRadix(next))} name={name} disabled={disabled} required={required}>
      <SelectPrimitive.Trigger
        id={id}
        {...aria}
        className={cn(
          'group flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left text-sm text-foreground shadow-xs transition-colors',
          'hover:border-foreground/25 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger data-[placeholder]:text-muted-foreground data-[state=open]:border-ring',
          '[&>span]:min-w-0 [&>span]:truncate',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className="gp-popover z-50 max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border bg-surface shadow-raised"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronUp className="size-4" aria-hidden />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronDown className="size-4" aria-hidden />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export function SelectItem({ value, children, disabled, className }: { value: string; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <SelectPrimitive.Item
      value={toRadix(value)}
      disabled={disabled}
      className={cn(
        'relative flex w-full cursor-pointer items-center rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-none select-none',
        'data-[highlighted]:bg-muted data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center text-primary">
        <Check className="size-4" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
