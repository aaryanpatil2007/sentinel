# Sentinel — Jacobs Hall rescue demo

A standalone browser demo of UC Berkeley’s Jacobs Institute for Design Innovation, with fixed and spreading fire scenarios, endangered occupant pings, and coordinated firefighter routing.

## Open the demo

Open [`jacobs-demo.html`](jacobs-demo.html) directly in a browser. No installation, server, credentials, or backend is required. Choose a fire mode, select **1–3 firefighters** in the right panel (default: **1**), and press **Start rescue**. Click a crew card to follow that unit’s instructions and show its route. The desktop interface fits the browser viewport, with compact controls and an independently scrolling incident history. The overview uses spaced floors, compact person markers, and a small number of meaningful architectural details. Low translucent partitions have actual doorway gaps; restrooms, locked doors, workbenches, and corridor debris add context. Select a floor to reveal room and obstruction labels; Exterior shows the facade. Floor spacing is exaggerated for visibility and does not change rescue distances or timing.

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

## Building reference

The model follows the room groupings and circulation topology in UC Berkeley’s [Jacobs floor guide](https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/) and its published diagrams. A translucent outside ground surface, faint excavation faces, and explicit ground/basement labels show which floor is below grade without hiding its occupants or routes:

- [Basement](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-B-Fall-2021.png): teaching studio 10, studio 10C, metal shop, video and robotics lab.
- [Level 1](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-1-Fall-2021.png): makerspaces 110 and 120, their smaller lab rooms, advising 103, and the west lobby.
- [Level 2](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-2-Fall-2021.png): MDes studios 210 and 220, smaller lab rooms, project support 234, and the east lobby.
- [Level 3](https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-3-Fall-2021.png): open teaching studio 310, breakout rooms 310A–D, and advanced prototyping.

The diagrams show west access at level 1 and east access at level 2; Berkeley’s [visit guide](https://jacobsinstitute.berkeley.edu/connect/visit/) identifies these as Etcheverry Plaza and LeRoy Avenue. This model uses those entrances and the two stair cores; it does not invent an exterior fire escape. It includes approximate room dimensions, simplified circulation waypoints, and illustrative outdoor assembly locations. The basement is exposed as a cutaway. Restroom geometry is schematic. Locked doors, debris, fire, smoke, blocked passages, and occupant locations are a fictional incident, not actual building conditions or a surveyed emergency plan.

## Rescue rules

All eight occupants, including one in the top-floor restroom, start in immediate heat/smoke danger; low-risk bystanders are excluded from dispatch. Each firefighter can escort up to two people. The selected crew count runs simultaneously with separate colors, routes, pickup assignments, escort counts, and instructions.

The planner generates feasible single- and ordered two-person pickup jobs, including a route to a safe handoff. A bitmask dynamic program selects the maximum-scoring set of non-overlapping jobs across the active crews. Scores combine immediate danger, travel effort, time to pickup, and reassignment cost. Pairing has a bounded detour; a critical existing escort sharply limits extra pickups. This optimizes the generated assignment choices, not every possible future fire evolution or human behavior.

Both planners check every complete travel segment against solid obstructions, locked doors, and the same irregular fire footprints used by the renderer. Firefighter clearance is 0.5 model units; independent civilians keep 1.15 units from flames. Active movers recheck the remaining segment and their next physical step, retreating toward a clear endpoint when possible and holding if neither direction is safe.

A safe handoff must have an entire currently traversable route to an outside assembly point, with heat at most 0.16, smoke at most 0.22, and relative nearby danger at most 0.28 at every node. Occupants walk the remaining route independently while their firefighter resumes work. They count as safely outside only when they physically reach an assembly point. The planner handles no-route cases explicitly.

Spreading mode recalculates team plans every simulated second. Its illustrative fire fronts expand continuously as overlapping curved lobes, leaving partially burning rooms visible. A separate simplified graph model slows heat and smoke at doors, accelerates upward transmission in stair shafts, and exposes overlapping rooms above a fire. These fronts are a visual simulation, not a compartment or computational fluid dynamics model. Independent walkers recheck the route ahead. Crews with no feasible assignment withdraw on a clear route outside instead of waiting near advancing flames. Fixed mode preserves the initial hazards. Both modes reset to the same incident for comparison. Equivalent path costs include stairs and hazards; they are not surveyed meters. This is an illustrative demo, not validated fire physics or emergency guidance.

## Source

- `src/building.js`: Jacobs zones, graph, source references, level labels.
- `src/simulation.js`: hazards, safe handoffs, crew assignment, movement, autonomous evacuation.
- `src/building-view.js`: Three.js building, per-crew routes, occupant markers, camera controls.
- `src/main.js` and `src/style.css`: controls and per-unit guidance.
- `scripts/` and `tests/`: static server, standalone exporter, regression tests.

Three.js is vendored with its MIT license. Optional Google Fonts fall back to system fonts when offline.
