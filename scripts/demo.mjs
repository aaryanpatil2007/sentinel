// Starts the Sentinel engine (uvicorn) and the Vite dev server together.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const uvicorn = '.venv/bin/uvicorn'
if (!existsSync(uvicorn)) {
  console.error('Engine not installed. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt')
  process.exit(1)
}

const children = [
  spawn(uvicorn, ['sentinel_engine.api:app', '--port', '8787'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
]

let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
for (const child of children) {
  child.on('error', (err) => {
    console.error(`Failed to run ${child.spawnargs.join(' ')}: ${err.message}`)
    stop(1)
  })
  child.on('exit', (code, signal) => {
    if (stopping) return
    stop(code ?? (signal ? 1 : 0))
  })
}
