# Sentinel — Design Spec

Date: 2026-10-17
Status: Draft for review

## 1. Purpose

Sentinel is a single-page hackathon demo of a fire emergency routing and communication platform. One shared world state is viewed from two perspectives, **Firefighter** and **Resident**, toggled in the top bar.

Priorities, in order: (1) visual polish and clarity, (2) intuitive UX, (3) clean component architecture. Not built for scale.

**Success criteria**
- Looks finished on first `npm install && npm run dev`. No backend.
- Every screen reads correctly with no explanation.
- A judge can watch a resident tap "I'm trapped", switch to Firefighter, and see the marker, priority list, route and thread all reflect it.
- In Sim mode, dragging a person or painting fire visibly recomputes routes, priorities and resident instructions.
- The owner can replace the building view, AR view, and every logic stage (perception, movement, routing, guidance, priority) without touching UI components.

**Out of scope**
- AI assistant/chatbot (explicitly cut).
- Real pathfinding, real CV, real video, real 3D/AR (stubs and placeholders only).
- Backend, auth, multi-user sync, full responsive design.

## 2. Stack

Vite + React 18 + TypeScript, Tailwind CSS, Framer Motion, lucide-react, Zustand (with `persist`). Vitest for unit tests. No UI kit or component library; all components hand-built.

## 3. Design system (Material Design 3, light operational)

Defined once as Tailwind theme tokens; nothing outside these values is used.

**Color roles (only these)**
| Token | Hex | Use |
|---|---|---|
| surface | #FBF9F6 | App background, panel fill |
| surface-container | #F3F1EE | Grouping tint, own messages, hover rows |
| surface-container-high | #ECEAE7 | Selected rows, active segments background |
| on-surface | #1C1B19 | Primary text, state-layer base |
| on-surface-variant | #5F5E5A | Secondary text, labels |
| outline | #C8C6C2 | 1px panel/control borders |
| primary | #1F4E79 | Actions, selection, links, entry routes |
| error | #B3261E | Fire, critical priority |
| warning | #8A5A00 | Caution, moderate priority, stay-in-place |
| success | #2E6B3F | Safe, evacuated, go state |

No gradients. Hierarchy from surface tints, not shadows. One accent (primary) per screen; error/warning/success carry status meaning only.

**Elevation:** shadow only on floating elements (marker card popover, tooltips). Panels flat with a 1px outline.

**Type:** Inter for UI; JetBrains Mono for numbers, timestamps, coordinates, unit IDs, distances, call signs. Scale: label 11/12, body 14, title 16/18, headline 24. Weights 400/500/600 only. Tight tracking on titles. Sentence case; no uppercase tracking.

**Spacing:** 8px grid, 4px icon gaps. Panel padding 16, section gap 24.

**Radius:** 8 controls, 12 panels/cards, 999 only for status dots.

**States:** hover 8%, focus 12%, pressed 12% overlay of on-surface. Focus ring 2px primary. Implemented once as a shared state-layer utility.

**Icons:** lucide, 16 or 20px, stroke 1.75, with a text label unless in a tight toolbar.

**Motion:** 200ms `cubic-bezier(0.2, 0, 0, 1)` for panel transitions, segmented-control highlight, marker color/position updates. Nothing bounces or scales past 1.

**Forbidden:** emoji, glassmorphism, blur, purple/neon, gradient text, oversized rounded-full buttons, decorative illustrations, lorem ipsum, card drop shadows.

## 4. Layout

- `AppShell`: full viewport, `surface` background.
- `TopBar` (48px):
  - Left: shield icon + "Sentinel" wordmark (18/600, tight tracking).
  - Center: `SegmentedControl` Firefighter | Resident; selected segment filled primary, highlight animates via shared layout.
  - Right: "Maple Court Apartments · 1420 Alder St", "Active" with error status dot, elapsed timer in mono (`00:14:32`, ticking).
- Body: Map panel (60%) left, Comms panel (40%) right. Each fills remaining height with independent internal scroll. 16px outer gutter, 16px gap.
- Below 1100px width: Comms becomes a tab beside Map (fallback only).

