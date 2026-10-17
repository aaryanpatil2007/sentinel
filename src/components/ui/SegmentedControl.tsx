import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { STANDARD } from '../../lib/motion'

export type SegmentOption<T extends string> = { value: T; label: string; icon?: LucideIcon }

type Props<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  layoutId: string
  ariaLabel: string
  size?: 'sm' | 'md'
}

export function SegmentedControl<T extends string>({ options, value, onChange, layoutId, ariaLabel, size = 'md' }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-8 border border-outline bg-surface-container p-0.5">
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-ring relative inline-flex items-center rounded-[6px] px-3 font-medium transition-colors duration-200 ease-standard',
              size === 'sm' ? 'h-7 text-12' : 'h-8 text-14',
              active ? 'text-surface' : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {active && <motion.span layoutId={layoutId} transition={STANDARD} className="absolute inset-0 rounded-[6px] bg-primary" />}
            <span className="relative inline-flex items-center gap-1">
              {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
