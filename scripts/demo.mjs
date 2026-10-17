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

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) child.on('exit', (code) => code && stop())
