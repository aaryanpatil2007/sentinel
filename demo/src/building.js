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
    add(`e${f}`,f,-16,4,'stairs',`East stair · ${levelLabel(f).toLowerCase()}`);
    add(`w${f}`,f,16,4,'stairs',`West stair · ${levelLabel(f).toLowerCase()}`);
    link(`e${f}`,`c${f}-0`);link(`w${f}`,`c${f}-6`);
    if(f>0){link(`e${f-1}`,`e${f}`,'stairs');link(`w${f-1}`,`w${f}`,'stairs');}
  }
  for(const room of ROOMS){
    const id=`r${room.id}`;add(id,room.floor,room.x,room.z,'room',room.label);
    const index=xs.reduce((best,x,i)=>Math.abs(x-room.x)<Math.abs(xs[best]-room.x)?i:best,0);
    link(id,`c${room.floor}-${index}`,'door');
  }
  for(const [a,b]of [['10C','10'],['120','110'],['220','210']])link(`r${a}`,`r${b}`,'door');
  link('rROBOT','c0-4','door');
  add('west-exit',1,23,5,'exit','Etcheverry Plaza entrance');
  add('east-exit',2,-23,3,'exit','LeRoy Avenue entrance');
  add('safe',1,24,16,'safe','Etcheverry Plaza assembly');
  add('safe-east',2,-25,15,'safe','LeRoy Avenue assembly');
  link('w1','west-exit');link('e2','east-exit');
  link('west-exit','safe');link('east-exit','safe-east');link('safe','safe-east','outside');
  edges.get(key('w1','w2')).blocked=true;
  edges.get(key('c0-2','c0-3')).blocked=true;
  const adjacency=new Map([...nodes.keys()].map(id=>[id,[]]));
  for(const edge of edges.values()){adjacency.get(edge.a).push({id:edge.b,edge});adjacency.get(edge.b).push({id:edge.a,edge});}
  return {nodes,edges,adjacency};
}
