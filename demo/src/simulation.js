import { createBuilding, FLOOR_HEIGHT, key, UNIT_COLORS } from './building.js';
export { createBuilding, FLOOR_HEIGHT, key };
export const BLOCK_HEAT = .79;
export const DANGER_THRESHOLD = .58;
const clamp=v=>Math.max(0,Math.min(1,v));
const GOALS=new Set(['safe','safe-east']);

export function shortestPath(building,start,goal,options={}) {
  const {nodes,adjacency}=building,goals=goal instanceof Set?goal:new Set([goal]);
  if(!nodes.has(start)||!goals.size)return null;
  const dist=new Map([[start,0]]),previous=new Map(),open=new Set([start]);
  while(open.size){
    const current=[...open].reduce((a,b)=>dist.get(a)<dist.get(b)?a:b);open.delete(current);
    if(goals.has(current)){
      const path=[current];while(previous.has(path[0]))path.unshift(previous.get(path[0]));
      return {path,cost:dist.get(current)};
    }
    for(const {id,edge}of adjacency.get(current)){
      const n=nodes.get(id),from=nodes.get(current);
      if(!options.ignoreHazards&&(edge.blocked||n.heat>=BLOCK_HEAT||(from.heat>=BLOCK_HEAT&&current!==start)))continue;
      const cost=dist.get(current)+edge.length*(options.ignoreHazards?1:1+n.heat*7+n.smoke*2.2);
      if(cost<(dist.get(id)??Infinity)){dist.set(id,cost);previous.set(id,current);open.add(id);}
    }
  }
  return null;
}

