// Pure helpers over engine guidance packets. No DOM, no Three.js, so they run
// under `node --test`. A packet is what `GET /guidance/{persona}/{id}` returns;
// see sentinel_engine/guidance.py for the schema.

export const THEMES = {
  responder: {
    persona: 'responder', name: 'Firefighter', badge: 'FIREFIGHTER', destinationWord: 'VICTIM',
    accent: '#ffb347', path: '#ff9f1c', waypoint: '#ffd166', destination: '#ff5e5b',
    wall: '#62d0ff', grid: '#163a63', slab: '#0b1d35', label: '#9fd9ff', showRisk: true,
  },
  civilian: {
    persona: 'civilian', name: 'Occupant', badge: 'OCCUPANT', destinationWord: 'EXIT',
    accent: '#5ef2c0', path: '#36e0a7', waypoint: '#9cf5dc', destination: '#5ef2c0',
    wall: '#62d0ff', grid: '#163a63', slab: '#0b1d35', label: '#9fd9ff', showRisk: false,
  },
};

export const TURN_LABEL = {
  start: 'Head out', straight: 'Continue straight', continue: 'Continue',
  slight_left: 'Bear left', left: 'Turn left', sharp_left: 'Sharp left',
  slight_right: 'Bear right', right: 'Turn right', sharp_right: 'Sharp right',
  u_turn: 'Turn around', up: 'Take the stairs up', down: 'Take the stairs down',
};
// Arrow rotation in degrees; 0 points forward (up on screen).
export const TURN_ROTATION = {
  start: 0, straight: 0, continue: 0, slight_left: -45, left: -90, sharp_left: -135,
  slight_right: 45, right: 90, sharp_right: 135, u_turn: 180, up: 0, down: 180,
};

// Engine frame is x east, y north, z up. Three.js is y up, so north maps to -z.
export const toScene = p => [p.x, p.z, -p.y];

export const formatMeters = m => (m < 10 ? `${Math.max(0, m).toFixed(1)} m` : `${Math.round(m)} m`);

export function pathLength(packet) {
  const rp = packet?.render_path ?? [];
  return rp.length ? rp[rp.length - 1].distance_along_m : 0;
}

// Interpolated position + heading (bearing degrees from north) at distance d
// along the densified render path.
export function positionAt(renderPath, d) {
  if (!renderPath?.length) return null;
  const n = renderPath.length, total = renderPath[n - 1].distance_along_m;
  d = Math.max(0, Math.min(total, Number.isFinite(d) ? d : 0));
  let i = 0;
  while (i < n - 2 && renderPath[i + 1].distance_along_m <= d) i++;
  const a = renderPath[i], b = renderPath[Math.min(i + 1, n - 1)];
  const len = b.distance_along_m - a.distance_along_m;
  const t = len > 1e-9 ? (d - a.distance_along_m) / len : 0;
  let dx = b.x - a.x, dy = b.y - a.y;
  const dz = b.z - a.z;
  let j = i;
  while (Math.hypot(dx, dy) < 1e-6 && j > 0) { j--; dx = renderPath[j + 1].x - renderPath[j].x; dy = renderPath[j + 1].y - renderPath[j].y; }
  const heading = Math.hypot(dx, dy) < 1e-6 ? 0 : (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return {
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    heading, slope: len > 1e-9 ? dz / len : 0, segment: i,
    floor_id: t < .5 ? a.floor_id : b.floor_id, total,
  };
}

// Index of the step currently being walked at distance d (last step once arrived).
export function stepIndexAt(steps, d) {
  if (!steps?.length) return -1;
  const i = steps.findIndex(s => d < s.arrive_at_m - 1e-6);
  return i === -1 ? steps.length - 1 : i;
}

// Changes whenever the route, its status, or the hazard picture changes.
export function packetSignature(packet) {
  if (!packet) return '';
  const hz = (packet.hazards ?? []).map(h => `${h.hazard_id}:${h.hazard_type}:${h.verified ? 1 : 0}`).sort().join(';');
  return [packet.persona, packet.status, packet.route_id, (packet.nodes ?? []).join(','), packet.destination?.node_id ?? '', hz].join('|');
}

export function statusInfo(packet) {
  switch (packet?.status) {
    case 'candidate': return { label: 'Candidate · requires command approval', tone: 'amber' };
    case 'unreachable': return { label: 'Unreachable · no traversable path', tone: 'red' };
    case 'no_location': return { label: 'Location unresolved · needs contact', tone: 'red' };
    case 'no_active_route': return { label: 'No active route', tone: 'muted' };
    default: return { label: 'No data', tone: 'muted' };
  }
}

export const floorsOnRoute = packet => (packet?.floors ?? []).filter(f => f.on_route);
export const hazardsOnRoute = packet => (packet?.hazards ?? []).filter(h => h.on_route);
export const describeRoute = packet => (packet?.origin && packet?.destination ? `${packet.origin.label} → ${packet.destination.label}` : '—');

// Instruction card text for one step.
export function cueFor(step, theme, { remaining } = {}) {
  if (!step) return { title: '—', detail: '', next: '' };
  const dist = remaining ?? step.distance_m;
  if (step.turn === 'up' || step.turn === 'down') {
    return { title: TURN_LABEL[step.turn], detail: `to ${step.to_label}`, rotation: TURN_ROTATION[step.turn] };
  }
  const title = TURN_LABEL[step.turn] ?? 'Continue';
  const target = step.is_final && theme ? `${theme.destinationWord.toLowerCase() === 'exit' ? 'exit at' : 'reach'} ${step.to_label}` : step.to_label;
  return { title, detail: `${formatMeters(dist)} to ${target}`, rotation: TURN_ROTATION[step.turn] ?? 0 };
}

export function hazardLabel(h) {
  const parts = [h.hazard_type.toUpperCase()];
  if (!h.verified) parts.push('unverified');
  if (h.on_route) parts.push('on route');
  return parts.join(' · ');
}
