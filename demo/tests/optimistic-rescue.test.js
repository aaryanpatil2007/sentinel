import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation } from '../src/simulation.js';

test('every crew size saves all eight people in both curated demo modes',()=>{
 for(const mode of ['fixed','spread'])for(const size of [1,2,3]){
  const s=new RescueSimulation(mode,size);s.running=true;
  for(let i=0;i<6000&&s.running;i++)s.tick(.1);
  assert.equal(s.rescued,8,`${mode}, ${size} crew: ${s.people.filter(p=>p.status!=='rescued').map(p=>p.room).join(', ')} left behind`);
  assert.equal(s.phase,'complete');
 }
});
test('a locked occupied room requires a timed forced entry before pickup',()=>{
 const s=new RescueSimulation('fixed',1),p=s.people.find(p=>s.building.edges.get([p.node,`d${p.room}`].sort().join('|'))?.locked);
 assert.ok(p,'The incident must demonstrate a rescue behind a locked door');
 s.running=true;let forcing=false,started=0,opened=0;
 for(let i=0;i<6000&&s.running;i++){
  s.tick(.1);const ff=s.firefighter;
  if(ff.action?.type==='force-door'&&!forcing){forcing=true;started=s.time;assert.equal(p.status,'waiting');}
  if(forcing&&!opened&&s.events.some(e=>e.message.includes('Forced entry complete')))opened=s.time;
 }
 assert.ok(forcing);assert.ok(opened-started>=5.8,'Forced entry must take physical time');assert.equal(p.status,'rescued');
});
test('spreading incident has explicit containment without extinguishing the whole building',()=>{
 const s=new RescueSimulation('spread',1);s.running=true;for(let i=0;i<800&&s.running;i++)s.tick(.1);
 assert.ok(s.containmentStarted);assert.ok(s.events.some(e=>e.message.includes('Sprinklers')));
 assert.ok(s.building.fires.every(f=>f.radius>f.initialRadius&&f.radius<=f.initialRadius+(f.maxGrowth??2.15)+.001));
});
test('the ground-floor fire changes the entry strategy from west to LeRoy',async()=>{
 const {shortestPath,createBuilding}=await import('../src/simulation.js');const s=new RescueSimulation();const clear=createBuilding();
 const baseline=shortestPath(clear,'safe','r120C',{allowForcedEntry:true}),incident=s.crewPath('safe','r120C');
 assert.ok(baseline.path.includes('west-exit'));assert.ok(incident.path.includes('east-exit'));assert.ok(incident.cost>baseline.cost*1.4);
});
test('the upper fire redirects entry through the prototyping room and connecting studio door',async()=>{
 const {shortestPath,createBuilding,key}=await import('../src/simulation.js');
 const clear=createBuilding(),baseline=shortestPath(clear,'e3','rWC3',{allowForcedEntry:true});
 assert.ok(baseline.path.every(id=>clear.nodes.get(id).floor===3));assert.ok(!baseline.path.includes('rAPT'));
 for(const mode of ['fixed','spread']){
  const s=new RescueSimulation(mode);if(mode==='spread')for(let i=0;i<500;i++){s.time+=.1;s.spread(.1);}
  const route=s.crewPath('e3','rWC3');assert.ok(route,mode);
  assert.ok(route.path.every(id=>s.building.nodes.get(id).floor===3),`${mode}: ${route.path}`);
  for(const id of ['rAPT','apt-studio-door','studio-left-aisle','studio-middle-aisle','d310'])assert.ok(route.path.includes(id),`${mode}: missing ${id}`);
  assert.equal(s.crewPath('e3','c3-0')?.path.length===2,false);
  assert.ok(s.crewPath('c3-4','c3-5')?.path.length===2);
  s.building.edges.get(key('rAPT','apt-studio-door')).blocked=true;
  assert.ok(s.crewPath('e3','rWC3').path.some(id=>s.building.nodes.get(id).floor===2));
 }
});
test('all crews start at the LeRoy safe exit and enter directly',()=>{
 for(const size of [1,2,3])for(const ff of new RescueSimulation('fixed',size).firefighters){
  assert.equal(ff.node,'safe-east');assert.equal(ff.path[0],'east-exit');
 }
});
