# Sentinel — Jacobs Hall rescue demo

A standalone browser demo of UC Berkeley’s Jacobs Institute for Design Innovation, with fixed and spreading fire scenarios, endangered occupant pings, and coordinated firefighter routing.

## Open the demo

Open [`jacobs-demo.html`](jacobs-demo.html) directly in a browser. No installation, server, credentials, or backend is required. Choose a fire mode, select **1–3 firefighters** in the right panel (default: **1**), and press **Start rescue**. Click a crew card to follow that unit’s instructions and show its route. The desktop interface fits the browser viewport, with compact controls and an independently scrolling incident history. Rescued civilians remain visible in spaced groups at the outside exit they reached, with a live safe count at each pad. In the overview, two compact fire apparatus sit along Ridge Road with folded ladders, a cone each, and small hose coils, clear of all evacuation paths. Firefighters wear charcoal turnout coats, reflective yellow bands, yellow helmets, face protection, radios, boots, and breathing-air tanks; crew colors remain on helmet/chest patches and map rings.

The overview uses spaced floors, compact person markers, and a small number of meaningful architectural details. Low translucent partitions have actual doorway gaps. A selective set of recognizable equipment adds room character: a gantry-style CNC router, a waterjet bed, saws, framed 3D printers, orange robot arms, electronics benches, pale wood workstations, mobile whiteboards, and the studio 310 teaching display. Restrooms, locked doors, and a displaced materials cart remain part of the incident. Select a floor to reveal room and obstruction labels; Exterior shows the facade. Floor spacing is exaggerated for visibility and does not change rescue distances or timing.

For development with Node.js 22 or newer:

```sh
cd demo
npm run dev
```

The server prints its local URL. Rebuild the standalone HTML after changing the source:

```sh
npm test
npm run build
```

The generated `jacobs-demo.html` is committed so that the repository download works immediately. `dist/` is generated and ignored. The `demo/` folder is independent of the parent application and uses relative asset URLs, so its regular `index.html` also works under a `/demo/` static mount.

## Guidance view (blueprint preview of the AR layer)

Open [`jacobs-ar.html`](jacobs-ar.html) for a first-person, blueprint-style walkthrough of routes computed by the Python engine in `../sentinel_engine`: the **firefighter** route to the reported occupant and the **occupant** route to the nearest exit. It is deliberately schematic (line-drawn walls with door gaps, floor grid, a chevron ribbon for the path, floating waypoint and hazard markers, a turn-by-turn cue card) rather than realistic; the same packet is what a future AR headset or phone view would consume, with the waypoints as world anchors.

- **Sample scenes** are packets exported from the engine's demo scenario (before and after the "west stairwell blocked" reroute). Regenerate them with `.venv/bin/python -m sentinel_engine.export_guidance` from the repository root, then `npm run build:ar`.
- **Live engine**: start `uvicorn sentinel_engine.api:app --port 8787`, open `ar.html?live=1` (or press **Live engine**), **Seed demo scenario**, then **Block west stairwell** to watch the route redraw. The page polls `GET /guidance/{persona}/{id}` every two seconds.
- Controls: Walkthrough / Overview (keys `1` / `2`), space to pause, `r` to restart, click a step to jump to it. Deep links: `?scene=…&mode=overview&at=<metres>&paused=1`.
- Everything shown is a candidate for command review over illustrative simulated geometry. The engine's building model is a simplified sketch (two rooms per floor, two stairwells); porting this demo's researched Jacobs layout into it is a follow-up.

Source: `src/ar/packet.js` (pure helpers, unit-tested), `src/ar/blueprint-view.js` (Three.js renderer), `src/ar/main.js` (shell, HUD, live polling), `scripts/build-ar.mjs` (single-file export).

## Building reference

The model follows the room groupings and circulation topology in UC Berkeley’s [Jacobs floor guide](https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/) and its published diagrams. A translucent outside ground surface, faint excavation faces, and explicit ground/basement labels show which floor is below grade without hiding its occupants or routes:

- [Basement](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-B-Fall-2021.png): teaching studio 10, studio 10C, metal shop, video and robotics lab.
- [Level 1](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-1-Fall-2021.png): makerspaces 110 and 120, their smaller lab rooms, advising 103, and the west lobby.
- [Level 2](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-2-Fall-2021.png): MDes studios 210 and 220, smaller lab rooms, project support 234, and the east lobby.
- [Level 3](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-3-Fall-2021.png): open teaching studio 310, breakout rooms 310A–D, and advanced prototyping.

