import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, DoorOpen, ShieldAlert, type LucideIcon } from 'lucide-react'
import type { Instruction, InstructionMode } from '../../types'
import { cn } from '../../lib/cn'
import { formatClock } from '../../lib/format'
import { fade } from '../../lib/motion'
import { Emphasis } from '../ui/Emphasis'
import { MonoText } from '../ui/MonoText'
import { TONE_TEXT, type Tone } from '../ui/tone'

const MODE: Record<InstructionMode, { label: string; tone: Tone; icon: LucideIcon; frame: string }> = {
  go: { label: 'Leave now', tone: 'safe', icon: DoorOpen, frame: 'border-success/40 bg-success/5' },
  stay: { label: 'Stay in place', tone: 'moderate', icon: ShieldAlert, frame: 'border-warning/40 bg-warning/5' },
  out: { label: 'You are out', tone: 'safe', icon: CircleCheck, frame: 'border-success/40 bg-success/5' },
}

type Props = { mode: InstructionMode; instructions: Instruction[]; updatedAt: number }

export function InstructionCard({ mode, instructions, updatedAt }: Props) {
  const { label, tone, icon: Icon, frame } = MODE[mode]
  return (
    <section aria-live="polite" aria-label="Instructions" className={cn('shrink-0 rounded-12 border p-4', frame)}>
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-2 text-14 font-semibold', TONE_TEXT[tone])}>
          <Icon size={20} strokeWidth={1.75} aria-hidden />
          {label}
        </div>
        <MonoText className="text-12 text-on-surface-variant">{formatClock(updatedAt)}</MonoText>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.ol key={`${mode}:${instructions.map((i) => i.text).join('|')}`} {...fade} className="mt-2 space-y-1">
          {instructions.slice(0, 4).map((instruction) => (
            <li key={instruction.text} className="text-18 font-medium leading-[28px] tracking-tightest">
              <Emphasis text={instruction.text} strongClassName={mode === 'go' ? 'text-primary' : undefined} />
            </li>
          ))}
        </motion.ol>
      </AnimatePresence>
    </section>
  )
}
