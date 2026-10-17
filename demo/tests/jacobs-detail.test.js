import test from 'node:test';
import assert from 'node:assert/strict';
import { FURNISHINGS, dangerAppearance, segmentClear } from '../src/building.js';
import { RescueSimulation } from '../src/simulation.js';

test('civilian danger runs from safe green to critical dark red with text labels',()=>{
 const safe=dangerAppearance(0),critical=dangerAppearance(1);
 assert.equal(safe.label,'Low');assert.equal(critical.label,'Critical');
 assert.notEqual(safe.color,critical.color);
 for(const danger of [0,.2,.4,.6,.8,1])assert.match(dangerAppearance(danger).color,/^#[0-9a-f]{6}$/i);
 assert.deepEqual(dangerAppearance(-1),safe);assert.deepEqual(dangerAppearance(2),critical);
});
test('an escorted civilian uses their current location for danger, not their old room',()=>{
 const s=new RescueSimulation(),p=s.people[0],ff=s.firefighter;
 p.status='escorted';p.unit=ff.id;ff.carrying=[p.id];ff.node='safe';ff.next=null;
 assert.equal(s.urgency(p),0);
 ff.node=p.node;assert.ok(s.urgency(p)>=.58);
});
test('the initial urgent occupants have different actual severities',()=>{
 const s=new RescueSimulation();const risks=s.people.map(p=>s.urgency(p));
 assert.ok(risks.every(r=>r>=.58));assert.ok(new Set(risks.map(r=>Math.round(r*100))).size>=4);
});
test('Jacobs furnishings retain recognizable floor-specific functions and safe rescue circulation',()=>{
 const s=new RescueSimulation();
 assert.ok(FURNISHINGS.some(p=>p.room==='110'&&p.kind==='robotArm'));
 assert.ok(FURNISHINGS.some(p=>p.room==='120'&&p.kind==='cnc'));
 assert.ok(FURNISHINGS.some(p=>p.room==='METAL'&&p.kind==='waterjet'));
 assert.ok(FURNISHINGS.some(p=>p.room==='210'&&p.kind==='desk'));
 assert.ok(FURNISHINGS.some(p=>p.room==='310'&&p.kind==='display'));
 assert.ok(FURNISHINGS.some(p=>p.room==='APT'&&p.kind==='resinPrinter'));
 for(const p of s.people){const n=s.building.nodes.get(p.node);assert.ok(segmentClear(s.building,n,n,{ignoreFire:true}),`Person ${p.id} starts inside furniture`);}
 s.running=true;for(let i=0;i<5000&&s.running;i++)s.tick(.1);
 assert.equal(s.rescued,8,'Room furnishings must leave all fixed-incident rescues reachable');
});

test('civilian badge numbers stay readable across the full danger gradient',()=>{
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(let i=0;i<=100;i++){
  const appearance=dangerAppearance(i/100),values=[luminance(appearance.color),luminance(appearance.ink)].sort((a,b)=>b-a);
  assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,`Unreadable badge at ${i}% danger`);
 }
});
test('furnishing layouts preserve access to every unlocked room',async()=>{
 const {createBuilding,ROOMS,LOCKED_ROOMS}=await import('../src/building.js');
 const {shortestPath}=await import('../src/simulation.js');const building=createBuilding();
 for(const room of ROOMS)if(!LOCKED_ROOMS.has(room.id))assert.ok(shortestPath(building,`r${room.id}`,new Set(['safe','safe-east'])),`${room.label} has a normal door but no circulation path`);
});
test('flame clearance and furniture clearance can be set independently',()=>{
 const s=new RescueSimulation(),a=s.building.nodes.get('r10C'),b=s.building.nodes.get('d10C');
 assert.ok(segmentClear(s.building,a,b,{ignoreFire:true,fixtureClearance:.5}));
 assert.equal(segmentClear(s.building,a,b,{ignoreFire:true,fixtureClearance:1.15}),false);
});
