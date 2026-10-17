import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation, createBuilding, shortestPath, key } from '../src/simulation.js';
import { segmentClear, OBSTACLES } from '../src/building.js';

test('the demo defaults to one firefighter',()=>assert.equal(new RescueSimulation().teamSize,1));
test('fire between cool endpoints blocks the whole passage and selects a detour',()=>{
 const b=createBuilding(),a=b.nodes.get('c1-2'),z=b.nodes.get('c1-3');
 b.fires=[{id:'test',floor:1,x:-2.5,z:3,radius:.7}];
 assert.equal(segmentClear(b,a,z),false);
 const route=shortestPath(b,a.id,z.id);assert.ok(route);assert.ok(route.path.length>2);
 for(let i=1;i<route.path.length;i++)assert.ok(segmentClear(b,b.nodes.get(route.path[i-1]),b.nodes.get(route.path[i])));
});
test('a locked door and solid obstruction cannot be crossed by routing',()=>{
 const b=createBuilding(),locked=[...b.edges.values()].find(e=>e.locked);assert.ok(locked);
 const route=shortestPath(b,locked.a,locked.b);assert.ok(route===null||route.path.length>2);
 assert.ok([...b.nodes.values()].some(n=>n.type==='bathroom'));
 assert.ok(OBSTACLES.length>0);
 for(const e of b.edges.values())if(!e.blocked&&!e.locked)assert.ok(segmentClear(b,b.nodes.get(e.a),b.nodes.get(e.b)),`${e.a} to ${e.b} crosses solid geometry`);
});
test('a fire that appears in the middle of an active edge causes a physical retreat',()=>{
 const s=new RescueSimulation(),ff=s.firefighter;
 Object.assign(ff,{node:'c1-2',next:'c1-3',progress:.1,path:['c1-4']});
 s.building.fires.push({id:'test',floor:1,x:-2.5,z:3,radius:.7});
 const before=s.position(ff);s.move(ff,.01,3.4);const after=s.position(ff);
 assert.equal(ff.next,'c1-2');assert.ok(after.x<before.x);assert.ok(Math.abs(after.x-before.x)<.1);
});
test('fixed and spreading crews and walkers never move across burning footprints',()=>{
 for(const mode of ['fixed','spread'])for(const size of [1,3]){
  const s=new RescueSimulation(mode,size);s.running=true;
  for(let i=0;i<5000&&s.running;i++){
   const actors=[...s.firefighters,...s.people.filter(p=>p.status==='walking')];
   const before=actors.map(p=>({p,position:s.position(p)}));s.tick(.1);
   for(const {p,position} of before){
    const after=s.position(p);if(Math.hypot(after.x-position.x,after.y-position.y,after.z-position.z)>.0001)
     assert.ok(segmentClear(s.building,position,after,{clearance:.28}),`${mode}: actor ${p.id} crossed fire at ${s.time}`);
   }
   for(const ff of s.firefighters)for(let j=1;j<ff.path.length;j++){
    const a=ff.path[j-1],b=ff.path[j],e=s.building.edges.get(key(a,b));
    assert.ok(e&&!e.locked);
   }
  }
  if(mode==='fixed')assert.equal(s.rescued,8);
 }
});
test('an incident blockage still lets a crew complete its retreat',()=>{
 const s=new RescueSimulation(),ff=s.firefighter;
 Object.assign(ff,{node:'c1-4',next:'c1-5',progress:.4,path:[]});
 s.building.edges.get(key(ff.node,ff.next)).blocked=true;
 s.move(ff,.01,3.4);assert.equal(ff.next,'c1-4');
 for(let i=0;i<100&&ff.next;i++)s.move(ff,.1,3.4);
 assert.equal(ff.node,'c1-4');assert.equal(ff.next,null);
});
test('idle crews withdraw instead of waiting inside the advancing fire',()=>{
 const s=new RescueSimulation('spread',2);s.running=true;
 for(let i=0;i<2300&&s.running;i++)s.tick(.1);
 for(const ff of s.firefighters){const p=s.position(ff);assert.ok(segmentClear(s.building,p,p,{clearance:.28}),`Unit ${ff.id} left standing in fire at ${ff.node}`);}
});
test('an off-path fire leaves the clear part of a room reachable',()=>{
 const b=createBuilding();b.fires=[{id:'corner',floor:0,x:-7.5,z:-6,radius:1}];
 const route=shortestPath(b,'c0-2','r10C');assert.ok(route);
 for(let i=1;i<route.path.length;i++)assert.ok(segmentClear(b,b.nodes.get(route.path[i-1]),b.nodes.get(route.path[i])));
});
test('a restroom rescue makes the crew use the obstruction detour',()=>{
 const s=new RescueSimulation('fixed',1);assert.ok(s.people.some(p=>p.room==='WC3'));
 s.running=true;let detour=false;
 for(let i=0;i<4000&&s.running;i++){
  s.tick(.1);const ff=s.firefighter;
  if(ff.next&&[ff.node,ff.next].every(id=>id.startsWith('b3-')))detour=true;
 }
 assert.ok(detour,'The rescue should use the clear-side lane around fallen shelving');
 assert.equal(s.rescued,8);
});
