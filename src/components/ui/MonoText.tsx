import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function MonoText({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('font-mono tabular-nums', className)} {...rest} />
}