## 5. Folder structure

```
index.html, package.json, tsconfig.json, vite.config.ts, tailwind.config.js, postcss.config.js, .gitignore, README.md
tests/theme.test.ts                     design-token guard
src/main.tsx, src/App.tsx, src/index.css, src/vite-env.d.ts
src/types.ts                            all domain types + FLOORS
src/lib/geometry.ts                     plan constants, units, doors, staging
src/lib/grid.ts                         hazard grid helpers
src/lib/format.ts                       clocks, distances, emphasis splitting
src/lib/labels.ts                       status/quick-reply labels, senders, limits
src/lib/routing.ts                      exitPath, routeFor, entryRouteFor, getRescueRoutes (stub)
src/lib/guidance.ts                     instructionsFor, turnDirection, hallwayHazard (stub)
src/lib/priority.ts                     rank (stub)
src/lib/movement.ts                     advanceAlong, stepPeople (stub)
src/lib/perception.ts                   detect, applyDetection (stub)
src/lib/camera.ts                       getCameraFeeds (stub)
src/lib/cn.ts, src/lib/motion.ts        class joiner, motion presets
src/data/mock.ts                        createMockState, thread ids
src/store/types.ts                      SentinelState, SliceCreator
src/store/events.ts                     system messages, appendMessages
src/store/quickReply.ts                 applyQuickReply
src/store/worldSlice.ts, commsSlice.ts, uiSlice.ts
src/store/index.ts                      useSentinel, persistence
src/store/selectors.ts                  deriveWorld, useDerived, usePerson, useThread
src/hooks/useNow.ts, src/hooks/useDismiss.ts
src/components/ui/                      Button, IconButton, SegmentedControl, StatusDot, StatusChip, QuickReplyChip,
                                        Panel, PanelHeader, MonoText, InlineConfirm, Emphasis, tone.ts
src/components/layout/                  AppShell, TopBar, IncidentStatus, DevMenu, ErrorBoundary
src/components/map/                     types.ts, project.ts, overlays.ts, paths.ts, BuildingView, BuildingGeometry,
                                        OverlayLayer, PathLayer, MarkerLayer, PersonMarker, PaintSurface, Swatch,
                                        MapPanel, MapToolbar, OverlayToggles, Legend, LastUpdated, FirefighterMap,
                                        MarkerCard, PriorityList, SimControls, CameraStrip, CameraTile,
                                        ResidentMap, InstructionCard, ARView
src/components/comms/                   CommsPanel, FirefighterComms, ThreadList, ThreadView, ThreadHeader,
                                        MessageList, MessageRow, Composer, ResidentComms, QuickReplies
```

Files stay small and single-purpose (target < 300 lines).

## 6. Data model (`src/types.ts`)

```ts
type Floor = 1 | 2 | 3 | 4
type Priority = 'critical' | 'moderate' | 'safe'
type Status = 'trapped' | 'immobile' | 'sheltering' | 'evacuating' | 'evacuated' | 'unknown'
type Point = { floor: Floor; x: number; y: number }       // per-floor plan units, 1000 × 300
type Person = {
  id: string; unit: string; pos: Point; count: number
  priority: Priority; status: Status; mobility: string[]; lastUpdate: number
}
type HazardGrid = Record<Floor, number[]>                   // 24 × 8 cells, row-major; 0 clear, 1 smoke, 2 fire
type Region = { floor: Floor; x: number; y: number; w: number; h: number }
type World = { people: Person[]; hazards: HazardGrid; structural: Region[] }
type Route = {
  personId: string; kind: 'entry' | 'exit'; points: Point[]
  via: 'A' | 'B' | null; blocked: boolean; distanceM: number; etaS: number
}
type Instruction = { text: string; tone: 'go' | 'stay' | 'info' }
type RankedPerson = { personId: string; rank: number; distanceM: number; etaS: number }
type QuickReply = 'out' | 'trapped' | 'cant-move'
type Message = {
  id: string; threadId: string; from: 'resident' | 'responder' | 'system'
  sender: string; text: string; quick?: QuickReply; at: number
}
type Thread = { id: string; kind: 'crew' | 'resident'; personId?: string; messages: Message[]; unread: number }
type Camera = { id: string; label: string; pos: Point; status: 'live' | 'no-signal' }
```

