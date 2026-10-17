/** PLACEHOLDER first-person preview driven by the engine's route steps. Replace with the real AR view; keep these props. */
import { CircleCheck, Navigation, ShieldAlert } from 'lucide-react'
import type { Instruction } from '../../types'
import { instructionMode, placeLabel } from '../../engine/derive'
import type { Entity, Route } from '../../engine/types'
import { useNodes } from '../../store/selectors'
import { Emphasis } from '../ui/Emphasis'
import { MonoText } from '../ui/MonoText'

type Props = { civilian: Entity; route: Route | null; instructions: Instruction[] }

const EDGE = { className: 'stroke-outline', strokeWidth: 1.5 }
const CHEVRONS = [
  { y: 420, scale: 1 },
  { y: 355, scale: 0.72 },
  { y: 305, scale: 0.5 },
]

function Corridor() {
  return (
    <g>
      <polygon points="0,0 800,0 470,190 330,190" className="fill-surface" />
      <polygon points="0,450 800,450 470,250 330,250" className="fill-surface-container" />
      <polygon points="0,0 330,190 330,250 0,450" className="fill-surface-container-high" />
      <polygon points="800,0 470,190 470,250 800,450" className="fill-surface-container-high" />
      <rect x="330" y="190" width="140" height="60" className="fill-surface stroke-outline" strokeWidth={1.5} />
      <line x1="0" y1="0" x2="330" y2="190" {...EDGE} />
      <line x1="800" y1="0" x2="470" y2="190" {...EDGE} />
      <line x1="0" y1="450" x2="330" y2="250" {...EDGE} />
      <line x1="800" y1="450" x2="470" y2="250" {...EDGE} />
    </g>
  )
}

export function ARView({ civilian, route, instructions }: Props) {
  const nodes = useNodes()
  const mode = instructionMode(civilian, route, nodes)
  const steps = mode === 'go' && route ? route.steps : []
  const [current, ...upcoming] = steps
  const headline = current?.instruction ?? instructions[0]?.text ?? ''

  return (
    <div className="relative h-full overflow-hidden rounded-12 border border-outline bg-surface-container-high">
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        <Corridor />
        {current && (
          <g fill="none" className="stroke-primary" strokeLinecap="round" strokeLinejoin="round">
            {CHEVRONS.map((c) => (
              <path key={c.y} d="M-44 14 L0 -14 L44 14" strokeWidth={12} transform={`translate(400 ${c.y}) scale(${c.scale})`} />
            ))}
          </g>
        )}
      </svg>

      <div className="absolute left-3 top-3 rounded-8 border border-outline bg-surface px-3 py-2">
        <MonoText className="block text-12 font-medium">{civilian.entity_id}</MonoText>
        <span className="text-11 text-on-surface-variant">{placeLabel(civilian, nodes)} · AR preview</span>
      </div>

      {current && (
        <div className="absolute right-3 top-3 flex items-center gap-3 rounded-8 border border-outline bg-surface px-3 py-2">
          <Navigation size={20} strokeWidth={1.75} className="text-primary" style={{ transform: `rotate(${current.bearing_degrees}deg)` }} aria-label={`Heading ${Math.round(current.bearing_degrees)} degrees`} />
          <div className="text-right">
            <MonoText className="block text-18 font-semibold">{Math.round(current.distance_m)} m</MonoText>
            <MonoText className="text-11 text-on-surface-variant">{Math.round(current.bearing_degrees)}°</MonoText>
          </div>
        </div>
      )}

      {mode === 'stay' && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div className="flex items-center gap-2 rounded-8 border border-warning/40 bg-surface px-4 py-3 text-14 font-semibold text-warning">
            <ShieldAlert size={20} strokeWidth={1.75} aria-hidden />
            Stay in place
          </div>
        </div>
      )}
      {mode === 'out' && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div className="flex items-center gap-2 rounded-8 border border-success/40 bg-surface px-4 py-3 text-14 font-semibold text-success">
            <CircleCheck size={20} strokeWidth={1.75} aria-hidden />
            You are out
          </div>
        </div>
      )}

      <div className="absolute inset-x-3 bottom-3 rounded-8 border border-outline bg-surface px-3 py-2">
        <p className="text-14 font-medium">
          <Emphasis text={headline} strongClassName="text-primary" />
        </p>
        {upcoming.length > 0 && (
          <ol className="mt-1 space-y-0.5 text-12 text-on-surface-variant">
            {upcoming.slice(0, 2).map((s) => (
              <li key={`${s.to_node}-${s.instruction}`}>Then {s.instruction.charAt(0).toLowerCase() + s.instruction.slice(1)}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