export class RescueSimulation {
  constructor(mode='fixed',teamSize=3){this.reset(mode,teamSize);}
  reset(mode=this.mode,teamSize=this.teamSize??3){
    if(!Number.isInteger(teamSize)||teamSize<1||teamSize>3)throw new RangeError('Choose 1–3 firefighters.');
    this.mode=mode;this.teamSize=teamSize;this.building=createBuilding();this.time=0;this.running=false;
    this.events=[];this.handoffs=[];this.replans=0;this.lastPlan=-Infinity;this.spreadAccumulator=0;this.finished=false;
    this.people=['10C','ROBOT','120B','120C','220A','220B','310D','310C'].map((room,i)=>({id:i+1,node:`r${room}`,room,status:'waiting',unit:null,next:null,progress:0,path:[],releasedAt:null}));
    for(const [id,heat]of [['rMETAL',.90],['r120',.92],['r220',.86],['rAPT',.88]])this.building.nodes.get(id).heat=heat;
    for(const p of this.people)Object.assign(this.building.nodes.get(p.node),{heat:.45,smoke:.75});
    Object.assign(this.building.nodes.get('rROBOT'),{heat:.5,smoke:.8});
    this.firefighters=Array.from({length:teamSize},(_,i)=>({id:i+1,color:UNIT_COLORS[i],node:'safe',next:null,progress:0,pickups:[],target:null,carrying:[],path:[],escapePath:[],handoff:null,phase:'ready',reversing:false,routeCost:0}));
    this.log(`${teamSize} firefighter${teamSize===1?'':'s'} ready. Eight occupants in immediate danger.`, 'warning');
    this.log('West stair 1–2 and a basement passage are blocked.', 'warning');
    this.plan(true);
  }
  get firefighter(){return this.firefighters[0];}
  get rescued(){return this.people.filter(p=>p.status==='rescued').length;}
  get walking(){return this.people.filter(p=>p.status==='walking').length;}
  get complete(){return this.rescued===this.people.length;}
  get phase(){return this.complete?'complete':this.firefighters.every(f=>['holding','standby'].includes(f.phase))&&!this.walking?'holding':'active';}
  get fireCount(){return [...this.building.nodes.values()].filter(n=>n.heat>.65).length;}
  get blockedCount(){return [...this.building.edges.values()].filter(e=>e.blocked||this.building.nodes.get(e.a).heat>=BLOCK_HEAT||this.building.nodes.get(e.b).heat>=BLOCK_HEAT).length;}
  log(message,type='info'){this.events.unshift({time:this.time,message,type});this.events=this.events.slice(0,60);}
  dangerAt(n){
    if(n.type==='safe'||n.type==='exit')return 0;
    let nearby=0;
    for(const m of this.building.nodes.values()){
      const d=Math.hypot(n.x-m.x,n.z-m.z);
      if(m.floor===n.floor)nearby=Math.max(nearby,m.heat*Math.max(0,1-d/17));
      if(m.floor===n.floor-1&&d<6)nearby=Math.max(nearby,m.heat*.55);
    }
    return clamp(n.heat*.6+n.smoke*.2+nearby*.7);
  }
  urgency(person){return this.dangerAt(this.building.nodes.get(person.node));}
  safeForWalking(n){return n.heat<=.16&&n.smoke<=.22&&this.dangerAt(n)<=.28;}
  civilianRoutes(){
    const {nodes,adjacency}=this.building;
    const allowed=new Set([...nodes.values()].filter(n=>this.safeForWalking(n)).map(n=>n.id));
    const dist=new Map([...GOALS].map(id=>[id,0])),next=new Map(),open=new Set(GOALS);
    while(open.size){
      const current=[...open].reduce((a,b)=>dist.get(a)<dist.get(b)?a:b);open.delete(current);
      for(const {id,edge}of adjacency.get(current)){
        if(edge.blocked||!allowed.has(id)||edge.type==='outside')continue;
        const cost=dist.get(current)+edge.length;
        if(cost<(dist.get(id)??Infinity)){dist.set(id,cost);next.set(id,current);open.add(id);}
      }
    }
    const routes=new Map();
    for(const [id,cost]of dist){
      const path=[id];while(next.has(path.at(-1)))path.push(next.get(path.at(-1)));
      routes.set(id,{path,cost});
    }
    return routes;
  }
  candidates(unit=null){
    const units=unit?[unit]:this.firefighters;
    const safe=this.safeRoutes??this.civilianRoutes(),goals=new Set([...safe.keys()].filter(id=>this.building.nodes.get(id).type!=='room'));
    return this.people.filter(p=>['waiting','stranded'].includes(p.status)&&(this.urgency(p)>=DANGER_THRESHOLD||p.needsRescue)).map(person=>{
      const approaches=units.map(ff=>({unit:ff.id,route:shortestPath(this.building,ff.next??ff.node,person.node)})).filter(a=>a.route).sort((a,b)=>a.route.cost-b.route.cost);
      const approach=approaches[0]?.route??null,escape=shortestPath(this.building,person.node,goals),urgency=this.urgency(person);
      const owner=this.firefighters.find(ff=>ff.pickups.includes(person.id));
      const score=approach&&escape?urgency*140-(approach.cost+escape.cost)*.35:-Infinity;
      return {person,approach,escape,urgency,score,unit:owner?.id??null};
    }).sort((a,b)=>b.score-a.score||a.person.id-b.person.id);
  }
  plan(initial=false){
    this.safeRoutes=this.civilianRoutes();
    const handoffGoals=new Set([...this.safeRoutes.keys()].filter(id=>this.building.nodes.get(id).type!=='room'));
    const waiting=this.people.filter(p=>p.status==='waiting'&&(this.urgency(p)>=DANGER_THRESHOLD||p.needsRescue));
    const cache=new Map(),releaseCache=new Map();
    const travel=(a,b)=>{const k=`${a}|${b}`;if(!cache.has(k))cache.set(k,shortestPath(this.building,a,b));return cache.get(k);};
    const release=a=>{if(!releaseCache.has(a))releaseCache.set(a,shortestPath(this.building,a,handoffGoals));return releaseCache.get(a);};
    const options=this.firefighters.map(ff=>{
      const origin=ff.next??ff.node,direct=release(origin);
      const jobs=[];
      const addJob=pickups=>{
        let cursor=origin,cost=0,penalty=0,path=[origin],mask=0;
        for(const id of pickups){
          const p=this.people.find(p=>p.id===id),route=travel(cursor,p.node);if(!route)return;
          if(pickups.length===2&&cursor!==origin&&route.cost>55)return;
          path.push(...route.path.slice(1));cost+=route.cost;
          penalty+=this.urgency(p)*(cost/3.4)*.7;mask|=1<<(p.id-1);cursor=p.node;
        }
        const exit=release(cursor);if(!exit)return;
        cost+=exit.cost;
        if(ff.carrying.length&&pickups.length){
          const critical=ff.carrying.some(id=>this.urgency(this.people.find(p=>p.id===id))>.9);
          if(!direct||cost-direct.cost>(critical?6:45))return;
        }
        path.push(...exit.path.slice(1));
        const switching=ff.pickups.length&&!pickups.includes(ff.pickups[0])?16:0;
        const value=pickups.reduce((sum,id)=>sum+90+this.urgency(this.people.find(p=>p.id===id))*110,0);
        jobs.push({pickups,path,cost,mask,handoff:path.at(-1),escapePath:exit.path,score:value-cost*.75-penalty-switching});
      };
      if(ff.carrying.length)addJob([]);
      else jobs.push({pickups:[],path:[origin],cost:0,mask:0,handoff:null,escapePath:[],score:0});
      if(ff.carrying.length<2)for(const p of waiting){
        addJob([p.id]);
        if(!ff.carrying.length)for(const q of waiting)if(p.id!==q.id)addJob([p.id,q.id]);
      }
      if(!jobs.length)jobs.push({pickups:[],path:[origin],cost:0,mask:0,handoff:null,escapePath:[],score:-10000});
      return jobs;
    });
    // Exact dynamic programming chooses the highest scoring disjoint combination
    // of the generated single/pair jobs across all active firefighters.
    const memo=new Map();
    const solve=(index,used)=>{
      if(index===options.length)return {score:0,jobs:[]};
      const k=`${index}|${used}`;if(memo.has(k))return memo.get(k);
      let best={score:-Infinity,jobs:[]};
      for(const job of options[index]){
        if(job.mask&used)continue;
        const tail=solve(index+1,used|job.mask),score=job.score+tail.score;
        if(score>best.score)best={score,jobs:[job,...tail.jobs]};
      }
      memo.set(k,best);return best;
    };
    const assigned=solve(0,0).jobs;
    this.firefighters.forEach((ff,i)=>{
      const job=assigned[i];if(!job)return;
      const previous=`${ff.pickups.join(',')}|${ff.path.join(',')}|${ff.handoff}`;
      ff.pickups=job.pickups.slice();ff.target=ff.pickups[0]??null;ff.path=job.path.slice(1);ff.handoff=job.handoff;ff.escapePath=job.escapePath;ff.routeCost=job.cost;
      ff.phase=ff.pickups.length?(ff.carrying.length?'collecting':'approaching'):ff.carrying.length?(ff.handoff?'evacuating':'holding'):waiting.length?'holding':'standby';
      if(!initial&&previous!==`${ff.pickups.join(',')}|${ff.path.join(',')}|${ff.handoff}`){
        this.replans++;
        this.log(`Unit ${ff.id}: ${ff.pickups.length?`rescue ${ff.pickups.map(id=>`person ${id}`).join(' + ')}`:ff.carrying.length&&ff.handoff?`escort ${ff.carrying.length} to ${this.building.nodes.get(ff.handoff).label}`:ff.phase==='holding'?'hold; no viable assignment':'stand by'}.`,'route');
      }
    });
    this.lastPlan=this.time;
  }
  spread(dt){
    const {nodes,adjacency}=this.building,updates=[];
    for(const n of nodes.values()){
      if(['safe','exit'].includes(n.type))continue;
      let heatIn=0,smokeIn=0;
      for(const {id,edge}of adjacency.get(n.id)){
        const m=nodes.get(id);if(edge.blocked||edge.type==='outside')continue;
        const ventilation=edge.type==='door'?.35:edge.type==='stairs'?(m.floor<n.floor?1.7:.3):.9;
        heatIn=Math.max(heatIn,Math.max(0,m.heat-n.heat)*ventilation);
        smokeIn=Math.max(smokeIn,Math.max(0,Math.max(m.smoke,m.heat)-n.smoke)*ventilation);
      }
      // Vertical exposure uses physical overlap, rather than apartment room numbers.
      if(n.type==='room')for(const below of nodes.values())if(below.type==='room'&&below.floor===n.floor-1&&below.heat>.65&&Math.hypot(n.x-below.x,n.z-below.z)<5){
        heatIn=Math.max(heatIn,(below.heat-n.heat)*.3);smokeIn=Math.max(smokeIn,(below.heat-n.smoke)*.8);
      }
      const growth=n.heat>(n.type==='room'?.42:.6)?.003+n.heat*.007:0;
      updates.push([n,clamp(n.heat+dt*(heatIn*.035+growth)),clamp(n.smoke+dt*(smokeIn*.09+n.heat*.012))]);
    }
    let blocks=0;
    for(const [n,heat,smoke]of updates){if(n.heat<BLOCK_HEAT&&heat>=BLOCK_HEAT){blocks++;this.log(`${n.label} is impassable. Team routes updated.`,'danger');}n.heat=heat;n.smoke=smoke;}
    return blocks;
  }
  move(mover,dt,speed,civilian=false){
    if(!mover.next)return false;
    const edge=this.building.edges.get(key(mover.node,mover.next)),next=this.building.nodes.get(mover.next);
    const passable=n=>civilian?this.safeForWalking(n):n.heat<BLOCK_HEAT;
    if(!mover.reversing&&(edge.blocked||!passable(next))){
      const previous=this.building.nodes.get(mover.node);
      if(!passable(previous)){
        mover.phase='holding';
        if(civilian){mover.status='stranded';mover.needsRescue=true;this.log(`Person ${mover.id}: hold position; trapped by heat. Additional assistance required.`,'danger');this.lastPlan=-Infinity;}
        return false;
      }
      const old=mover.node;mover.node=mover.next;mover.next=old;mover.progress=1-mover.progress;mover.reversing=true;mover.path=[];
      this.log(`${civilian?'Person':'Unit'} ${mover.id}: passage changed. Return to the last safe point.`,'danger');
      this.lastPlan=-Infinity;
    }
    mover.progress+=dt*speed/edge.length;
    if(mover.progress>=1){mover.node=mover.next;mover.next=null;mover.progress=0;mover.reversing=false;return true;}
    return false;
  }
  tick(dt){
    if(!this.running)return;
    dt=Math.min(dt,.5);this.time+=dt;
    if(this.mode==='spread'){
      this.spreadAccumulator+=dt;
      if(this.spreadAccumulator>=.5){this.spread(this.spreadAccumulator);this.spreadAccumulator=0;}
    }
    if(this.time-this.lastPlan>=1){
      // Fixed incidents need replanning only after a pickup, handoff, or blockage.
      if(this.mode==='spread'||this.lastPlan===-Infinity)this.plan();
    }
    let changed=false;
    for(const ff of this.firefighters){
      if(ff.next){this.move(ff,dt,ff.carrying.length===2?2.4:ff.carrying.length?2.8:3.4);continue;}
      const target=this.people.find(p=>p.id===ff.pickups[0]);
      if(target?.status==='waiting'&&ff.node===target.node&&ff.carrying.length<2){
        target.status='escorted';target.unit=ff.id;ff.carrying.push(target.id);ff.pickups.shift();ff.target=ff.pickups[0]??null;
        ff.phase=ff.pickups.length?'collecting':'evacuating';
        this.log(`Unit ${ff.id} located person ${target.id} in ${this.building.nodes.get(target.node).label}. Escort ${ff.carrying.length}/2.`,'success');
      }
      if(ff.carrying.length&&!ff.pickups.length&&ff.node===ff.handoff){
        const safe=this.civilianRoutes().get(ff.node);
        if(safe){
          const people=ff.carrying.slice();
          for(const id of people){const p=this.people.find(p=>p.id===id);Object.assign(p,{status:'walking',unit:null,node:ff.node,next:null,progress:0,path:safe.path.slice(1),releasedAt:this.time});}
          this.handoffs.push({time:this.time,unit:ff.id,node:ff.node,people});
          this.log(`Unit ${ff.id} released ${people.length} ${people.length===1?'person':'people'} at ${this.building.nodes.get(ff.node).label}. Clear route outside; continuing independently.`,'success');
          ff.carrying=[];ff.pickups=[];ff.target=null;ff.path=[];ff.handoff=null;changed=true;
        }else{ff.path=[];this.lastPlan=-Infinity;}
      }
      if(!ff.next&&ff.path.length){
        const id=ff.path[0],edge=this.building.edges.get(key(ff.node,id));
        if(!edge||edge.blocked||this.building.nodes.get(id).heat>=BLOCK_HEAT){this.lastPlan=-Infinity;continue;}
        ff.next=ff.path.shift();ff.progress=0;
      }
    }
    for(const person of this.people.filter(p=>p.status==='walking')){
      if(person.next){this.move(person,dt,2.1,true);continue;}
      if(GOALS.has(person.node)){person.status='rescued';this.log(`Person ${person.id} reached ${this.building.nodes.get(person.node).label}.`,'success');continue;}
      const safe=this.civilianRoutes().get(person.node);
      if(!safe){person.status='waiting';person.needsRescue=true;person.path=[];changed=true;this.log(`Person ${person.id}: evacuation route changed; assistance needed.`,'danger');continue;}
      person.path=safe.path.slice(1);person.next=person.path.shift()??null;person.progress=0;
    }
    if(changed)this.plan();
    if(this.complete){this.running=false;for(const ff of this.firefighters)ff.phase='complete';if(!this.finished)this.log('All eight endangered occupants are safely outside.','success');this.finished=true;}
  }
  position(mover=this.firefighter){
    const a=this.building.nodes.get(mover.node),b=this.building.nodes.get(mover.next)??a;
    return {x:a.x+(b.x-a.x)*mover.progress,y:a.y+(b.y-a.y)*mover.progress,z:a.z+(b.z-a.z)*mover.progress};
  }
  routeNodes(ff=this.firefighter){return [ff.node,...(ff.next?[ff.next]:[]),...ff.path];}
}
