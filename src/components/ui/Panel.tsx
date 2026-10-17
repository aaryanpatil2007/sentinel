import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-12 border border-outline bg-surface', className)}
      {...rest}
    >
      {children}
    </section>
  )
}
