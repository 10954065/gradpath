import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/form-controls'

const DISARM_MS = 4000

/** Two-step delete: the first click arms the button, the second confirms. Disarms after a few seconds. */
export function ConfirmDeleteButton({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) {
  const [isArmed, setIsArmed] = useState(false)
  useEffect(() => {
    if (!isArmed) return
    const timer = setTimeout(() => setIsArmed(false), DISARM_MS)
    return () => clearTimeout(timer)
  }, [isArmed])
  const handleClick = () => {
    if (!isArmed) return setIsArmed(true)
    setIsArmed(false)
    onConfirm()
  }
  return (
    <Button size="sm" variant={isArmed ? 'danger' : 'ghost'} disabled={disabled} onClick={handleClick} aria-label={isArmed ? `Confirm delete ${label}` : `Delete ${label}`}>
      <Trash2 /> {isArmed ? 'Confirm' : null}
    </Button>
  )
}
export function PublishSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={`${checked ? 'Unpublish' : 'Publish'} ${label}`} />
      {checked ? 'Published' : 'Hidden'}
    </span>
  )
}