Fire and smoke share one `HazardGrid` (value 2 = fire, 1 = smoke) so a cell has a single state.

## 7. Logic pipeline (`src/lib/`)

Each stage is a pure, typed function the owner will replace:

```ts
perception.ts  detect(feeds: Camera[], world: World): Partial<World>   // CV: fire + people positions. Stub returns {}.
movement.ts    stepPeople(world: World): Person[]                      // fire-aware movement. Stub: evacuating people advance one waypoint toward their route.
routing.ts     routeFor(person: Person, world: World): Route           // per-person exit route
               getRescueRoutes(world: World): Route[]                  // entry routes from staging (Exit B) to critical people
guidance.ts    instructionsFor(person: Person, route: Route, world: World): Instruction[]  // ≤ 4 plain-language lines
priority.ts    rank(world: World, routes: Route[]): RankedPerson[]
camera.ts      getCameraFeeds(): Camera[]
grid.ts        cellAt(point), pointOfCell(floor, col, row), isBlocked(world, point) helpers
```

**Data flow:** any change to `World` (drag, brush, step, quick reply, CV) → memoized selectors in `store/selectors.ts` recompute routes, ranked list and instructions → map, priority list, instruction card, AR view and threads all update. Derived values are never stored.

**Stub router (~50 lines, intentional deviation from "hardcoded paths").** Hardcoded polylines break once people can be dragged, so the stub uses a fixed waypoint graph: unit door → hallway centerline → nearest stairwell whose cells along the path are not fire → down stair shaft → F1 → nearest exit. If both stairs are blocked on the person's floor or below, it returns `blocked: true` (stay in place). Entry routes are the reverse from staging outside Exit B. Distance computed from polyline length with a fixed plan-unit-to-meter scale; ETA at 1.2 m/s. A path through a structural-risk region costs an extra 20 m when choosing between stairs; the reported distance is unaffected.

**Stub priority:** critical first, then moderate, then safe; ties by distance from staging.

**Stub guidance:** derives lines from route: fire location summary, hallway state, turn direction at hallway + stairwell letter, elevator warning; stay variant when `blocked`.

**System events:** when a person's derived `via` or `blocked` changes, or their status changes, the store appends a `system` message to their thread ("Route updated · Stair B → Stair A", "Status changed to Trapped").

## 8. Store (`src/store/`)

One Zustand store `useSentinel` composed from slices:

- **worldSlice:** `people`, `hazards`, `structural`; actions `movePerson(id, pos)`, `paintCell(floor, col, row, value)`, `stepSim()`, `commitWorld(next, messages)`.
- **commsSlice:** `threads`; actions `sendMessage(threadId, msg)`, `sendQuickReply(personId, reply)`, `clearThread(threadId)`, `markRead(threadId)`.
- **uiSlice:** `perspective`, `viewingAsId` (default 3B), `selectedPersonId`, `hoveredPersonId`, `overlays {fire, smoke, structural}`, `simMode`, `brush ('fire'|'smoke'|'erase')`, `residentView ('building'|'ar')`, `devGoStay ('auto'|'go'|'stay')`, `expandedCameraId`.
- Global action `resetDemo()` restores mock data.

**Persistence:** `persist` middleware with `partialize` → world + threads only, under a versioned key; a version bump discards stale data. UI state is in-memory.

**Quick reply effects (`sendQuickReply`)**
- "I'm trapped" → status trapped, priority critical.
- "Can't move" → status immobile, priority critical, add "Immobile" to mobility.
- "I'm out" → status evacuated, priority safe, position moved to staging; route removed.
- Each posts a resident message with `quick` set, updates `lastUpdate`, increments the thread's unread on the responder side.

**Selection sync:** single `selectedPersonId`; selecting a thread selects the marker and vice versa.

## 9. Map panel

