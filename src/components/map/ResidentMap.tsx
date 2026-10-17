import { MapToolbar } from './MapToolbar'
import { OverlayToggles } from './OverlayToggles'

export function ResidentMap() {
  return (
    <>
      <MapToolbar>
        <OverlayToggles />
      </MapToolbar>
      <div className="flex-1 p-4 text-14 text-on-surface-variant">Resident view</div>
    </>
  )
}
