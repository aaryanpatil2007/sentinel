import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { THEMES, toScene, positionAt, pathLength, stepIndexAt, hazardLabel } from './packet.js';

// Blueprint-style guidance renderer. Draws one packet: on-route floors as
// translucent line-work (zones, walls with door gaps, stair hatching), the
// route as a chevron ribbon, waypoint/destination/hazard markers, and either a
// first-person walkthrough camera or an orbit overview. Schematic by design:
// no textures, no lighting, nothing pretends to be a photograph of the building.

const EYE_HEIGHT = 1.6, WALK_SPEED = 1.4, RIBBON_WIDTH = .9;
const BG = 0x06142a;
const ZONE_FILL = { corridor: 0x10335a, room: 0x0d2748, stairs: 0x143c63, elevator: 0x0a1f3c, entrance: 0x10335a, staging: 0x0a1c33 };
const HAZARD_COLOR = { fire: 0xff5a3c, smoke: 0xa7b4c4, blocked: 0xff3b30 };

const RIBBON_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FRAG = `
uniform float uTime; uniform vec3 uColor; uniform float uBase; varying vec2 vUv;
void main(){
  float v = abs(vUv.y - 0.5) * 2.0;
  float phase = fract((vUv.x + v * 0.55) * 0.9 - uTime * 1.1);
  float chevron = smoothstep(0.0, 0.06, phase) * (1.0 - smoothstep(0.30, 0.40, phase));
  float edge = 1.0 - smoothstep(0.82, 1.0, v);
  gl_FragColor = vec4(uColor, (uBase + chevron * 0.8) * edge);
}`;
const GLOW_FRAG = `
uniform vec3 uColor; varying vec2 vUv;
void main(){ float v = abs(vUv.y - 0.5) * 2.0; gl_FragColor = vec4(uColor, (1.0 - v) * (1.0 - v) * 0.28); }`;

const lerpAngle = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };

export class BlueprintView {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(BG);
    this.walkFog = new THREE.Fog(BG, 16, 60);
    this.camera = new THREE.PerspectiveCamera(64, 1, .05, 400);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer(); this.labelRenderer.domElement.className = 'bp-labels';
    container.appendChild(this.labelRenderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .08; this.controls.maxPolarAngle = Math.PI * .49;
    this.building = new THREE.Group(); this.pathGroup = new THREE.Group(); this.markers = new THREE.Group();
    this.scene.add(this.building, this.pathGroup, this.markers);
    this.mode = 'walk'; this.playing = true; this.speed = 1; this.progress = 0; this.total = 0; this.heading = 0;
    this.shaders = []; this.pulsers = []; this.floorLabels = []; this.waypointLabels = []; this.floorGroups = [];
    this.clock = new THREE.Clock(); this.onFrame = null; this.packet = null; this.theme = THEMES.responder;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize();
    this.animate = this.animate.bind(this); requestAnimationFrame(this.animate);
  }

