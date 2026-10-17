import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'tonal' | 'outline' | 'ghost'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-surface',
  tonal: 'bg-surface-container-high text-on-surface',
  outline: 'border border-outline bg-surface text-on-surface',
  ghost: 'text-on-surface-variant hover:text-on-surface',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1 px-3 text-12',
  md: 'h-10 gap-2 px-4 text-14',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon: Icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'state-layer focus-ring inline-flex shrink-0 items-center justify-center rounded-8 font-medium',
        'transition-colors duration-200 ease-standard disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 16 : 20} strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  )
})
