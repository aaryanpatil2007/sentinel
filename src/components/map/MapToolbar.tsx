import type { ReactNode } from 'react'

export function MapToolbar({ leading, children }: { leading?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-outline px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">{leading}</div>
      {children}
    </div>
  )
}
