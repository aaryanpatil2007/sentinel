import * as THREE from 'three';

// Selective, low-poly silhouettes based on the Berkeley room/equipment references.
// The complete footprint (including stools/frames) is shared with collision routing.
export function makeFurnishing(view,parent,prop,baseY){
  const group=new THREE.Group();group.position.set(prop.x,baseY+.28,prop.z);parent.add(group);
  group.userData={fixture:prop.id,kind:prop.kind,room:prop.room};
  const {w,d}=prop,wood=0xd2ac73,steel=0x73818a,dark=0x30434f,blue=0x426786,teal=0x78a5aa;
  const box=(size,pos,color,options)=>view.box(group,size,pos,color,options);
  const cylinder=(radius,height,pos,color,top=radius)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,radius,height,12),view.material(color));mesh.position.set(...pos);group.add(mesh);return mesh;
  };
  const bar=(a,b,radius,color)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const mesh=cylinder(radius,delta.length(),start.add(end).multiplyScalar(.5).toArray(),color);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
  };
  const wheel=(x,z)=>{const m=cylinder(.1,.09,[x,.11,z],dark);m.rotation.x=Math.PI/2;};
  const legs=(width,depth,height=.74)=>{for(const x of [-width*.38,width*.38])for(const z of [-depth*.36,depth*.36])box([.065,height,.065],[x,height/2,z],steel);};
  const stool=(x,z,chair=false)=>{
    cylinder(.2,.09,[x,.48,z],blue);for(const dx of [-.13,.13])for(const dz of [-.13,.13])bar([x+dx,.02,z+dz],[x+dx*.7,.45,z+dz*.7],.025,steel);
    if(chair)box([.38,.34,.06],[x,.68,z+.18],blue);
  };
  const bench=(desk=false)=>{
    const depth=d*.58;legs(w*.88,depth);box([w*.9,.12,depth],[0,.8,0],wood);
    stool(-w*.22,d*.39,desk);stool(w*.22,-d*.39,desk);
    if(desk){
      box([w*.25,.22,depth*.8],[-w*.29,.57,0],0xe2e7e6);
      box([.65,.42,.06],[w*.14,1.05,-depth*.28],dark);bar([w*.14,.86,-depth*.28],[w*.14,1.05,-depth*.28],.025,steel);
      box([.43,.02,.22],[w*.14,.88,depth*.14],0xe6ecec);
    }else {
      box([.35,.018,.25],[-w*.18,.87,0],0xf3eee2);
      if(prop.kind==='workbench'){box([.18,.15,.13],[w*.33,.91,-depth*.25],blue);box([.27,.05,.11],[w*.33,.99,-depth*.25],steel);}
    }
  };
  const printer=(x,scale=1)=>{
    const g=new THREE.Group();g.position.x=x;group.add(g);
    const part=(size,pos,c,opts)=>view.box(g,size.map(v=>v*scale),pos.map(v=>v*scale),c,opts);
    part([.76,.12,.7],[0,.83,0],dark);part([.56,.06,.54],[0,1.02,0],steel);
    for(const xx of [-.32,.32])for(const z of [-.28,.28])part([.045,.85,.045],[xx,1.26,z],dark);
    part([.72,.07,.65],[0,1.69,0],dark);part([.65,.04,.04],[0,1.41,-.12],steel);part([.15,.18,.17],[.08,1.38,-.1],0xde7834);
    part([.14,.16,.15],[0,1.13,0],0xc9dccb);
    const spool=new THREE.Mesh(new THREE.TorusGeometry(.19*scale,.055*scale,6,16),view.material(0xe5bc67));spool.position.set(0,1.54*scale,-.41*scale);g.add(spool);
  };
  switch(prop.kind){
    case 'workbench':case 'teachingTable':case 'desk':case 'meeting':
      bench(prop.kind==='desk');break;
    case 'electronics':
      legs(w*.9,d*.58);box([w*.94,.12,d*.6],[0,.8,0],wood);
      box([.62,.38,.24],[-w*.23,1.04,-.16],0xe4e8de);box([.38,.23,.025],[-w*.23,1.06,-.025],0x345d65);
      view.line(group,[[-w*.35,1.06,-.005],[-w*.3,1.13,-.005],[-w*.25,1.02,-.005],[-w*.2,1.1,-.005]],0xafdca0);
      box([.35,.03,.3],[w*.2,.88,.05],0x348579);bar([w*.31,.88,-.17],[w*.31,1.14,-.17],.035,dark);stool(0,d*.38);break;
    case 'cnc':
      legs(w*.92,d*.9,.7);box([w,.14,d],[0,.76,0],wood);
      for(let i=0;i<8;i++)box([w*.11,.02,d*.9],[(i-3.5)*w*.12,.85,0],i%2?0xdabb8b:0xc6a16e);
      for(const x of [-w*.45,w*.45])box([.09,.13,d],[x,.98,0],steel);
      box([w,.16,.2],[0,1.24,.12],teal);for(const x of [-w*.44,w*.44])box([.13,.32,.22],[x,1.09,.12],steel);
      cylinder(.12,.43,[.5,1.12,.12],0xe3bb48);break;
    case 'tableSaw':
      box([w*.65,.65,d*.62],[0,.35,0],teal);box([w,.11,d],[0,.76,0],steel);
      box([w*.85,.075,.055],[0,.86,-.18],dark);
      {const blade=cylinder(.21,.025,[0,.85,0],0xb5c0c4);blade.rotation.x=Math.PI/2;}
      box([.16,.12,.07],[w*.28,.59,d*.34],0xd8583b);break;
    case 'bandsaw':
      box([w*.75,.15,d*.7],[0,.08,0],dark);box([w*.55,.7,d*.5],[0,.5,-d*.1],teal);
      box([.16,1.48,.28],[-w*.32,.96,-d*.22],teal);box([w,.08,d*.8],[0,.94,0],steel);
      for(const height of [.47,1.53]){const housing=cylinder(w*.26,.24,[0,height,-d*.24],teal);housing.rotation.x=Math.PI/2;}
      bar([w*.13,.97,0],[w*.13,1.5,0],.012,dark);break;
    case 'waterjet':
      box([w,.45,d],[0,.32,0],steel);box([w*.85,.04,d*.8],[0,.57,0],0x465e65);
      for(let i=0;i<9;i++)box([.045,.08,d*.78],[(i-4)*w*.09,.63,0],0x97a9ab);
      for(const x of [-w*.47,w*.47])box([.11,.13,d],[x,.74,0],dark);
      box([w,.12,.14],[0,.97,.2],teal);bar([.35,.68,.2],[.35,1.22,.2],.04,0xdbb348);break;
    case 'laser':
      legs(w*.9,d*.9,.4);box([w,.45,d],[0,.65,0],0x9d4749);
      box([w*.75,.04,d*.73],[-w*.06,.9,0],0x547d88,{transparent:true,opacity:.65});
      for(const z of [-d*.4,d*.4])box([w*.8,.05,.055],[-w*.06,.94,z],0xc97976);
      box([.24,.04,.33],[w*.4,.92,0],dark);break;
    case 'printerBank':
      legs(w,d*.8,.72);box([w,.1,d*.76],[0,.78,0],wood);for(const x of [-w*.31,0,w*.31])printer(x,.92);break;
    case 'resinPrinter':
      box([w*.8,.62,d*.7],[0,.34,0],0xe1e4df);box([w*.72,.78,d*.65],[0,1.02,0],0xe9ac38,{transparent:true,opacity:.65});
      box([w*.5,.06,d*.4],[0,.76,0],dark);bar([0,.8,-d*.2],[0,1.35,-d*.2],.04,steel);box([.2,.25,.2],[0,.95,0],0xe8dcca);break;
    case 'enclosedPrinter':
      box([w*.95,1.65,d*.9],[0,.86,0],0xe2e5e2);box([w*.65,.9,.05],[0,1.02,d*.46],dark);box([w*.47,.65,.06],[0,1.03,d*.49],0x577b86);
      box([.23,.17,.06],[w*.32,1.51,d*.46],dark);for(let i=0;i<4;i++)box([w*.55,.025,.03],[0,.28+i*.07,d*.47],steel);break;
    case 'robotArm':{
      cylinder(.32,.2,[0,.12,0],dark);cylinder(.22,.37,[0,.4,0],0xdf7834);
      const pose=prop.id==='ethel'?-1:1,points=[[0,.58,0],[pose*.35,1.2,-.1],[-pose*.27,1.56,.1],[pose*.1,1.38,.23]];
      for(let i=1;i<points.length;i++){bar(points[i-1],points[i],i===1?.13:.1,0xdf7834);const joint=new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),view.material(dark));joint.position.set(...points[i-1]);group.add(joint);}
      bar(points.at(-1),[pose*.1,1.24,.23],.055,dark);break;
    }
    case 'whiteboard':case 'fallenWhiteboard':{
      const fallen=prop.kind==='fallenWhiteboard',h=fallen?.58:1.35;
      for(const x of [-w*.4,w*.4]){bar([x,.12,-d*.25],[x,h,0],.035,steel);wheel(x,-d*.3);wheel(x,d*.3);}
      const panel=box([w*.94,fallen?.65:.78,.065],[0,fallen?.4:1.05,0],0xf5f4e8);if(fallen)panel.rotation.x=-.65;
      for(let i=0;i<4;i++)box([.12,.1,.015],[(i-1.5)*w*.18,fallen?.44:1.13,.05],i%2?0xe3b956:0xd58f9c);
      break;
    }
    case 'materialsCart':
      for(const x of [-w*.44,w*.44])for(const z of [-d*.4,d*.4]){bar([x,.15,z],[x,.88,z],.035,steel);wheel(x,z);}
      for(const h of [.2,.49,.8])box([w,.035,d],[0,h,0],steel);
      for(const x of [-w*.28,0,w*.28]){box([w*.23,.18,d*.72],[x,.34,0],0x748e98);box([w*.17,.16,d*.6],[x,.64,0],0xe1bd62);}
      for(const x of [-w*.42,w*.42])bar([x,.9,-d*.4],[x,.9,d*.4],.035,steel);break;
    case 'display':
      box([w,prop.h*.65,.13],[0,prop.h*.62,0],dark);box([w*.94,prop.h*.56,.02],[0,prop.h*.62,.075],0x447681);
      box([w*.62,.025,.025],[0,prop.h*.67,.09],0xc1dce0);for(const x of [-w*.3,w*.3])bar([x,.05,0],[x,.7,0],.045,steel);break;
    case 'camera':
      for(const angle of [0,2.1,4.2])bar([Math.sin(angle)*.54,.05,Math.cos(angle)*.54],[0,1.15,0],.035,dark);
      box([.45,.3,.3],[0,1.35,0],dark);{const lens=cylinder(.12,.24,[0,1.35,.25],0x698b9a);lens.rotation.x=Math.PI/2;}break;
    case 'sewing':
      legs(w*.9,d*.7);box([w,.1,d*.72],[0,.8,0],wood);box([.55,.12,.36],[0,.91,0],0xe1e8e6);box([.16,.4,.25],[-.2,1.13,0],0xe1e8e6);box([.55,.14,.25],[0,1.31,0],0xe1e8e6);bar([.22,1.01,.02],[.22,1.3,.02],.018,steel);stool(0,d*.4);break;
    case 'welding':
      legs(w*.8,d*.8,.65);box([w*.8,.08,d*.8],[0,.7,0],steel);bar([-w*.4,.1,-d*.4],[-w*.4,1.25,-d*.4],.04,dark);box([w,.9,.04],[0,.8,-d*.43],0x667f69,{transparent:true,opacity:.72});break;
    case 'lounge':
      box([w,.25,d*.9],[0,.26,0],0x80a9ae);box([w,.5,.18],[0,.51,-d*.39],0x80a9ae);for(const x of [-w*.42,w*.42])box([.15,.35,d*.9],[x,.45,0],0x80a9ae);break;
    case 'podium':
      box([w*.7,1,d*.7],[0,.53,0],teal);box([w,.1,d],[0,1.09,0],wood);box([.55,.04,.4],[0,1.16,0],dark);break;
    default:throw new Error(`Unknown Jacobs furnishing: ${prop.kind}`);
  }
  return group;
}