### 9.1 BuildingView (replaceable)

```tsx
<BuildingView overlays={OverlayRegion[]} markers={MarkerSpec[]} paths={PathSpec[]}
              highlightUnit?="3B" focusFloor?={3} dimOtherFloors?={boolean}
              onMarkerClick?={(id) => void} />
```

- Internally stacks: `BuildingGeometry` → `OverlayLayer` → `PathLayer` → `MarkerLayer`.
- All layers place content via `project(point: Point): {x, y}` from `map/project.ts`.
- **To swap in the real model:** replace `BuildingGeometry` and `project`; data, routes and markers keep working.

**Placeholder geometry (minimal effort):** whole building, all four floors stacked vertically in one SVG (F4 top, F1 bottom), mono floor labels at left. Each floor: central hallway, 4 units above (A–D) and 4 below (E–H), Stair A west end, Stair B east end, elevator center. Exit A west and Exit B east on F1 only; staging marker outside Exit B. Thin outlines, mono unit labels, no further detail.

### 9.2 Shared chrome

- `MapToolbar` top: `OverlayToggles` (Fire, Smoke, Structural) right; Sim controls left (Firefighter only).
- `Legend` bottom left (marker priorities, entry/exit route, overlay swatches).
- `LastUpdated` bottom right: "Updated 14:32:08" in mono.
- Overlays: fire = error at 40% fill; smoke = grey hatch pattern; structural = warning diagonal stripes. Hazard cells render as merged rects.
- Mock hazards: fire on F2 around 2C/2D and part of the hallway; smoke on F2 and F3; structural risk at the F2 Stair A landing.

### 9.3 Firefighter view

- Layout: building view, `PriorityList` (240px) docked at the right edge inside the map panel, `CameraStrip` beneath.
- **Markers:** status-colored dot + `2D · 3` (unit · headcount) in mono. Selected: 2px primary ring. Hovered (from list): ring + thicker route. Color and position changes animate 200ms.
- The floor containing the selected/hovered marker gets a faint surface-container band.
- **MarkerCard:** floating popover anchored to the marker (shadow allowed): unit, people count, status, last resident message + mono time, last update, mobility flags, actions "Message" (selects thread in Comms) and "View as resident" (switches to Resident perspective with `viewingAsId` = this person).
- **Routes:** `getRescueRoutes` entry routes to critical people as 3px solid primary; their exit routes as 3px dashed primary. Routes run continuously across floors via stairwells.
- **PriorityList:** ordered rows from `rank()`: status dot, unit, headcount, distance ("38 m"), ETA ("2:10"), all numerics mono. Hover sets `hoveredPersonId`; click selects.
- **Sim mode:** "Simulate" toggle in toolbar. When on: markers draggable (drop snaps to floor under cursor); brush selector Fire | Smoke | Erase, click/drag paints cells; "Step" runs `stepSim()` once; "Reset" calls `resetDemo()`. No auto-running loop.
- **CameraStrip:** four 16:9 tiles from `getCameraFeeds()`: Hall 2, Stair A, Lobby, Hall 3. Each: grey placeholder fill, label, live dot, mono timestamp. Hall 3 shows "No signal". Click expands a tile to full strip width with the other three as a thumbnail rail; click again or Esc collapses.

### 9.4 Resident view (viewing as `viewingAsId`, default 3B on F3)

- `InstructionCard` above the map: status chip + up to 4 lines from `instructionsFor()`, 18/500, one instruction per line.
  - Go (success): "Leave now" — "Fire on floor 2." / "Your hallway is clear." / "Turn RIGHT, take STAIR B down." / "Do not use the elevator."
  - Stay (warning): "Stay in place" — "Stairs are blocked by smoke." / "Close your door, seal gaps with towels." / "Go to a window and signal." / "Responders know you are in 3B."
