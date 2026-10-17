import type { Transition } from 'framer-motion'

export const EASE_STANDARD: [number, number, number, number] = [0.2, 0, 0, 1]
export const STANDARD: Transition = { duration: 0.2, ease: EASE_STANDARD }

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: STANDARD,
}

export const fadeDrop = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: STANDARD,
}
