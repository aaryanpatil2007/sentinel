import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { makeFurnishing } from '@demo/furnishings.js'
import { makeFirefighter } from '@demo/response-view.js'
import { ENTRANCES, FOOTPRINTS, FURNISHINGS, SHELL, footprintFor, type Footprint } from '../../data/jacobsLayout'
import { FLOOR_IDS, type FloorId, type WorldPosition } from '../../engine/types'
import { SLAB, floorY, toScene } from './coords'
import { DemoViewAdapter } from './demoAdapter'
import { PALETTE, TONE_HEX, riskOpacity } from './palette'
import type { SceneCallbacks, SceneHazard, SceneInput, SceneMarker, ScenePath } from './types'

const CLICK_SLOP_PX = 5
const PLATE_LIFT = 0.02
const WALL_HEIGHT = 1.2
const ROUTE_LIFT = 0.6
const DASH = 0.8
const GAP = 0.5
const MIN_SEGMENT = 1e-4
const CAMERA_HOME = new THREE.Vector3(34, 36, 44)

const PLATE_COLOR: Record<Footprint['kind'], number> = {
  room: PALETTE.surface,
  corridor: PALETTE.surfaceContainerHigh,
  stairs: PALETTE.surfaceContainer,
  elevator: PALETTE.outline,
  lobby: PALETTE.surfaceContainer,
  staging: PALETTE.surfaceContainer,
}

type FloorKey = FloorId | 'site'

