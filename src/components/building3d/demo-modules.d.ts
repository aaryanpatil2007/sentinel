// Typed entry points into the teammate's demo builders (demo/src, plain JS, read-only).
declare module '@demo/furnishings.js' {
  import type { Group, Object3D } from 'three'
  export function makeFurnishing(
    view: unknown,
    parent: Object3D,
    prop: { id: string; room: string; kind: string; x: number; z: number; w: number; d: number; h: number },
    baseY: number,
  ): Group
}

declare module '@demo/response-view.js' {
  import type { Group } from 'three'
  export function makeFirefighter(view: unknown, color: number): Group
}
