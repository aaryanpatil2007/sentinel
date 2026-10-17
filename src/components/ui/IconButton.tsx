import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  variant?: 'ghost' | 'primary'
  size?: 'sm' | 'md'
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'sm', className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'state-layer focus-ring inline-flex shrink-0 items-center justify-center rounded-8',
        size === 'md' ? 'h-10 w-10' : 'h-8 w-8',
        'transition-colors duration-200 ease-standard disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' ? 'bg-primary text-surface' : 'text-on-surface-variant hover:text-on-surface',
        className,
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}
