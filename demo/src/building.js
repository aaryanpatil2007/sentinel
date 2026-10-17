export const FLOOR_HEIGHT = 4.5;
export const LEVELS = [0,1,2,3];
export const levelLabel = floor => floor === 0 ? 'Basement' : `Floor ${floor}`;
export const UNIT_COLORS = ['#3475cd','#895bb2','#188c89'];
export const SOURCES = {
  guide:'https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/',
  entrances:'https://jacobsinstitute.berkeley.edu/connect/visit/',
  plans:LEVELS.map(f=>`https://jacobsinstitute.berkeley.edu/wp-content/uploads/2021/06/Floor-${f||'B'}-Fall-2021.png`),
};
// Zones and adjacency follow Berkeley's published diagrams. Dimensions and
// circulation waypoints are approximate, not a surveyed emergency floor plan.
export const ROOMS = [
  {id:'METAL',floor:0,x:-13,z:-5,w:6,d:8,label:'Metal shop',kind:'shop'},
  {id:'10C',floor:0,x:-5,z:-2,w:8,d:13,label:'Studio 10C',kind:'studio'},
  {id:'10',floor:0,x:5,z:-2,w:12,d:13,label:'Teaching studio 10',kind:'studio'},
  {id:'ROBOT',floor:0,x:0,z:8,w:17,d:5,label:'Video & robotics lab',kind:'lab'},
  {id:'120',floor:1,x:-5,z:-2,w:10,d:13,label:'Makerspace 120',kind:'maker'},
  {id:'110',floor:1,x:5,z:-2,w:10,d:13,label:'Makerspace 110',kind:'maker'},
  {id:'103',floor:1,x:14,z:-5,w:6,d:8,label:'Advising 103',kind:'office'},
  ...['120A','120B','120C','110C','110B','110A'].map((id,i)=>({id,floor:1,x:-10+i*4,z:8,w:3.8,d:5,label:`Room ${id}`,kind:'lab'})),
  {id:'234',floor:2,x:-13,z:-5,w:6,d:7,label:'Project support 234',kind:'office'},
  {id:'220',floor:2,x:-5,z:-2,w:10,d:13,label:'MDes teaching studio 220',kind:'studio'},
  {id:'210',floor:2,x:5,z:-2,w:10,d:13,label:'MDes studio 210',kind:'studio'},
  ...['220A','220B','210C','210B','210A'].map((id,i)=>({id,floor:2,x:-8+i*4.5,z:8,w:4.3,d:5,label:`Room ${id}`,kind:'lab'})),
  {id:'APT',floor:3,x:-13,z:-5,w:6,d:8,label:'Advanced prototyping',kind:'maker'},
  {id:'310',floor:3,x:0,z:-2,w:22,d:13,label:'Teaching studio 310',kind:'studio'},
  ...['310D','310C','310B','310A'].map((id,i)=>({id,floor:3,x:-8+i*5,z:8,w:4.8,d:5,label:`Breakout ${id}`,kind:'meeting'})),
];
// Incident props are fictional; the public diagrams do not specify locked doors or debris.
export const BATHROOMS = LEVELS.map(floor=>({id:`WC${floor}`,floor,x:floor===1?-13.5:14,z:-4,w:4,d:5,label:'Restrooms',kind:'bathroom'}));
export const LOCKED_ROOMS = new Set(['120A','210A','310A']);
export const OBSTACLES = [
  {id:'cart-2',floor:2,x:2.5,z:3,w:1.8,d:1.1,h:.9,label:'Overturned cart'},
  {id:'debris-3',floor:3,x:-2.5,z:3,w:1.8,d:1.1,h:.65,label:'Fallen shelving'},
  {id:'bench-0',floor:0,x:3,z:-5,w:3.4,d:1.3,h:.8,label:'Workbench'},
  {id:'bench-1',floor:1,x:6,z:-5,w:3,d:1.3,h:.8,label:'Workbench'},
];
export const fireLobes = fire => [
  {x:fire.x,z:fire.z,radius:fire.radius},
  {x:fire.x+fire.radius*.68,z:fire.z+fire.radius*.28,radius:fire.radius*.67},
  {x:fire.x-fire.radius*.4,z:fire.z+fire.radius*.68,radius:fire.radius*.56},
];
const floorY=f=>(f-1)*FLOOR_HEIGHT+.48;
function crossesBox(a,b,box,margin){
  let low=0,high=1;
  for(const [axis,half]of [['x',box.w/2+margin],['z',box.d/2+margin]]){
    const delta=b[axis]-a[axis],min=box[axis]-half,max=box[axis]+half;
    if(Math.abs(delta)<1e-9){if(a[axis]<min||a[axis]>max)return false;}
    else {const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;}
  }
  return true;
}
// One geometric definition is shared by the planner, movement, and fire rendering.
// Restrict to the portion of a stair segment physically within this floor's flames.
function floorSegment(a,b,floor){
  const y=floorY(floor),dy=(b.y??floorY(b.floor))-(a.y??floorY(a.floor)),ay=a.y??floorY(a.floor);
  if(Math.abs(dy)<1e-9)return Math.abs(ay-y)<.85?[a,b]:null;
  const lo=Math.max(0,Math.min((y-.85-ay)/dy,(y+.85-ay)/dy)),hi=Math.min(1,Math.max((y-.85-ay)/dy,(y+.85-ay)/dy));
  if(lo>hi)return null;
  const at=t=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});return [at(lo),at(hi)];
}
export function segmentClear(building,a,b,{civilian=false,clearance=civilian?1.15:.5,ignoreFire=false}={}){
  for(const box of building.obstacles??OBSTACLES){const segment=floorSegment(a,b,box.floor);if(segment&&crossesBox(...segment,box,.5))return false;}
  if(ignoreFire)return true;
  for(const fire of building.fires??[]){
    const segment=floorSegment(a,b,fire.floor);if(!segment)continue;
    const [p,q]=segment,dx=q.x-p.x,dz=q.z-p.z,len=dx*dx+dz*dz;
    for(const lobe of fireLobes(fire)){
      const t=len?Math.max(0,Math.min(1,((lobe.x-p.x)*dx+(lobe.z-p.z)*dz)/len)):0;
      if(Math.hypot(p.x+dx*t-lobe.x,p.z+dz*t-lobe.z)<=lobe.radius+clearance)return false;
    }
  }
  return true;
}
export function edgeClear(building,a,b,{civilian=false}={}){
  const edge=building.edges.get(key(a,b)),from=building.nodes.get(a),to=building.nodes.get(b);
  return !!edge&&!edge.blocked&&!edge.locked&&to.heat<.79&&segmentClear(building,from,to,{civilian});
}
export const key = (a,b)=>[a,b].sort().join('|');
export function createBuilding() {
  const nodes=new Map(),edges=new Map();
  const add=(id,floor,x,z,type,label)=>nodes.set(id,{id,floor,x,y:(floor-1)*FLOOR_HEIGHT+.48,z,type,label,heat:0,smoke:0});
  const link=(a,b,type='hall')=>{
    const n=nodes.get(a),m=nodes.get(b);
    edges.set(key(a,b),{a,b,type,blocked:false,length:Math.hypot(n.x-m.x,n.y-m.y,n.z-m.z)*(type==='stairs'?1.6:1)});
  };
  const xs=[-14,-10,-5,0,5,10,14];
  for(const f of LEVELS){
    xs.forEach((x,i)=>add(`c${f}-${i}`,f,x,3,'hall',`${levelLabel(f)} studio circulation`));
    for(let i=0;i<xs.length-1;i++)link(`c${f}-${i}`,`c${f}-${i+1}`);
    // A second circulation lane allows a visible detour around carts and local flames.
    xs.forEach((x,i)=>{add(`b${f}-${i}`,f,x,4.7,'hall',`${levelLabel(f)} clear-side passage`);link(`c${f}-${i}`,`b${f}-${i}`);if(i)link(`b${f}-${i-1}`,`b${f}-${i}`);});
    add(`e${f}`,f,-16,4,'stairs',`East stair · ${levelLabel(f).toLowerCase()}`);
    add(`w${f}`,f,16,4,'stairs',`West stair · ${levelLabel(f).toLowerCase()}`);
    link(`e${f}`,`c${f}-0`);link(`w${f}`,`c${f}-6`);
    if(f>0){link(`e${f-1}`,`e${f}`,'stairs');link(`w${f-1}`,`w${f}`,'stairs');}
  }
  for(const room of [...ROOMS,...BATHROOMS]){
    const id=`r${room.id}`;add(id,room.floor,room.x,room.kind==='bathroom'?room.z+1:room.z,room.kind==='bathroom'?'bathroom':'room',room.label);
    const index=xs.reduce((best,x,i)=>Math.abs(x-room.x)<Math.abs(xs[best]-room.x)?i:best,0);
    const door=`d${room.id}`,doorZ=room.z>5?5.5:Math.min(1.4,room.z+room.d/2);
    add(door,room.floor,room.x,doorZ,'door',`${room.label} doorway`);
    link(id,door,'door');link(door,`c${room.floor}-${index}`,'door');
    if(LOCKED_ROOMS.has(room.id))edges.get(key(id,door)).locked=true;
  }

  add('west-exit',1,23,5,'exit','Etcheverry Plaza entrance');
  add('east-exit',2,-23,3,'exit','LeRoy Avenue entrance');
  add('safe',1,24,16,'safe','Etcheverry Plaza assembly');
  add('safe-east',2,-25,15,'safe','LeRoy Avenue assembly');
  link('w1','west-exit');link('e2','east-exit');
  link('west-exit','safe');link('east-exit','safe-east');link('safe','safe-east','outside');
  edges.get(key('w1','w2')).blocked=true;
  edges.get(key('c0-2','c0-3')).blocked=true;
  edges.get(key('b0-2','b0-3')).blocked=true;
  for(const edge of edges.values())if(!segmentClear({obstacles:OBSTACLES},nodes.get(edge.a),nodes.get(edge.b),{ignoreFire:true})){edge.blocked=true;edge.obstruction=true;}
  const adjacency=new Map([...nodes.keys()].map(id=>[id,[]]));
  for(const edge of edges.values()){adjacency.get(edge.a).push({id:edge.b,edge});adjacency.get(edge.b).push({id:edge.a,edge});}
  return {nodes,edges,adjacency,obstacles:OBSTACLES,fires:[],hazardVersion:0};
}
