import type { ReactNode } from 'react'

type Props = { title: string; meta?: ReactNode; actions?: ReactNode }

export function PanelHeader({ title, meta, actions }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-outline px-4">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-14 font-semibold tracking-tightest">{title}</h2>
        {meta && <div className="truncate text-12 text-on-surface-variant">{meta}</div>}
      </div>
      {actions}
    </header>
  )
}
