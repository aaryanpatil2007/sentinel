import { SendHorizontal } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { MAX_MESSAGE_LENGTH } from '../../lib/labels'
import { IconButton } from '../ui/IconButton'

const MAX_HEIGHT = 128

type Props = { placeholder: string; onSend: (text: string) => void; focusNonce?: number; divider?: boolean }

export function Composer({ placeholder, onSend, focusNonce = 0, divider = true }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0

  useEffect(() => {
    if (focusNonce > 0) ref.current?.focus()
  }, [focusNonce])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [text])

  const submit = () => {
    if (!canSend) return
    onSend(text)
    setText('')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn('flex shrink-0 items-end gap-2 p-3', divider && 'border-t border-outline')}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="focus-ring min-h-10 flex-1 resize-none rounded-8 border border-outline bg-surface px-3 py-2 text-14 placeholder:text-on-surface-variant"
      />
      <IconButton type="submit" icon={SendHorizontal} label="Send" variant="primary" size="md" disabled={!canSend} />
    </form>
  )
}