The diagrams show west access at level 1 and east access at level 2; Berkeley’s [visit guide](https://jacobsinstitute.berkeley.edu/connect/visit/) identifies these as Etcheverry Plaza and LeRoy Avenue. This model uses those entrances and the two stair cores; it does not invent an exterior fire escape. It includes approximate room dimensions, simplified circulation waypoints, and illustrative outdoor assembly locations. The basement is exposed as a cutaway. Restroom geometry is schematic. Locked doors, debris, fire, smoke, blocked passages, and occupant locations are a fictional incident, not actual building conditions or a surveyed emergency plan.

## Room character and research

The room functions and equipment types follow Berkeley’s current [equipment guide](https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/labs-and-equipment/), [teaching-space details](https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/), [instructor guide](https://jacobsinstitute.berkeley.edu/courses/for-instructors/jacobs-hall-instructor-guide/), and [MDes interior photographs](https://design.berkeley.edu/about-mdes/studio-facilities). The latter show pale wood desks, blue chairs, pin-up/whiteboard space, and a pale blue wall palette. This model uses representative objects, reduced counts, and approximate placement to keep the rescue visible. It does not claim to reproduce the current furniture positions.

- **Basement:** OMAX-style open waterjet bed and metal-shop equipment; studio 10/10C workbench tables and stools; a video tripod and electronics station in the robotics lab.
- **Level 1:** the ShopBot/woodshop in 120; laser cutting, printer frames, electronics stations, and the KUKA-inspired orange Lucy/Ethel robot arms in 110; a sewing station in a small equipment room.
- **Level 2:** individual MDes desks and seating in 210; teaching benches and a mobile whiteboard in 220. A displaced prototyping-materials cart creates a circulation detour.
- **Level 3:** open teaching tables and the large LED teaching display in 310; breakout meeting tables; amber resin-printer enclosures and an industrial printer in the adjacent advanced prototyping lab (332). A fallen rolling whiteboard blocks part of the passage.

Circulation is intentionally adjusted for the demonstration, using secondary aisle waypoints and added doorway connections; it is Jacobs-inspired rather than an exact emergency plan. Fires, locks, the cart, and the fallen whiteboard are fictional incident conditions. All furniture collision footprints feed the same planner and movement checks as other obstructions. The low-poly objects use legs, rails, gantries, wheels, stools, screens, and articulated silhouettes instead of generic solid blocks.

## Fire placement and visible strategy changes

A ground-floor corridor fire blocks the direct west approach, so crews start at the LeRoy safe exit and enter directly. On floor 3, a localized fire closes only the left passage. A deliberately added connecting door between advanced prototyping (332) and studio 310 provides a same-floor bypass: enter the side room, cross the studio’s clear front aisle, and exit through its main door toward person 8 in the restrooms. Both shared partitions have a visible opening. This doorway is a demo adaptation rather than a claim about the surveyed floor plan. The bypass stays clear early; after 70 seconds the upper fire front accelerates and can seal the breakout-room approach. Tests compare this route with the fire-free corridor and verify that closing the connecting door restores the longer stair detour. All eight occupants must reach safety with fixed/spreading fire and 1, 2, or 3 firefighters.

In the basement, the two former permanent X passage barriers are now localized fire fronts. They block the central crossings at the start. Spreading mode forecasts geometric route loss over 180 seconds and sends the first crew to P1 and P2: waiting lets the fronts close the short studio/lab doorways. The priority queue shows approximate route windows. A missed window keeps the unfinished rescue urgent and is marked Short route lost. **Wait 60s · let fire spread** advances the incident while crews remain outside, then replans around whatever routes remain. The 10C side door takes six seconds to force. These extra openings are deliberate demo adaptations; furniture leaves a clear aisle to them. With the stronger fronts, waiting 60 seconds can lose those side-door fallbacks too. Late runs report people cut off by fire.

Select **Spreading fire → Rescue strategy** to compare Sentinel with Distance first using the same incident, crew count, capacity, forced-entry costs, movement, and fire geometry. Sentinel includes danger and predicted route loss; Distance first uses travel cost alone. With one firefighter, Sentinel recovers all eight and the distance-first baseline misses basement and upper-floor rescue windows. Cutoff detection checks connectivity while ignoring temporary heat thresholds, so a room is reported cut off only when fire or physical barriers eliminate all rescue paths.

## Rescue rules

All eight occupants, including one in the top-floor restroom, start in immediate heat/smoke danger; low-risk bystanders are excluded from dispatch. Each firefighter can escort up to two people. The selected crew count runs simultaneously with separate colors, routes, pickup assignments, escort counts, and instructions.

Civilian bodies, numbered map badges, and rescue-priority labels share a live green → yellow → orange → red → dark-red danger scale. Text labels (Low, Moderate, High, Severe, Critical) accompany the colors; badge text switches between black and white for contrast. Initial occupants remain urgent but have varied heat/smoke exposure. Escorted civilians are colored using the firefighter’s current location; independent walkers use their own interpolated location. Colors can improve as people approach safety.

The initial incident includes an occupied locked room. A firefighter must reach its doorway, spend six simulated seconds forcing the designated interior door, and only then enter and collect the occupant. Entry time is part of the planned route cost. Fire, solid obstructions, and structurally blocked links cannot be bypassed by this action.

The planner generates feasible single- and ordered two-person pickup jobs, including a route to a safe handoff. A bitmask dynamic program first covers the most currently reachable waiting occupants, then selects the highest danger/travel score among those non-overlapping jobs across the active crews. An original occupant remains a rescue assignment even as containment reduces their exposure; a low urgency score cannot leave the final person unassigned. Scores combine immediate danger, forecast time until a substantial route detour or forced entry becomes necessary, travel effort, time to pickup, and reassignment cost. Forecasts use the same growing fire footprints as movement, rather than a floor-specific priority. Pairing has a bounded detour; a critical existing escort limits new pickups while a previously planned second pickup can continue on a clear route. This optimizes the generated assignment choices, not every possible future fire evolution or human behavior.

Both planners check every complete travel segment against solid obstructions, locked doors, and the same irregular fire footprints used by the renderer. Firefighter clearance is 0.5 model units; independent civilians keep 1.15 units from flames. Active movers recheck the remaining segment and their next physical step, retreating toward a clear endpoint when possible and holding if neither direction is safe.

A safe handoff must have an entire currently traversable route to an outside assembly point, with heat at most 0.16, smoke at most 0.22, and relative nearby danger at most 0.28 at every node. Occupants walk the remaining route independently while their firefighter resumes work. They count as safely outside only when they physically reach an assembly point. The planner handles no-route cases explicitly.

Spreading mode recalculates team plans every simulated second. The favorable preset includes operating sprinklers and smoke ventilation. Middle-floor fires slow after 30 simulated seconds. Basement passage fronts expand rapidly toward both the main and side doors, while the top front begins expanding after 70 seconds, growing across the breakout-room approach. Sprinkler control and finite fuel then slow and cap their spread while heat and smoke decline in protected passages. The localized fire footprints remain impassable. This provides a plausible, optimistic demonstration in which all eight original civilians can be recovered with any of the three crew counts when Sentinel starts promptly. Distance-first dispatch and delayed response can miss rescue windows, and report the remaining occupants cut off instead of routing through fire. A separate simplified graph model slows heat and smoke at doors, accelerates upward transmission in stair shafts, and exposes overlapping rooms above a fire. These fronts are a visual simulation, not a compartment or computational fluid dynamics model. Independent walkers recheck the route ahead. Faint, soft-edged room haze and rising source wisps show smoke without opaque clouds. The **Smoke** toolbar switch hides those visuals while preserving smoke hazards and routing. Crews with no feasible assignment withdraw on a clear route outside instead of waiting near advancing flames. Fixed mode preserves the initial hazards. Both modes reset to the same incident for comparison. Equivalent path costs include stairs and hazards; they are not surveyed meters. This is an illustrative demo, not validated fire physics or emergency guidance.

## Source

- `src/building.js`: Jacobs zones, graph, researched furnishing placements, source references, shared danger palette.
- `src/simulation.js`: hazards, safe handoffs, crew assignment, movement, autonomous evacuation.
- `src/response-view.js`: turnout-gear firefighter models and compact street-side apparatus.
- `src/furnishings.js`: recognizable low-poly room equipment and furniture.
- `src/building-view.js`: Three.js building, per-crew routes, occupant markers, camera controls.
- `src/main.js` and `src/style.css`: controls and per-unit guidance.
- `src/ar/`: the engine-driven guidance view (blueprint/AR preview); `sample-packets.js` is generated.
- `scripts/` and `tests/`: static server, standalone exporter, regression tests.

Three.js is vendored with its MIT license. Optional Google Fonts fall back to system fonts when offline.
