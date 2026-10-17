import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueSimulation } from '../src/simulation.js';

function finish(s){s.running=true;for(let i=0;i<6000&&s.running;i++)s.tick(.1);return s;}
test('basement and upper fires genuinely seal occupied-room routes if response comes late',()=>{
 const s=new RescueSimulation('spread');for(let i=0;i<360;i++){s.time+=.5;s.spread(.5);}
 assert.equal(s.crewPath('safe-east','r10C'),null);
 assert.equal(s.crewPath('safe-east','rROBOT'),null);
 assert.equal(s.crewPath('safe-east','r310D'),null);
 assert.ok(s.building.fires.find(f=>f.id==='prototype-fire').radius>3);
});
test('urgency-first saves everyone while distance-first loses basement and upper rescue windows',()=>{
 const urgent=finish(new RescueSimulation('spread',1,'urgent'));
 const distance=finish(new RescueSimulation('spread',1,'distance'));
 assert.equal(urgent.rescued,8);assert.equal(urgent.phase,'complete');
 assert.ok(distance.rescued<8);assert.equal(distance.phase,'cutoff');assert.equal(distance.running,false);
 const floors=distance.cutOffPeople.map(p=>distance.building.nodes.get(p.node).floor);
 assert.ok(floors.includes(0),'Distance-first must miss a basement rescue');
 assert.ok(floors.includes(3),'Distance-first must miss an upper-floor rescue');
});
test('strategy resets retain the chosen crew count and restore the same incident',()=>{
 const s=new RescueSimulation('spread',2,'distance');s.reset();
 assert.equal(s.strategy,'distance');assert.equal(s.teamSize,2);assert.equal(s.time,0);
 assert.deepEqual(s.people,new RescueSimulation('spread',2,'urgent').people);
});
