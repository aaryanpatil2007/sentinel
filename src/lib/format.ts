import type { WorldPosition } from '../engine/types'

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`
}

export function formatAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ago`
}

export function formatDistance(m: number): string {
  return `${Math.round(m)} m`
}

export function formatEta(s: number): string {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${pad(t % 60)}`
}

export function formatCoords(p: WorldPosition): string {
  return `${p.floor_id} · ${p.x.toFixed(1)}, ${p.y.toFixed(1)} m`
}

const EMPHASIS = /(\b[A-Z]{2,}(?: [A-Z]\b)?)/

/** Splits instruction text so uppercase keywords (RIGHT, STAIR B) can be emphasized. */
export function splitEmphasis(text: string): { text: string; strong: boolean }[] {
  return text
    .split(EMPHASIS)
    .map((part, i) => ({ text: part, strong: i % 2 === 1 }))
    .filter((part) => part.text.length > 0)
}
