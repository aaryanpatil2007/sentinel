export const FLOOR_HEIGHT = 4.5;
export const LEVELS = [0,1,2,3];
export const levelLabel = floor => floor === 0 ? 'Basement' : `Floor ${floor}`;
export const FORCE_ENTRY_SECONDS = 6;
export const UNIT_COLORS = ['#3475cd','#895bb2','#188c89'];
export const SOURCES = {
  guide:'https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/',
  equipment:'https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/labs-and-equipment/',
  studios:'https://design.berkeley.edu/about-mdes/studio-facilities',
  teaching:'https://jacobsinstitute.berkeley.edu/courses/for-instructors/jacobs-hall-instructor-guide/',
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
export const LOCKED_ROOMS = new Set(['120A','120B','210A','310A']);
// Equipment types are grounded in Berkeley's current equipment/space guides and
// 2024 interior photographs. This is a selective arrangement, not an inventory survey.
const furnishing=(id,room,kind,x,z,w,d,h=1,extra={})=>({id,room,kind,floor:ROOMS.find(r=>r.id===room).floor,x,z,w,d,h,...extra});
export const FURNISHINGS = [
  furnishing('omax','METAL','waterjet',-13,-7.1,3.6,2.5,1.25,{label:'OMAX waterjet'}),
  furnishing('metal-saw','METAL','bandsaw',-14.7,-2.6,1.2,1.4,1.7),
  furnishing('weld','METAL','welding',-11.4,-2.6,1.5,1.5,1.25),
  ...[-7.2,-2.7].flatMap((x,i)=>[-5.5,-2].map((z,j)=>furnishing(`10c-bench-${i}-${j}`,'10C','workbench',x,z,2.2,2,1))),
  furnishing('10c-board','10C','whiteboard',-5,-7.6,2.2,.6,1.5),
  ...[1.6,8.3].flatMap((x,i)=>[-5.7,-2].map((z,j)=>furnishing(`10-bench-${i}-${j}`,'10','workbench',x,z,3.1,2.3,1))),
  furnishing('10-screen','10','display',5,-7.8,3.6,.5,1.7),
  furnishing('robot-bench','ROBOT','electronics',-5.8,8,3,1.8,1.15),
  furnishing('video-kit','ROBOT','camera',5.8,8,1.5,1.5,1.8),
  furnishing('shopbot','120','cnc',-6.7,-5.8,4.2,2.5,1.3,{label:'ShopBot · woodshop'}),
  furnishing('sawstop','120','tableSaw',-2.5,-2,2.1,1.8,1.05),
  furnishing('wood-saw','120','bandsaw',-8.2,-1.7,1.2,1.3,1.7),
  furnishing('laser','110','laser',2.6,-6,3.3,1.8,1.3,{label:'Laser cutting'}),
  furnishing('printer-bank','110','printerBank',7.6,-6,3.1,1.8,1.7),
  furnishing('electronics','110','electronics',7.5,-1.8,2.5,1.8,1.2),
  furnishing('lucy','110','robotArm',2.5,-2.2,1.7,1.8,1.8,{label:'Lucy + Ethel'}),
  furnishing('ethel','110','robotArm',2.5,.1,1.7,1.6,1.8),
  furnishing('soft-lab','110A','sewing',11.25,8.6,1.3,1.5,1.2),
  furnishing('advising','103','desk',15.8,-5.5,1.6,2,1.2),
  ...[-7.6,-2.4].flatMap((x,i)=>[-5.8,-2.4].map((z,j)=>furnishing(`220-bench-${i}-${j}`,'220','workbench',x,z,2.6,2.2,1))),
  furnishing('220-board','220','whiteboard',-5,-7.8,3,.6,1.5),
  ...[2.3,7.8].flatMap((x,i)=>[-5.8,-2].map((z,j)=>furnishing(`mdes-desk-${i}-${j}`,'210','desk',x,z,2.7,2.2,1.3))),
  furnishing('mdes-lounge','210','lounge',7.7,.1,2.5,1.2,1),
  furnishing('jps-printer','234','resinPrinter',-14.6,-5.5,1.4,1.8,1.7),
  ...[-7.8,-2.6,2.6,7.8].flatMap((x,i)=>[-5.9,-2.7].map((z,j)=>furnishing(`310-table-${i}-${j}`,'310','teachingTable',x,z,3.1,2.2,1))),
  furnishing('led-wall','310','display',0,-7.9,6.5,.5,1.7,{label:'310 · LED teaching wall'}),
  furnishing('310-podium','310','podium',8.7,-7,1.3,1,1.25),
  furnishing('310d-table','310D','meeting',-6.65,8.6,1.4,1.7,1),
  furnishing('310b-table','310B','meeting',3.35,8.6,1.4,1.7,1),
  furnishing('form-bank','APT','resinPrinter',-14.5,-5.8,1.5,1.7,1.7,{label:'332 · advanced printing'}),
  furnishing('fortus','APT','enclosedPrinter',-11.3,-5.8,1.7,1.9,1.9),
  furnishing('resin-bench','APT','resinPrinter',-14.5,-2.5,1.5,1.7,1.7),
];
export const INCIDENT_PROPS = [
  {id:'cart-2',room:'220',kind:'materialsCart',floor:2,x:2.5,z:3,w:1.8,d:1.1,h:.9,label:'Displaced materials cart'},
  {id:'debris-3',room:'310',kind:'fallenWhiteboard',floor:3,x:-2.5,z:3,w:1.8,d:1.1,h:.65,label:'Fallen rolling whiteboard'},
];
export const OBSTACLES = [...FURNISHINGS,...INCIDENT_PROPS];
export const ROOM_CHARACTER = {
  METAL:'Waterjet + metal fabrication', '10C':'Workbench tables + stools', '10':'Teaching benches + AV',
  ROBOT:'Electronics + video equipment', '120':'ShopBot + woodshop', '110':'Robotics + electronics + laser cutting',
  '210':'MDes desks + pin-up space', '220':'Teaching benches + whiteboards', '310':'Teaching tables + LED wall',
  APT:'332 · advanced 3D printing',
};
export const DANGER_STOPS = [
  {at:0,color:'#248568'}, {at:.3,color:'#b19e35'}, {at:.58,color:'#d0792e'},
  {at:.78,color:'#bc392e'}, {at:1,color:'#740e26'},
];
export function dangerAppearance(value){
  const risk=Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
  const upper=DANGER_STOPS.findIndex(s=>s.at>=risk),a=DANGER_STOPS[Math.max(0,upper-1)],b=DANGER_STOPS[upper];
  const t=a===b?0:(risk-a.at)/(b.at-a.at),rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const channels=rgb(a.color).map((c,i)=>Math.round(c+(rgb(b.color)[i]-c)*t));
  const hex=xs=>'#'+xs.map(c=>c.toString(16).padStart(2,'0')).join('');
  const luminance=channels.map(c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  return {color:hex(channels),background:hex(channels.map(c=>Math.round(c*.1+255*.9))),ink:luminance>.179?'#000000':'#ffffff',label:risk>=.85?'Critical':risk>=.7?'Severe':risk>=.5?'High':risk>=.25?'Moderate':'Low'};
}
// Two compact apparatus positions on the street, beyond all evacuation links.
export const RESPONSE_STAGING = [
  {id:'engine',kind:'engine',floor:1,x:10,z:20.5,w:8.6,d:3,h:2.7},
  {id:'ladder',kind:'ladder',floor:1,x:-18,z:20.5,w:8.6,d:3,h:2.7},
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
// Flame clearance is wider for unescorted civilians. Solid furniture uses body
// clearance independently, so a safe aisle is not treated as a heat exclusion zone.
export function segmentClear(building,a,b,{civilian=false,clearance=civilian?1.15:.5,fixtureClearance=.5,ignoreFire=false,ignoreObstacles=false}={}){
  if(!ignoreObstacles)for(const box of building.obstacles??OBSTACLES){const segment=floorSegment(a,b,box.floor);if(segment&&crossesBox(...segment,box,fixtureClearance))return false;}
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
export function edgeClear(building,a,b,{civilian=false,allowForcedEntry=false}={}){
  const edge=building.edges.get(key(a,b)),from=building.nodes.get(a),to=building.nodes.get(b);
  return !!edge&&!edge.blocked&&(!edge.locked||(allowForcedEntry&&edge.forceable&&!civilian))&&to.heat<.79&&segmentClear(building,from,to,{civilian,ignoreObstacles:edge.solidClear===true});
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
    if(LOCKED_ROOMS.has(room.id))Object.assign(edges.get(key(id,door)),{locked:true,forceable:true,room:room.label});
    if(room.z>5)link(door,`b${room.floor}-${index}`,'door');
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
  // Furnishings are static: check each whole edge once. Movement still checks
  // arbitrary swept segments; route searches only need to recheck changing fire.
  for(const edge of edges.values()){edge.solidClear=segmentClear({obstacles:OBSTACLES},nodes.get(edge.a),nodes.get(edge.b),{ignoreFire:true});if(!edge.solidClear){edge.blocked=true;edge.obstruction=true;}}
  const adjacency=new Map([...nodes.keys()].map(id=>[id,[]]));
  for(const edge of edges.values()){adjacency.get(edge.a).push({id:edge.b,edge});adjacency.get(edge.b).push({id:edge.a,edge});}
  return {nodes,edges,adjacency,obstacles:OBSTACLES,fires:[],hazardVersion:0};
}
