import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from './Button'

type Props = { label: string; prompt: string; confirmLabel: string; onConfirm: () => void }

/** Two-step destructive action without a browser dialog. */
export function InlineConfirm({ label, prompt, confirmLabel, onConfirm }: Props) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }
  return (
    <div role="group" aria-label={prompt} className="flex items-center gap-1">
      <span className="text-12 text-on-surface-variant">{prompt}</span>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="sm"
        autoFocus
        onClick={() => {
          onConfirm()
          setOpen(false)
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  )
}
