import { ThreadList } from './ThreadList'
import { ThreadView } from './ThreadView'

export function FirefighterComms() {
  return (
    <div className="flex min-h-0 flex-1">
      <ThreadList />
      <ThreadView />
    </div>
  )
}
