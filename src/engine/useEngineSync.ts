import { useEffect } from 'react'
import { useSentinel } from '../store'
import { POLL_MS, RETRY_MS } from '../store/engineSlice'

/** Connects once, then polls while live and retries every few seconds while offline. */
export function useEngineSync(): void {
  const status = useSentinel((s) => s.engineStatus)

  useEffect(() => {
    void useSentinel.getState().connect()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => void useSentinel.getState().poll(), status === 'live' ? POLL_MS : RETRY_MS)
    return () => window.clearInterval(id)
  }, [status])
}