  // ------------------------------------------------------------------ helpers
  mat(color, opts = {}) { return new THREE.MeshBasicMaterial({ color, ...opts }); }
  lines(points, color, { opacity = 1, dashed = false } = {}) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: .6, gapSize: .4, transparent: true, opacity })
      : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const line = new THREE.LineSegments(g, m); if (dashed) line.computeLineDistances(); return line;
  }
  label(text, pos, className, parent = this.building) {
    const el = document.createElement('div'); el.className = `bp-label ${className}`; el.innerHTML = text;
    const obj = new CSS2DObject(el); obj.position.set(...pos); parent.add(obj); return obj;
  }
  clear(group) {
    while (group.children.length) {
      const c = group.children[0]; group.remove(c);
      c.traverse?.(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => m.dispose?.()); o.element?.remove?.(); });
      c.element?.remove?.();
    }
  }

  // ------------------------------------------------------------------ loading
  load(packet) {
    this.packet = packet; this.theme = THEMES[packet.persona] ?? THEMES.responder;
    [this.building, this.pathGroup, this.markers].forEach(g => this.clear(g));
    this.shaders = []; this.pulsers = []; this.floorLabels = []; this.waypointLabels = []; this.floorGroups = [];
    this.total = pathLength(packet); this.progress = 0; this.playing = this.total > 0;
    const floors = packet.floors.filter(f => f.on_route);
    this.floors = floors.length ? floors : packet.floors;
    for (const floor of this.floors) this.buildFloor(floor);
    if (packet.render_path?.length) { this.buildRibbon(packet.render_path, this.theme.path, RIBBON_WIDTH, .16); this.buildGlow(packet.render_path, this.theme.path); }
    if (packet.alternate_render_path?.length) {
      const pts = packet.alternate_render_path.map(p => { const [x, y, z] = toScene(p); return [x, y + .08, z]; });
      const segs = []; for (let i = 1; i < pts.length; i++) segs.push(pts[i - 1], pts[i]);
      this.pathGroup.add(this.lines(segs, 0x8aa4c8, { opacity: .55, dashed: true }));
    }
    this.buildMarkers(); this.buildHazards(); this.buildWalker();
    const start = positionAt(packet.render_path, 0); this.heading = start?.heading ?? 0;
    this.fitOverview(); this.setMode(this.total > 0 ? this.mode : 'overview', true); this.updateVisibility(start?.floor_id);
  }

  buildFloor(floor) {
    const y = floor.elevation_m, t = this.theme, o = floor.outline;
    // Everything for one floor lives in its own group so the walkthrough can dim
    // the floors the camera is not on (ceiling/floor slabs become faint grids).
    const group = new THREE.Group(); group.userData = { floor: floor.floor_id, dim: 1 };
    this.building.add(group); this.floorGroups.push(group);
    const building = this.building; this.building = group;
    try { this.buildFloorInto(floor, y, t, o); } finally { this.building = building; }
    group.traverse(obj => { if (obj.material) obj.userData.baseOpacity = obj.material.opacity; });
  }
  buildFloorInto(floor, y, t, o) {
    if (o) {
      const w = o.x_max - o.x_min, d = o.y_max - o.y_min, cx = (o.x_min + o.x_max) / 2, cz = -(o.y_min + o.y_max) / 2;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.2, d + 1.2), this.mat(t.slab, { transparent: true, opacity: .9 }));
      slab.rotation.x = -Math.PI / 2; slab.position.set(cx, y - .02, cz); this.building.add(slab);
      const minor = [], major = [];
      for (let x = Math.ceil(o.x_min); x <= o.x_max; x++) (x % 5 ? minor : major).push([x, y + .004, -o.y_min], [x, y + .004, -o.y_max]);
      for (let yy = Math.ceil(o.y_min); yy <= o.y_max; yy++) (yy % 5 ? minor : major).push([o.x_min, y + .004, -yy], [o.x_max, y + .004, -yy]);
      this.building.add(this.lines(minor, t.grid, { opacity: .45 }), this.lines(major, t.grid, { opacity: .95 }));
      const ring = [[o.x_min, y + .01, -o.y_min], [o.x_max, y + .01, -o.y_min], [o.x_max, y + .01, -o.y_min], [o.x_max, y + .01, -o.y_max], [o.x_max, y + .01, -o.y_max], [o.x_min, y + .01, -o.y_max], [o.x_min, y + .01, -o.y_max], [o.x_min, y + .01, -o.y_min]];
      this.building.add(this.lines(ring, t.wall, { opacity: .7 }));
      this.floorLabels.push(Object.assign(this.label(`${floor.floor_id} <small>${floor.name}</small>`, [o.x_min + .4, y + 2.6, -(o.y_max - .4)], 'bp-floor'), { userData: { floor: floor.floor_id, kind: 'floor' } }));
    }
    for (const zone of floor.zones) {
      const w = zone.x_max - zone.x_min, d = zone.y_max - zone.y_min, cx = (zone.x_min + zone.x_max) / 2, cz = -(zone.y_min + zone.y_max) / 2;
      const risk = t.showRisk ? (this.packet.zone_risk?.[zone.zone_id] ?? 0) : 0;
      // Predicted spread risk tints the zone amber, then red above 50%; kept subtle so
      // moderate risk reads as a caution, not as fire.
      const riskColor = new THREE.Color(0xffb347).lerp(new THREE.Color(0xff3b30), Math.max(0, (risk - .5) * 2));
      const color = new THREE.Color(ZONE_FILL[zone.kind] ?? ZONE_FILL.room).lerp(riskColor, Math.min(1, risk) * .5);
      if (zone.kind !== 'staging') {
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mat(color, { transparent: true, opacity: .55, depthWrite: false }));
        fill.rotation.x = -Math.PI / 2; fill.position.set(cx, y + .012, cz); this.building.add(fill);
      } else {
        const corners = [[zone.x_min, zone.y_min], [zone.x_max, zone.y_min], [zone.x_max, zone.y_max], [zone.x_min, zone.y_max]].map(([x, yy]) => [x, y + .02, -yy]);
        this.building.add(this.lines(corners.flatMap((c, i) => [c, corners[(i + 1) % 4]]), t.wall, { opacity: .5, dashed: true }));
      }
      if (zone.kind === 'stairs') {
        const hatch = [], along = w >= d ? 'x' : 'y';
        if (along === 'x') for (let x = zone.x_min + .35; x < zone.x_max; x += .35) hatch.push([x, y + .02, -zone.y_min - .3], [x, y + .02, -zone.y_max + .3]);
        else for (let yy = zone.y_min + .35; yy < zone.y_max; yy += .35) hatch.push([zone.x_min + .3, y + .02, -yy], [zone.x_max - .3, y + .02, -yy]);
        this.building.add(this.lines(hatch, t.wall, { opacity: .35 }));
      }
      const riskText = risk > .05 ? `<small class="risk">spread risk ${Math.round(risk * 100)}%</small>` : '';
      const labelHeight = zone.kind === 'elevator' ? 2.1 : .9;   // lift the elevator tag clear of the corridor tag
      this.floorLabels.push(Object.assign(this.label(`${zone.label}${riskText}`, [cx, y + labelHeight, cz], `bp-zone bp-${zone.kind}`), { userData: { floor: floor.floor_id, kind: 'zone' } }));
    }
    // Walls: one merged line set + one merged translucent fill per floor.
    const edges = [], tris = [];
    for (const wll of floor.walls) {
      const h = wll.height_m ?? 2.7, a = [wll.x1, y, -wll.y1], b = [wll.x2, y, -wll.y2], a2 = [wll.x1, y + h, -wll.y1], b2 = [wll.x2, y + h, -wll.y2];
      edges.push(a, b, a2, b2, a, a2, b, b2); tris.push(...a, ...b, ...b2, ...a, ...b2, ...a2);
    }
    this.building.add(this.lines(edges, t.wall, { opacity: .95 }));
    const fillGeo = new THREE.BufferGeometry(); fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    this.building.add(new THREE.Mesh(fillGeo, this.mat(t.wall, { transparent: true, opacity: .11, side: THREE.DoubleSide, depthWrite: false })));
    const thresholds = [];
    for (const door of floor.doors) {
      const hw = door.width_m / 2;
      if (door.wall === 'N' || door.wall === 'S') thresholds.push([door.x - hw, y + .025, -door.y], [door.x + hw, y + .025, -door.y]);
      else thresholds.push([door.x, y + .025, -(door.y - hw)], [door.x, y + .025, -(door.y + hw)]);
    }
    if (thresholds.length) this.building.add(this.lines(thresholds, t.accent, { opacity: .9 }));
  }

  ribbonGeometry(renderPath, width, lift) {
    const pts = renderPath.map(p => new THREE.Vector3(...toScene(p)));
    const dirs = pts.map((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)]; return q.clone().sub(r); });
    const pos = [], uv = [], idx = [];
    pts.forEach((p, i) => {
      const d = dirs[i]; const perp = new THREE.Vector3(-d.z, 0, d.x); if (perp.lengthSq() < 1e-9) perp.set(1, 0, 0); perp.normalize().multiplyScalar(width / 2);
      pos.push(p.x - perp.x, p.y + lift, p.z - perp.z, p.x + perp.x, p.y + lift, p.z + perp.z);
      uv.push(renderPath[i].distance_along_m, 0, renderPath[i].distance_along_m, 1);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  buildRibbon(renderPath, color, width, base) {
    const material = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uBase: { value: base } } });
    const mesh = new THREE.Mesh(this.ribbonGeometry(renderPath, width, .06), material); mesh.renderOrder = 5; this.pathGroup.add(mesh); this.shaders.push(material);
    const pts = renderPath.map(p => { const [x, y, z] = toScene(p); return [x, y + .07, z]; }), segs = [];
    for (let i = 1; i < pts.length; i++) segs.push(pts[i - 1], pts[i]);
    this.pathGroup.add(this.lines(segs, color, { opacity: .9 }));
  }
  buildGlow(renderPath, color) {
    const material = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) } } });
    const mesh = new THREE.Mesh(this.ribbonGeometry(renderPath, RIBBON_WIDTH * 2.4, .04), material); mesh.renderOrder = 4; this.pathGroup.add(mesh);
  }

  ring(pos, inner, outer, color, { opacity = .9, parent = this.markers } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), this.mat(color, { transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos[0], pos[1] + .03, pos[2]); m.renderOrder = 6; parent.add(m); return m;
  }
  beacon(pos, height, color, opacity = .7) { this.markers.add(this.lines([[pos[0], pos[1], pos[2]], [pos[0], pos[1] + height, pos[2]]], color, { opacity })); }

  buildMarkers() {
    const p = this.packet, t = this.theme;
    if (p.origin) {
      const pos = toScene(p.origin.position);
      this.ring(pos, .3, .4, t.accent, { opacity: .8 });
      this.label(`<span class="dot"></span>${p.entity?.entity_id ?? 'You'} <small>start · ${p.origin.label}</small>`, [pos[0], pos[1] + 1.2, pos[2]], 'bp-origin', this.markers);
    }
    (p.steps ?? []).forEach((step, i) => {
      // Place markers where the walked path actually arrives: for a stair step that is
      // the top of the ramp, not the stair node floating above it.
      const arrive = positionAt(p.render_path, step.arrive_at_m);
      const pos = toScene(arrive ?? step.waypoint), final = step.is_final;
      if (!final) {
        this.ring(pos, .3, .4, t.waypoint, { opacity: .85 }); this.beacon(pos, 1.3, t.waypoint, .5);
        const lab = this.label(`<b>${i + 1}</b> ${step.to_label}`, [pos[0], pos[1] + 1.5, pos[2]], 'bp-waypoint', this.markers);
        lab.userData = { step: i, floor: step.floor_id }; this.waypointLabels.push(lab);
      }
    });
    if (p.destination) {
      const pos = toScene(p.destination.position);
      const outer = this.ring(pos, .6, .78, t.destination); const pulse = this.ring(pos, .3, .42, t.destination, { opacity: .7 });
      this.pulsers.push({ mesh: pulse, base: 1, amp: .9, speed: 2.2 }); this.pulsers.push({ mesh: outer, base: 1, amp: .08, speed: 2.2 });
      this.beacon(pos, 3.4, t.destination, .8);
      const who = p.destination.entity ? ` <small>${p.destination.entity.entity_id}${p.destination.entity.position_status ? ` · ${p.destination.entity.position_status}` : ''}</small>` : '';
      this.label(`<b>${t.destinationWord}</b> ${p.destination.label}${who}`, [pos[0], pos[1] + 3.6, pos[2]], 'bp-destination', this.markers);
    }
  }
  buildHazards() {
    for (const h of this.packet.hazards ?? []) {
      const pos = toScene(h.position), color = HAZARD_COLOR[h.hazard_type] ?? 0xff3b30;
      const r = this.ring(pos, .75, .95, color, { opacity: h.verified ? .95 : .6 });
      if (h.hazard_type === 'fire') { this.pulsers.push({ mesh: r, base: 1, amp: .25, speed: 3.4 }); this.ring(pos, 1.3, 1.4, color, { opacity: .35 }); }
      if (h.hazard_type === 'blocked') this.markers.add(this.lines([[pos[0] - .8, pos[1] + .05, pos[2] - .8], [pos[0] + .8, pos[1] + .05, pos[2] + .8], [pos[0] - .8, pos[1] + .05, pos[2] + .8], [pos[0] + .8, pos[1] + .05, pos[2] - .8]], color));
      if (h.hazard_type === 'smoke') this.ring(pos, 1.15, 1.25, color, { opacity: .3 });
      this.beacon(pos, 2.2, color, .6);
      this.label(`${hazardLabel(h)}<small>${h.label}</small>`, [pos[0], pos[1] + 2.4, pos[2]], `bp-hazard bp-${h.hazard_type} ${h.verified ? 'verified' : 'unverified'} ${h.on_route ? 'on-route' : ''}`, this.markers);
    }
  }
  buildWalker() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.28, 16, 12), this.mat(this.theme.accent)));
    const ring = this.ring([0, 0, 0], .45, .6, this.theme.accent, { opacity: .8, parent: g }); ring.position.y = .02;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.22, .7, 12), this.mat(this.theme.accent, { transparent: true, opacity: .9 }));
    cone.rotation.x = Math.PI / 2; cone.position.set(0, .3, -.75); g.add(cone);
    this.label(`<span class="dot"></span>${this.theme.badge}`, [0, 1.3, 0], 'bp-walker', g);
    this.walker = g; this.markers.add(g);
  }

  // ------------------------------------------------------------------ camera & modes
  fitOverview() {
    const box = new THREE.Box3();
    const rp = this.packet.render_path ?? [];
    if (rp.length) rp.forEach(p => box.expandByPoint(new THREE.Vector3(...toScene(p))));
    else for (const f of this.floors) if (f.outline) { box.expandByPoint(new THREE.Vector3(f.outline.x_min, f.elevation_m, -f.outline.y_min)); box.expandByPoint(new THREE.Vector3(f.outline.x_max, f.elevation_m + 3, -f.outline.y_max)); }
    (this.packet.hazards ?? []).filter(h => h.on_route).forEach(h => box.expandByPoint(new THREE.Vector3(...toScene(h.position))));
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(20, 0, -10), new THREE.Vector3(40, 10, 24));
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, 12) * .62 + size.y * .35;
    this.overview = { center, radius };
  }
  setMode(mode, force = false) {
    if (mode === 'walk' && this.total <= 0) mode = 'overview';
    if (!force && mode === this.mode) return;
    this.mode = mode;
    const overview = mode === 'overview';
    this.controls.enabled = overview; this.scene.fog = overview ? null : this.walkFog;
    if (this.walker) this.walker.visible = overview;
    if (overview && this.overview) {
      const { center, radius } = this.overview;
      this.controls.target.copy(center);
      this.camera.position.set(center.x + radius * 1.15, center.y + radius * 1.05, center.z + radius * 1.35);
      this.controls.update();
    }
    this.container.dataset.mode = mode;
  }
  setPlaying(v) { this.playing = v && this.total > 0; }
  setProgress(m) { this.progress = Math.max(0, Math.min(this.total, m)); }
  restart() { this.progress = 0; this.playing = this.total > 0; const s = positionAt(this.packet?.render_path, 0); if (s) this.heading = s.heading; }

  updateVisibility(currentFloor) {
    const walk = this.mode === 'walk';
    for (const g of this.floorGroups) {
      const dim = walk && g.userData.floor !== currentFloor ? .22 : 1;
      if (g.userData.dim === dim) continue;
      g.userData.dim = dim;
      g.traverse(obj => { if (obj.material) { obj.material.opacity = obj.userData.baseOpacity * dim; obj.material.transparent = true; } });
    }
    // Zone names only for the floor being walked (other floors keep just their floor tag),
    // which keeps the overview readable when two floors stack.
    for (const l of this.floorLabels) l.visible = l.userData.kind === 'floor' || l.userData.floor === currentFloor;
    const idx = stepIndexAt(this.packet?.steps, this.progress);
    for (const l of this.waypointLabels) {
      const done = l.userData.step < idx, upcoming = l.userData.step === idx || l.userData.step === idx + 1;
      l.element.classList.toggle('done', done); l.element.classList.toggle('upcoming', upcoming);
      l.visible = !walk || !done;
    }
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect(); if (!width || !height) return;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height); this.labelRenderer.setSize(width, height);
  }
  animate() {
    const dt = Math.min(this.clock.getDelta(), .1), t = this.clock.elapsedTime;
    for (const s of this.shaders) s.uniforms.uTime.value = t;
    for (const p of this.pulsers) { const s = p.base + p.amp * (.5 + .5 * Math.sin(t * p.speed)); p.mesh.scale.set(s, s, 1); }
    let info = null;
    if (this.packet) {
      if (this.playing) { this.progress = Math.min(this.total, this.progress + WALK_SPEED * this.speed * dt); if (this.progress >= this.total) this.playing = false; }
      const here = positionAt(this.packet.render_path, this.progress);
      if (here) {
        const [x, y, z] = toScene(here);
        this.heading = lerpAngle(this.heading, here.heading, 1 - Math.exp(-dt * 3.2));
        const rad = this.heading * Math.PI / 180, fwd = new THREE.Vector3(Math.sin(rad), 0, -Math.cos(rad));
        if (this.mode === 'walk') {
          this.camera.position.set(x, y + EYE_HEIGHT, z);
          const target = this.camera.position.clone().addScaledVector(fwd, 6); target.y += here.slope * 4 - .35; this.camera.lookAt(target);
        } else { this.controls.update(); this.walker.position.set(x, y, z); this.walker.rotation.y = -rad; }
        const camFwd = this.camera.getWorldDirection(new THREE.Vector3());
        const camHeading = (Math.atan2(camFwd.x, -camFwd.z) * 180 / Math.PI + 360) % 360;
        this.updateVisibility(here.floor_id);
        const stepIndex = stepIndexAt(this.packet.steps, this.progress), step = this.packet.steps[stepIndex];
        info = { progress: this.progress, total: this.total, stepIndex, step, distanceToNext: step ? Math.max(0, step.arrive_at_m - this.progress) : 0,
          heading: camHeading, floorId: here.floor_id, playing: this.playing, arrived: this.total > 0 && this.progress >= this.total - 1e-6, mode: this.mode };
      } else if (this.mode === 'overview') this.controls.update();
    }
    this.renderer.render(this.scene, this.camera); this.labelRenderer.render(this.scene, this.camera);
    if (info && this.onFrame) this.onFrame(info);
    requestAnimationFrame(this.animate);
  }
}
