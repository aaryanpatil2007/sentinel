import { DEFAULT_ENGINE_URL, createEngineClient, type EngineClient } from './client'

const baseUrl = import.meta.env.VITE_ENGINE_URL ?? DEFAULT_ENGINE_URL
let client: EngineClient = createEngineClient(baseUrl)

export function getEngineClient(): EngineClient {
  return client
}

/** Swaps the client (tests use an in-memory fake). */
export function setEngineClient(next: EngineClient): void {
  client = next
}
