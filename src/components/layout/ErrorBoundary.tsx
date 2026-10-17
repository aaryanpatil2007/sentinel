import { RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { STORE_KEY, useSentinel } from '../../store'
import { Button } from '../ui/Button'

type State = { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sentinel crashed', error, info.componentStack)
  }

  private reset = () => {
    try {
      localStorage.removeItem(STORE_KEY)
    } catch (err) {
      console.error('Could not clear saved demo state', err)
    }
    void useSentinel.getState().resetDemo()
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-start p-6">
        <div className="w-full max-w-md rounded-12 border border-outline bg-surface p-6">
          <h1 className="text-18 font-semibold tracking-tightest">Something went wrong</h1>
          <p className="mt-2 text-14 text-on-surface-variant">
            The demo hit an unexpected state. Resetting restores the scenario incident.
          </p>
          <Button className="mt-4" variant="primary" icon={RotateCcw} onClick={this.reset}>
            Reset demo
          </Button>
        </div>
      </div>
    )
  }
}
