import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation, key } from '../src/simulation.js';

function advance(s, seconds) {s.running=true;for(let i=0;i<seconds*10&&s.running;i++)s.tick(.1);}

test('the incident contains only occupants in immediate danger',()=>{
  const s=new RescueSimulation();
  assert.ok(s.people.length>0);
  for(const person of s.people)assert.ok(s.urgency(person)>=.58,`Room ${person.room} is not in immediate danger`);
});
test('one, two, or three firefighters can be selected',()=>{
  for(const count of [1,2,3]){
    const s=new RescueSimulation('fixed',count);
    assert.ok(Array.isArray(s.firefighters));assert.equal(s.firefighters.length,count);
  }
  assert.throws(()=>new RescueSimulation('fixed',4),RangeError);
});
test('joint assignments never reserve the same occupant for two firefighters',()=>{
  const s=new RescueSimulation('fixed',3);assert.ok(Array.isArray(s.firefighters));
  for(let i=0;i<100;i++){
    s.plan();
    const reservations=s.firefighters.flatMap(f=>[...f.pickups,...f.carrying]);
    assert.equal(new Set(reservations).size,reservations.length);
    advance(s,1);
  }
});
test('firefighters can escort two people together and never exceed capacity',()=>{
  const s=new RescueSimulation('fixed',3);assert.ok(Array.isArray(s.firefighters));let sawPair=false;
  s.running=true;
  for(let i=0;i<4500&&s.running;i++){
    s.tick(.1);
    for(const ff of s.firefighters){assert.ok(ff.carrying.length<=2);if(ff.carrying.length===2)sawPair=true;}
  }
  assert.ok(sawPair,'The incident should include a two-person escort');
  assert.equal(s.rescued,s.people.length);
});
test('escorts are released inside and finish walking outside independently',()=>{
  const s=new RescueSimulation('fixed',1);assert.ok(Array.isArray(s.firefighters));
  s.running=true;let released;
  for(let i=0;i<3000&&!released;i++){s.tick(.1);released=s.people.find(p=>p.status==='walking');}
  assert.ok(released);assert.notEqual(released.node,'safe');
  assert.ok(!['exit','safe'].includes(s.building.nodes.get(released.node).type));
  assert.equal(s.firefighters[0].carrying.length,0);
  assert.ok(s.firefighters[0].pickups.length>0,'The firefighter should resume rescuing while occupants walk out');
  advance(s,400);assert.equal(released.status,'rescued');
});
test('independent evacuation routes are clear of heat, smoke, and nearby danger',()=>{
  const s=new RescueSimulation('fixed',3);assert.equal(typeof s.civilianRoutes,'function');
  const routes=s.civilianRoutes();assert.ok(routes.size>1);
  for(const {path}of routes.values())for(let i=0;i<path.length;i++){
    const n=s.building.nodes.get(path[i]);assert.ok(n.heat<=.16);assert.ok(n.smoke<=.22);
    assert.ok(s.dangerAt(n)<=.28);
    if(i)assert.equal(s.building.edges.get(key(path[i-1],path[i])).blocked,false);
  }
});
test('three coordinated firefighters finish the fixed incident faster than one',()=>{
  const solo=new RescueSimulation('fixed',1),team=new RescueSimulation('fixed',3);
  assert.ok(Array.isArray(team.firefighters));advance(solo,800);advance(team,800);
  assert.equal(solo.rescued,solo.people.length);assert.equal(team.rescued,team.people.length);
  assert.ok(team.time<solo.time*.8,`${team.time} versus ${solo.time}`);
});
test('passing a safe point does not abandon the second person in a planned pickup',()=>{
  const s=new RescueSimulation('fixed',1),ff=s.firefighter;
  Object.assign(ff,{node:'c0-3',next:null,progress:0,carrying:[1],pickups:[2],target:2,handoff:'c0-3',path:['rROBOT']});
  s.people[0].status='escorted';s.people[0].unit=1;s.lastPlan=s.time;s.running=true;s.tick(.1);
  assert.deepEqual(ff.carrying,[1]);assert.equal(s.people[0].status,'escorted');
});
test('a walker trapped by new heat stops and requests assistance without teleporting',()=>{
  const s=new RescueSimulation('fixed',1);s.running=true;let person;
  for(let i=0;i<2000&&!person;i++){s.tick(.1);person=s.people.find(p=>p.status==='walking'&&p.next);}
  assert.ok(person);s.building.nodes.get(person.node).heat=1;s.building.nodes.get(person.next).heat=1;
  const before=s.position(person);s.tick(.01);
  assert.equal(person.status,'stranded');assert.deepEqual(s.position(person),before);
  assert.ok(s.events.some(e=>e.message.includes('assistance')));
});
test('a stranded walker can be recovered by a firefighter at their actual position',()=>{
  const s=new RescueSimulation('fixed',1);s.running=true;let person;
  for(let i=0;i<2000&&!person;i++){s.tick(.1);person=s.people.find(p=>p.status==='walking'&&p.next&&p.progress>.2);}
  assert.ok(person);const before=s.position(person);
  s.building.nodes.get(person.node).heat=.5;s.building.nodes.get(person.next).heat=.5;s.tick(.01);
  assert.equal(person.status,'stranded');assert.deepEqual(s.position(person),before);
  // Retire other rescues to isolate the assistance request.
  for(const p of s.people)if(p!==person)p.status='rescued';
  const ff=s.firefighter;ff.carrying=[];ff.pickups=[];ff.next=null;ff.node='safe';ff.path=[];ff.progress=0;
  s.plan();assert.ok(ff.pickups.includes(person.id),'A crew must be assigned to the reachable stranded walker');
  assert.deepEqual(s.building.nodes.get(person.node).x,before.x);
  let recovered=false;
  for(let i=0;i<5000&&s.running;i++){
    const old=s.position(person);s.tick(.1);
    if(person.status==='escorted'&&!recovered){const crew=s.position(ff);assert.ok(Math.hypot(crew.x-old.x,crew.y-old.y,crew.z-old.z)<.5);recovered=true;}
  }
  assert.ok(recovered);assert.equal(person.status,'rescued');
});
