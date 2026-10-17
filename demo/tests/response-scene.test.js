import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation } from '../src/simulation.js';
import { RESPONSE_STAGING, segmentClear } from '../src/building.js';

test('rescued civilians keep distinct stable places at the exit they reached',()=>{
 const s=new RescueSimulation('fixed',1);s.running=true;
 for(let i=0;i<4000&&s.running;i++)s.tick(.1);
 assert.equal(s.rescued,8);const positions=s.people.map(p=>s.position(p));
 for(const p of s.people){
  assert.ok(['safe','safe-east'].includes(p.node));assert.ok(Number.isInteger(p.assemblySlot));
  const n=s.building.nodes.get(p.node),pos=s.position(p);assert.ok(Math.abs(pos.x-n.x)<2.5);assert.ok(Math.abs(pos.z-n.z)<1.3);assert.equal(s.urgency(p),0);
 }
 assert.equal(new Set(positions.map(p=>JSON.stringify(p))).size,8);
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){const a=positions[i],b=positions[j];if(a.y===b.y)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=1.14,'Civilian ground rings must not overlap');}
 for(let i=0;i<200;i++)s.tick(.1);assert.deepEqual(s.people.map(p=>s.position(p)),positions);
 s.reset();assert.ok(s.people.every(p=>p.assemblySlot===undefined));
});
test('response vehicles stay clear of entrances, outside evacuation links, and assemblies',()=>{
 const s=new RescueSimulation();assert.ok(RESPONSE_STAGING.length<=2);
 for(const edge of s.building.edges.values())assert.ok(segmentClear({obstacles:RESPONSE_STAGING},s.building.nodes.get(edge.a),s.building.nodes.get(edge.b),{ignoreFire:true}),`${edge.a} to ${edge.b} crosses a vehicle`);
});
