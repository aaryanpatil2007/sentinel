import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation, createBuilding, key } from '../src/simulation.js';
import { segmentClear } from '../src/building.js';

test('basement passage blockages come from visible flames instead of permanent X barriers',()=>{
 const clear=createBuilding(),s=new RescueSimulation();
 for(const [a,b]of [['c0-2','c0-3'],['b0-2','b0-3']]){
  assert.equal(clear.edges.get(key(a,b)).blocked,false);
  assert.ok(segmentClear(clear,clear.nodes.get(a),clear.nodes.get(b)));
  assert.equal(segmentClear(s.building,s.building.nodes.get(a),s.building.nodes.get(b)),false);
 }
});
test('spreading mode sends the first crew to both basement civilians before their short route closes',()=>{
 const s=new RescueSimulation('spread');
 assert.deepEqual(new Set(s.firefighter.pickups),new Set([1,2]));
 assert.ok(s.candidates().filter(c=>[1,2].includes(c.person.id)).every(c=>Number.isFinite(c.closesIn)));
 s.running=true;const pickups=[];
 for(let i=0;i<6000&&s.running;i++){
  s.tick(.1);
  for(const p of s.people)if(p.status==='escorted'&&!pickups.includes(p.id))pickups.push(p.id);
 }
 assert.deepEqual(new Set(pickups.slice(0,2)),new Set([1,2]));assert.equal(s.rescued,8);
});
test('waiting lets fire close the short basement doorway and replans a longer viable rescue',()=>{
 const s=new RescueSimulation('spread'),ff=s.firefighter,before=s.crewPath('r10C','e0');
 const position=s.position(ff),forecast=s.building.fires.map(f=>s.projectedRadius(f,60));assert.ok(before.path.includes('d10C'));
 s.delayResponse(60);
 assert.deepEqual(s.position(ff),position);assert.equal(s.running,false);assert.equal(s.time,60);
 s.building.fires.forEach((f,i)=>assert.ok(Math.abs(f.radius-forecast[i])<1e-6));
 assert.ok(ff.pickups.every(id=>[1,2].includes(id)),'Missed route windows must not erase the unfinished basement priority');
 assert.equal(segmentClear(s.building,s.building.nodes.get('d10C'),s.building.nodes.get('c0-2')),false);
 const after=s.crewPath('r10C','e0');assert.ok(after);assert.ok(!after.path.includes('d10C'));assert.ok(after.cost>before.cost);
 assert.ok(s.events.some(e=>e.message.includes('Basement shortcut')));
 s.running=true;for(let i=0;i<6000&&s.running;i++)s.tick(.1);assert.equal(s.rescued,8);
});
test('fixed fire has no spread deadline or waiting control effect',()=>{
 const s=new RescueSimulation('fixed'),before=JSON.stringify(s.building.fires);
 assert.ok(s.candidates().every(c=>c.closesIn===Infinity));
 s.delayResponse(60);assert.equal(s.time,0);assert.equal(JSON.stringify(s.building.fires),before);
});

test('delayed multi-crew rescues remain collision-safe and recover everyone',()=>{
 for(const size of [2,3]){
  const s=new RescueSimulation('spread',size);s.delayResponse(60);s.running=true;
  for(let i=0;i<6000&&s.running;i++){
   const actors=[...s.firefighters,...s.people.filter(p=>p.status==='walking')];
   const before=actors.map(p=>[p,s.position(p)]);s.tick(.1);
   for(const [p,position]of before)assert.ok(segmentClear(s.building,position,s.position(p),{clearance:.28}),`Delayed unit/person ${p.id} crossed fire`);
  }
  assert.equal(s.rescued,8,`${size} delayed firefighters left someone behind`);
 }
});