export class BuildingScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly labels = new CSS2DRenderer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500)
  private readonly controls: OrbitControls
  private readonly view = new DemoViewAdapter()
  private readonly materials = new Map<string, THREE.Material>()
  private readonly floors = new Map<FloorKey, THREE.Group>()
  private readonly roomLabels: CSS2DObject[] = []
  private readonly plates: THREE.Mesh[] = []
  private dynamic = new THREE.Group()
  private markerPicks: THREE.Object3D[] = []
  private hazardPicks: THREE.Object3D[] = []
  private input: SceneInput | null = null
  private frame = 0
  private downAt: { x: number; y: number } | null = null
  private readonly raycaster = new THREE.Raycaster()
  private readonly resizeObserver: ResizeObserver

  constructor(private readonly container: HTMLElement, private readonly callbacks: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(PALETTE.surface)
    container.appendChild(this.renderer.domElement)
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
    container.appendChild(this.labels.domElement)

    this.camera.position.copy(CAMERA_HOME)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 3, 0)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 16
    this.controls.maxDistance = 130

    this.scene.add(new THREE.HemisphereLight(PALETTE.surface, PALETTE.outline, 2.2))
    const sun = new THREE.DirectionalLight(PALETTE.surface, 1.6)
    sun.position.set(20, 45, 30)
    this.scene.add(sun)

    this.buildStatic()
    this.scene.add(this.dynamic)

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.animate()
  }

  update(input: SceneInput): void {
    const floorChanged = this.input?.floor !== input.floor
    this.input = input
    this.rebuildDynamic()
    if (floorChanged) this.frameFloor()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.controls.dispose()
    this.clearGroup(this.dynamic)
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) o.geometry.dispose()
    })
    for (const m of this.materials.values()) m.dispose()
    this.view.dispose()
    this.renderer.forceContextLoss()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  // ---------- static building ----------

  private mat(color: number, opacity = 1, extra: THREE.MeshStandardMaterialParameters = {}): THREE.Material {
    const key = `${color}-${opacity}-${JSON.stringify(extra)}`
    const cached = this.materials.get(key)
    if (cached) return cached
    const created = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, ...extra })
    this.materials.set(key, created)
    return created
  }

  private lineMat(color: number, opacity = 1): THREE.LineBasicMaterial {
    const key = `line-${color}-${opacity}`
    const cached = this.materials.get(key)
    if (cached) return cached as THREE.LineBasicMaterial
    const created = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
    this.materials.set(key, created)
    return created
  }

  private label(parent: THREE.Object3D, text: string, pos: THREE.Vector3, className: string): CSS2DObject {
    const el = document.createElement('div')
    el.className = className
    el.textContent = text
    const obj = new CSS2DObject(el)
    obj.position.copy(pos)
    parent.add(obj)
    return obj
  }

  private floorGroup(key: FloorKey): THREE.Group {
    const existing = this.floors.get(key)
    if (existing) return existing
    const group = new THREE.Group()
    this.floors.set(key, group)
    this.scene.add(group)
    return group
  }

  private boxBetween(fp: { x0: number; y0: number; x1: number; y1: number }, floor: FloorId, height: number, lift: number): { size: THREE.Vector3; center: THREE.Vector3 } {
    const size = new THREE.Vector3(fp.x1 - fp.x0, height, fp.y1 - fp.y0)
    const center = toScene((fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2, floor, lift + height / 2)
    return { size, center }
  }

  private buildStatic(): void {
    for (const floor of FLOOR_IDS) {
      const group = this.floorGroup(floor)
      const slab = this.boxBetween(SHELL, floor, SLAB, -SLAB)
      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(slab.size.x, slab.size.y, slab.size.z), this.mat(PALETTE.surfaceContainer))
      slabMesh.position.copy(slab.center)
      group.add(slabMesh)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slabMesh.geometry), this.lineMat(PALETTE.outline))
      edges.position.copy(slab.center)
      group.add(edges)
      this.label(group, floor, toScene(SHELL.x0 - 2.5, (SHELL.y0 + SHELL.y1) / 2, floor, 0.2), 'scene-floor-tag')
    }

    for (const fp of FOOTPRINTS) {
      const group = this.floorGroup(fp.kind === 'staging' ? 'site' : fp.floor)
      const plate = this.boxBetween(fp, fp.floor, 0.05, PLATE_LIFT)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(plate.size.x, plate.size.y, plate.size.z), this.mat(PLATE_COLOR[fp.kind]))
      mesh.position.copy(plate.center)
      mesh.userData = { nodeId: fp.nodeId }
      group.add(mesh)
      if (fp.nodeId) this.plates.push(mesh)
      if (fp.kind === 'room' || fp.kind === 'stairs' || fp.kind === 'elevator') {
        const walls = this.boxBetween(fp, fp.floor, WALL_HEIGHT, PLATE_LIFT)
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(walls.size.x, walls.size.y, walls.size.z)), this.lineMat(PALETTE.outline))
        outline.position.copy(walls.center)
        group.add(outline)
      }
      if (fp.kind === 'staging') {
        const ring = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), this.lineMat(PALETTE.onSurfaceVariant, 0.6))
        ring.position.copy(plate.center)
        group.add(ring)
      }
      if (fp.kind === 'room' || fp.kind === 'staging' || fp.kind === 'lobby') {
        const text = this.label(group, fp.label, toScene((fp.x0 + fp.x1) / 2, fp.y1 - 1, fp.floor, 0.3), 'scene-room-label')
        if (fp.kind !== 'staging') this.roomLabels.push(text)
      }
    }

    for (const item of FURNISHINGS) {
      const room = footprintFor(item.nodeId)
      if (!room) continue
      const at = toScene(item.x, item.y, room.floor)
      makeFurnishing(this.view, this.floorGroup(room.floor), { id: item.id, room: item.nodeId, kind: item.kind, x: at.x, z: at.z, w: item.w, d: item.d, h: item.h }, floorY(room.floor) + PLATE_LIFT)
    }

    const site = this.floorGroup('site')
    for (const entrance of ENTRANCES) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.4), this.mat(PALETTE.success))
      door.position.copy(toScene(entrance.x, entrance.y, 'F1', 0.1))
      site.add(door)
      this.label(site, entrance.label, toScene(entrance.x, entrance.y - 1.5, 'F1', 0.2), 'scene-room-label')
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 80), this.mat(PALETTE.surfaceContainer, 0.35))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -SLAB - 0.01, 4)
    site.add(ground)
  }

  // ---------- dynamic layers ----------

  private isShared(material: THREE.Material): boolean {
    return this.view.owns(material) || new Set(this.materials.values()).has(material)
  }

  private clearGroup(group: THREE.Group): void {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
        o.geometry.dispose()
        const materials = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of materials) if (!this.isShared(m)) m.dispose()
      }
      if (o instanceof CSS2DObject) o.element.remove()
    })
    group.clear()
  }

  private rebuildDynamic(): void {
    const input = this.input
    if (!input) return
    this.clearGroup(this.dynamic)
    this.markerPicks = []
    this.hazardPicks = []
    if (input.showRisk) this.addRisk(input.risk)
    for (const hazard of input.hazards) {
      if ((hazard.type === 'fire' && !input.showFire) || (hazard.type === 'smoke' && !input.showSmoke)) continue
      this.addHazard(hazard)
    }
    for (const path of input.paths) this.addPath(path)
    for (const marker of input.markers) this.addMarker(marker)
    if (input.highlightNodeId) this.addHighlight(input.highlightNodeId, input.highlightTone ?? 'primary')
    if (input.focusFloor) this.addVeils(input.focusFloor)
    this.applyFloorVisibility()
  }

  private visible(floor: FloorId): boolean {
    const filter = this.input?.floor ?? 'all'
    return filter === 'all' || filter === floor
  }

  private addRisk(risk: Record<string, number>): void {
    for (const [nodeId, value] of Object.entries(risk)) {
      const fp = footprintFor(nodeId)
      const opacity = riskOpacity(value)
      if (!fp || opacity === 0 || fp.kind === 'staging') continue
      const plate = this.boxBetween(fp, fp.floor, 0.06, PLATE_LIFT + 0.05)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(plate.size.x, plate.size.y, plate.size.z), this.mat(PALETTE.error, Number(opacity.toFixed(2))))
      mesh.position.copy(plate.center)
      mesh.userData = { floor: fp.floor }
      this.dynamic.add(mesh)
    }
  }

  private addHazard(hazard: SceneHazard): void {
    const group = new THREE.Group()
    group.position.copy(toScene(hazard.x, hazard.y, hazard.floor, PLATE_LIFT))
    group.userData = { floor: hazard.floor, hazardId: hazard.id }
    if (hazard.type === 'fire') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.05, 32), this.mat(PALETTE.error, 0.35))
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 16), this.mat(PALETTE.error))
      flame.position.y = 0.9
      group.add(disc, flame)
    } else if (hazard.type === 'smoke') {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), this.mat(PALETTE.onSurfaceVariant, 0.22))
      cloud.position.y = 1.6
      group.add(cloud)
    } else {
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 0.25), this.mat(PALETTE.warning))
        bar.position.y = 0.6
        bar.rotation.y = angle
        group.add(bar)
      }
    }
    this.dynamic.add(group)
    this.hazardPicks.push(group)
  }

  private segment(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, floor: FloorId): THREE.Mesh | null {
    const delta = to.clone().sub(from)
    if (delta.length() < MIN_SEGMENT) return null
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material)
    mesh.position.copy(from.clone().add(to).multiplyScalar(0.5))
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    mesh.userData = { floor }
    return mesh
  }

  private addSegment(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, floor: FloorId): void {
    const mesh = this.segment(from, to, radius, material, floor)
    if (mesh) this.dynamic.add(mesh)
  }

  private addPath(path: ScenePath): void {
    const radius = path.emphasized ? 0.2 : 0.14
    const material = this.mat(PALETTE.primary, path.dimmed ? 0.3 : 1)
    const points = path.points.map((p: WorldPosition) => toScene(p.x, p.y, p.floor_id, ROUTE_LIFT))
    for (let i = 1; i < points.length; i++) {
      const floor = path.points[i].floor_id
      if (path.variant === 'rescue') {
        this.addSegment(points[i - 1], points[i], radius, material, floor)
        continue
      }
      const length = points[i - 1].distanceTo(points[i])
      for (let start = 0; start < length; start += DASH + GAP) {
        const a = points[i - 1].clone().lerp(points[i], start / length)
        const b = points[i - 1].clone().lerp(points[i], Math.min(1, (start + DASH) / length))
        this.addSegment(a, b, radius, material, floor)
      }
    }
  }

  private addMarker(marker: SceneMarker): void {
    const group = new THREE.Group()
    group.position.copy(toScene(marker.x, marker.y, marker.floor, PLATE_LIFT))
    group.userData = { floor: marker.floor, entityId: marker.id }
    if (marker.kind === 'responder') {
      group.add(makeFirefighter(this.view, PALETTE.primary))
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 12), this.mat(TONE_HEX[marker.tone]))
      body.position.y = 0.85
      group.add(body)
    }
    if (marker.selected || marker.emphasized) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 32), this.mat(PALETTE.primary))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.05
      group.add(ring)
    }
    this.label(group, marker.label, new THREE.Vector3(0, 2.3, 0), marker.selected ? 'scene-label scene-label--selected' : 'scene-label')
    this.dynamic.add(group)
    this.markerPicks.push(group)
  }

  private addHighlight(nodeId: string, tone: 'primary' | 'warning'): void {
    const fp = footprintFor(nodeId)
    if (!fp) return
    const color = tone === 'warning' ? PALETTE.warning : PALETTE.primary
    const walls = this.boxBetween(fp, fp.floor, WALL_HEIGHT, PLATE_LIFT)
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(walls.size.x, walls.size.y, walls.size.z)), this.lineMat(color))
    outline.position.copy(walls.center)
    outline.userData = { floor: fp.floor }
    const tint = this.boxBetween(fp, fp.floor, 0.06, PLATE_LIFT + 0.04)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(tint.size.x, tint.size.y, tint.size.z), this.mat(color, 0.12))
    plate.position.copy(tint.center)
    plate.userData = { floor: fp.floor }
    this.dynamic.add(outline, plate)
  }

  private addVeils(focus: FloorId): void {
    for (const floor of FLOOR_IDS) {
      if (floor === focus) continue
      const veil = this.boxBetween({ x0: SHELL.x0 - 1, y0: SHELL.y0 - 1, x1: SHELL.x1 + 1, y1: SHELL.y1 + 1 }, floor, 3, 0)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(veil.size.x, veil.size.y, veil.size.z), this.mat(PALETTE.surface, 0.6))
      mesh.position.copy(veil.center)
      mesh.userData = { floor }
      this.dynamic.add(mesh)
    }
  }

  private applyFloorVisibility(): void {
    const filter = this.input?.floor ?? 'all'
    for (const [key, group] of this.floors) group.visible = key === 'site' ? filter === 'all' || filter === 'F1' : this.visible(key)
    for (const child of this.dynamic.children) {
      const floor = child.userData.floor as FloorId | undefined
      child.visible = floor ? this.visible(floor) : true
    }
    this.syncLabelVisibility(filter)
  }

  /** CSS2DRenderer only checks a label's own `visible`, not its ancestors', so mirror group visibility onto labels. */
  private syncLabelVisibility(filter: SceneInput['floor']): void {
    for (const group of this.floors.values()) {
      group.traverse((o) => {
        if (o instanceof CSS2DObject) o.visible = group.visible && (!this.roomLabels.includes(o) || filter !== 'all')
      })
    }
    for (const child of this.dynamic.children) {
      child.traverse((o) => {
        if (o instanceof CSS2DObject) o.visible = child.visible
      })
    }
  }

  private frameFloor(): void {
    const filter = this.input?.floor ?? 'all'
    const targetY = filter === 'all' ? 3 : floorY(filter) + 1
    this.controls.target.set(0, targetY, 0)
    this.camera.position.set(CAMERA_HOME.x * (filter === 'all' ? 1 : 0.7), targetY + (filter === 'all' ? 33 : 26), CAMERA_HOME.z * (filter === 'all' ? 1 : 0.7))
  }

  // ---------- interaction & loop ----------

  private readonly onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY }
  }

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!this.downAt || Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > CLICK_SLOP_PX) return
    this.downAt = null
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = (targets: THREE.Object3D[], key: string): string | null => {
      const visibleTargets = targets.filter((t) => t.visible)
      const [first] = this.raycaster.intersectObjects(visibleTargets, true)
      let node: THREE.Object3D | null = first?.object ?? null
      while (node && node.userData[key] === undefined) node = node.parent
      return (node?.userData[key] as string | undefined) ?? null
    }
    const entity = hit(this.markerPicks, 'entityId')
    if (entity) return this.callbacks.onPickEntity?.(entity)
    const hazard = hit(this.hazardPicks, 'hazardId')
    if (hazard) return this.callbacks.onPickHazard?.(hazard)
    if (this.input?.pickableNodes) {
      const nodeId = hit(this.plates.filter((p) => p.parent?.visible), 'nodeId')
      if (nodeId) this.callbacks.onPickNode?.(nodeId)
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h)
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private readonly animate = () => {
    this.frame = requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }
}
