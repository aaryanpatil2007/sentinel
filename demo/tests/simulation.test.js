import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation, createBuilding, shortestPath, key, BLOCK_HEAT } from '../src/simulation.js';
function advance(s,seconds){s.running=true;for(let i=0;i<seconds*10&&s.running;i++)s.tick(.1);}
test('Jacobs has a basement, three floors, and entrances at the published levels',()=>{
 const b=createBuilding();assert.deepEqual([...new Set([...b.nodes.values()].map(n=>n.floor))].sort(),[0,1,2,3]);
 assert.equal(b.nodes.get('west-exit').floor,1);assert.equal(b.nodes.get('east-exit').floor,2);
 for(const room of ['10','10C','120','110','220','210','310','310A','310B','310C','310D','APT'])assert.ok(b.nodes.has(`r${room}`));
});
test('paths avoid the blocked west stair and find the east entrance instead',()=>{
 const b=createBuilding(),r=shortestPath(b,'r310C','safe-east');assert.ok(r);assert.ok(r.path.includes('e2'));
 for(let i=1;i<r.path.length;i++)assert.equal(b.edges.get(key(r.path[i-1],r.path[i])).blocked,false);
});
test('low-risk occupants are excluded from rescue assignments',()=>{
 const s=new RescueSimulation();s.people.push({id:9,node:'safe',room:'Outside',status:'waiting'});s.plan();
 assert.ok(!s.candidates().some(c=>c.person.id===9));assert.ok(!s.firefighters.some(f=>f.pickups.includes(9)));
});
test('an isolated person is not assigned to a crew',()=>{
 const s=new RescueSimulation(),p=s.people[2];for(const {edge}of s.building.adjacency.get(p.node))edge.blocked=true;s.plan();
 assert.ok(!s.firefighters.some(f=>f.pickups.includes(p.id)));assert.equal(s.candidates().find(c=>c.person.id===p.id).escape,null);
});
test('fixed mode evacuates everyone without changing heat or crossing blocked links',()=>{
 const s=new RescueSimulation(),initial=[...s.building.nodes.values()].map(n=>[n.heat,n.smoke]);s.running=true;
 for(let i=0;i<4000&&s.running;i++){s.tick(.1);for(const ff of s.firefighters)if(ff.next){assert.equal(s.building.edges.get(key(ff.node,ff.next)).blocked,false);assert.ok(s.building.nodes.get(ff.next).heat<BLOCK_HEAT);}}
 assert.equal(s.rescued,8);assert.equal(s.phase,'complete');assert.deepEqual([...s.building.nodes.values()].map(n=>[n.heat,n.smoke]),initial);
});
test('spreading fire develops hazards and changes team assignments',()=>{
 const s=new RescueSimulation('spread');advance(s,100);assert.ok(s.fireCount>4);assert.ok(s.replans>3);assert.ok(s.events.some(e=>e.type==='danger'));
});
test('pausing freezes all crews, occupants, fire, and incident time',()=>{
 const s=new RescueSimulation('spread');advance(s,10);s.running=false;
 const state=()=>JSON.stringify({time:s.time,crews:s.firefighters.map(f=>s.position(f)),people:s.people,heat:[...s.building.nodes.values()].map(n=>n.heat)});
 const before=state();for(let i=0;i<100;i++)s.tick(.1);assert.equal(state(),before);
});
test('a newly blocked active segment reverses movement without teleporting',()=>{
 const s=new RescueSimulation('fixed',1);s.running=true;while(!s.firefighter.next)s.tick(.1);for(let i=0;i<10;i++)s.tick(.1);
 const ff=s.firefighter,previous=ff.node,next=ff.next,before=s.position();s.building.nodes.get(next).heat=1;s.tick(.001);
 assert.equal(ff.next,previous);const after=s.position();assert.ok(Math.hypot(before.x-after.x,before.y-after.y,before.z-after.z)<.01);
});
test('changing mode resets the same endangered occupants and preserves crew count',()=>{
 const s=new RescueSimulation('spread',2);advance(s,25);s.reset('fixed');const fresh=new RescueSimulation('fixed',2);
 assert.equal(s.time,0);assert.equal(s.running,false);assert.equal(s.firefighters.length,2);assert.deepEqual(s.people,fresh.people);
 assert.deepEqual([...s.building.nodes.values()],[...fresh.building.nodes.values()]);
});