- Map panel toggle **Building | AR**.
- **Building:** whole building, own floor full strength, other floors dimmed to 40% (fire on F2 still visible), own unit highlighted. Go: one bold route (4px primary) from unit → hallway → stair → F1 → exit, stairwell labeled. Stay: route hidden, unit outlined in warning.
- **AR (placeholder `ARView`):** props `{ person, route, instructions, hazards }`. SVG first-person hallway with a route arrow on the floor, "Stair B · 14 m" next-turn readout in mono, hazard callouts ("Smoke ahead"), current instruction line. Replaceable by real AR.
- Fire and smoke overlays visible; structural optional.

## 10. Comms panel

### 10.1 Firefighter

- **ThreadList (176px):** "Crew" pinned; resident threads sorted by priority rank. Row: status dot, mono unit, one-line preview, mono time, unread count. Selected: surface-container-high + 2px primary left bar.
- **ThreadHeader (resident):** status dot + unit, headcount, status label, coordinates in mono (`F3 · 412, 188`), mobility flags, "Locate" (selects + highlights on map), "Clear messages" ghost button with inline confirm.
- **Messages (`MessageRow`):** left-aligned rows, not bubbles. Sender + mono time line, then text. Own messages on surface-container tint. Quick replies render as `StatusChip` (tinted, dot + label): "I'm trapped" error, "Can't move" warning, "I'm out" success. System events: quiet one-line rows with icon.
- **Crew:** call signs in mono ("E7 · Reyes", "L3 · Okafor", "BC2"), realistic fireground updates.
- **Composer:** Enter sends, Shift+Enter newline. Responder messages sent as "E7 · Reyes".

### 10.2 Resident

- Header: "Responders · Engine 7", "Connected" status dot, "Clear messages" with inline confirm.
- Single thread for `viewingAsId`: same `MessageRow`s, including system route updates.
- `QuickReplies`: three full-width 48px buttons with icon + label pinned above the composer: "I'm out" (success), "I'm trapped" (error), "Can't move" (warning). Tapping calls `sendQuickReply` and shows brief "Sent" confirmation.

### 10.3 Shared and persisted

Both perspectives read the same `threads`. Messages persist across reloads. "Clear messages" clears that thread for both sides. "Reset demo" (Dev popover) restores all mock data.

## 11. DevCorner

A "Dev" icon button in the TopBar (left of incident status) opens a small popover: Resident "viewing as" picker, Go | Auto | Stay override (`devGoStay`), "Reset demo".

## 12. Mock data (`src/data/mock.ts`)

Incident: Maple Court Apartments, 1420 Alder St; started 14 minutes before load; fire on F2; smoke reaching F3.

| Unit | People | Status | Priority | Notes |
|---|---|---|---|---|
| 2D | 3 | trapped | critical | Next to fire; infant |
| 2B | 1 | immobile | critical | Wheelchair |
| 3B | 2 | sheltering | moderate | Default resident |
| 3F | 1 | unknown | moderate | No reply in 6 min |
| 2G | 2 | evacuating | moderate | Moving toward Stair B |
| 4A | 4 | sheltering | moderate | Above smoke |
| 1C | 2 | evacuated | safe | At staging |
| 4E | 1 | evacuated | safe | At staging |

- Each of the 8 resident threads: 6–10 messages mixing free text, quick-reply chips and system events. Crew thread: ~10 messages.
- Four cameras: Hall 2, Stair A, Lobby, Hall 3 (no signal).
- Timestamps relative to load time so the demo always looks current.

## 13. Error handling

- Persisted state is validated on load (version + shape check); on mismatch, fall back to mock data rather than crash.
- Composer ignores empty/whitespace messages; max length 500.
- Drag drops outside any floor snap back.
- Router returns `blocked: true` instead of throwing when no path exists.
- A top-level error boundary shows a plain "Something went wrong · Reset demo" panel.

## 14. Testing

- Vitest unit tests: router (open path, one stair blocked, both blocked), priority ordering, guidance go/stay text, store actions (quick reply effects, message visible from both perspectives, clear thread, reset, system event on route change).
- `tsc --noEmit` and `vite build` must pass.
- Manual browser walkthrough via `/browse`.
- No E2E suite (deliberate trade-off for a hackathon demo; deviates from the global 80% coverage rule).
