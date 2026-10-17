# Sentinel

Fire emergency routing and communication for UC Berkeley's Jacobs Hall. One shared incident, two perspectives: Firefighter and Resident. The React app is the frontend for `sentinel_engine`, which owns the building graph, hazards, routes, fire-spread prediction, triage and advisories.

## Run

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once, for the engine
npm run demo        # engine on :8787 + app
```

`npm run dev` starts only the app. Without the engine it shows a recorded incident with an "Engine offline" banner and retries every 5 seconds. `npm run engine` starts only the engine. Set `VITE_ENGINE_URL` to point the app elsewhere.

Tests: `npm test` (app), `npm run engine:test` (engine), `npm run build` (type-check and build).

## Demo script

1. Firefighter: the rescue priority list comes from the engine's triage. Hover a row to trace its routes in 3D; click a civilian for details and **Assign Alpha/Bravo**.
2. Floors: All, 3, 2, 1, B isolate a floor. Overlays toggle fire, smoke and predicted spread.
3. Resident (or **View as resident** from a marker card): instructions, the evacuation route, and an AR preview from the engine's route steps.
4. Tap **I'm trapped** as a resident, then switch to Firefighter: the engine re-triages and the marker, list and thread update.
5. Firefighter → **Simulate**: add fire, smoke or blocked hazards on any room or corridor, remove hazards, or move a civilian. Routes recompute in the engine.
6. Cameras: expand a feed and **Simulate smoke detection** to send an observation through the same API a real CV system would use.

Demo controls (sliders icon, top right): resident to view as, Go/Stay override, Reset demo (reseeds the engine).

## Architecture

| Piece | Where |
|---|---|
| Engine API client and types | `src/engine/` |
| Seed scenario, threads, cameras | `src/data/scenario.json`, `src/data/scenarioThreads.ts` |
| 3D layout (footprints, furnishings) in engine meters | `src/data/jacobsLayout.ts` |
| three.js scene | `src/components/building3d/` (reuses `demo/src` furniture and firefighter builders) |
| Store (engine sync, threads, UI) | `src/store/` |
| Offline recording | `src/data/engine-snapshot.json`, regenerate with `PYTHONPATH=. .venv/bin/python scripts/capture_engine_snapshot.py` |

The engine's coordinates (`JACOBS_LOCAL`) and room layout are illustrative, as documented in `sentinel_engine/INTEGRATION.md`. Routes and advisories are decision-support proposals that require command approval.
