import type { FloorFilter } from '../../types'
import { useSentinel } from '../../store'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'

const FLOORS: SegmentOption<FloorFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'F3', label: '3' },
  { value: 'F2', label: '2' },
  { value: 'F1', label: '1' },
  { value: 'B', label: 'B' },
]

export function FloorSelector() {
  const floor = useSentinel((s) => s.floor)
  const setFloor = useSentinel((s) => s.setFloor)
  return <SegmentedControl size="sm" layoutId="floor-filter" ariaLabel="Floor" options={FLOORS} value={floor} onChange={setFloor} />
}
