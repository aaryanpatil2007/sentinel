import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_SCENES } from '../src/ar/sample-packets.js';
import { cueFor, hazardsOnRoute, packetSignature, pathLength, positionAt, statusInfo, stepIndexAt, toScene, THEMES } from '../src/ar/packet.js';

const scene = id => SAMPLE_SCENES.find(s => s.id === id);

test('sample scenes cover both personas before and after the stairwell block', () => {
  assert.deepEqual(SAMPLE_SCENES.map(s => s.id), ['responder-initial', 'civilian-initial', 'responder-reroute', 'civilian-reroute']);
  for (const s of SAMPLE_SCENES) {
    const p = s.packet;
    assert.equal(p.persona, s.persona);
    assert.equal(p.status, 'candidate');
    assert.equal(p.requires_command_approval, true);
    assert.equal(p.provenance, 'simulated');
    assert.equal(p.coordinate_frame, 'JACOBS_LOCAL');
    assert.ok(p.steps.length > 0 && p.render_path.length >= p.nodes.length);
    assert.ok(p.floors.some(f => f.on_route));
    assert.ok(!/\bsafe\b/i.test(p.disclaimer));
  }
});

test('reroute scene avoids the blocked west stairwell and flags hazards on route', () => {
  const initial = scene('responder-initial').packet, reroute = scene('responder-reroute').packet;
  assert.ok(initial.nodes.includes('F2_STAIR_A'));
  assert.ok(!reroute.nodes.includes('F2_STAIR_A'));
  assert.ok(reroute.hazards.some(h => h.hazard_type === 'blocked' && h.verified));
  assert.ok(hazardsOnRoute(reroute).length > 0);
  assert.notEqual(packetSignature(initial), packetSignature(reroute));
  assert.equal(packetSignature(initial), packetSignature(structuredClone(initial)));
});

test('civilian scenes route to an exit and carry a draft advisory without risk data', () => {
  const p = scene('civilian-initial').packet;
  assert.equal(p.destination.kind, 'exit');
  assert.match(p.message, /pending command approval/i);
  assert.deepEqual(p.risk, {});
  assert.equal(THEMES.civilian.showRisk, false);
});

test('positionAt walks the render path from start to end with sensible headings', () => {
  const p = scene('responder-initial').packet, rp = p.render_path, total = pathLength(p);
  const start = positionAt(rp, 0), end = positionAt(rp, total), beyond = positionAt(rp, total + 50);
  assert.deepEqual([start.x, start.y, start.z], [rp[0].x, rp[0].y, rp[0].z]);
  assert.deepEqual([end.x, end.y, end.z], [rp.at(-1).x, rp.at(-1).y, rp.at(-1).z]);
  assert.deepEqual([beyond.x, beyond.y, beyond.z], [end.x, end.y, end.z]);
  const mid = positionAt(rp, 5);                 // halfway up the first 10 m leg heading north
  assert.deepEqual([mid.x, mid.y, mid.z], [20, 5, 0]);
  assert.equal(mid.heading, 0);
  assert.equal(mid.floor_id, 'F1');
  const west = positionAt(rp, 14);               // on the F1 corridor heading west
  assert.equal(west.heading, 270);
  const climbing = rp.find((q, i) => i && q.z > rp[i - 1].z);
  const onRamp = positionAt(rp, climbing.distance_along_m - .5);
  assert.ok(onRamp.slope > 0 && onRamp.z > 0 && onRamp.z < 4);
});

test('stepIndexAt maps progress onto steps and clamps at the end', () => {
  const { steps } = scene('responder-initial').packet;
  assert.equal(stepIndexAt(steps, 0), 0);
  assert.equal(stepIndexAt(steps, steps[0].arrive_at_m - .01), 0);
  assert.equal(stepIndexAt(steps, steps[0].arrive_at_m + .01), 1);
  assert.equal(stepIndexAt(steps, 1e9), steps.length - 1);
  assert.equal(stepIndexAt([], 3), -1);
});

test('cue text follows the engine turn classification', () => {
  const { steps } = scene('responder-initial').packet;
  const left = steps.find(s => s.turn === 'left'), up = steps.find(s => s.turn === 'up');
  assert.equal(cueFor(left, THEMES.responder).title, 'Turn left');
  assert.equal(cueFor(left, THEMES.responder, { remaining: 3.25 }).detail, '3.3 m to West Corridor (F1)');
  assert.equal(cueFor(left, THEMES.responder).rotation, -90);
  assert.equal(cueFor(up, THEMES.responder).title, 'Take the stairs up');
  assert.match(cueFor(steps.at(-1), THEMES.responder).detail, /reach Studio 210$/);
  assert.match(cueFor(scene('civilian-initial').packet.steps.at(-1), THEMES.civilian).detail, /exit at /);
});

test('status info and frame mapping', () => {
  assert.equal(statusInfo({ status: 'candidate' }).tone, 'amber');
  assert.equal(statusInfo({ status: 'unreachable' }).tone, 'red');
  assert.equal(statusInfo({ status: 'no_active_route' }).tone, 'muted');
  assert.deepEqual(toScene({ x: 1, y: 2, z: 3 }), [1, 3, -2]);   // north → -z
});
