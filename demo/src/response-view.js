import * as THREE from 'three';

export function makeFirefighter(view,color){
  const group=new THREE.Group(),coat=0x394145,black=0x202c32,reflective=0xe2dc58;
  const box=(size,pos,c,options)=>view.box(group,size,pos,c,options);
  const cylinder=(r,h,pos,c)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),view.material(c));mesh.position.set(...pos);group.add(mesh);return mesh;};
  const sphere=(r,pos,c,scale=[1,1,1])=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),view.material(c));mesh.position.set(...pos);mesh.scale.set(...scale);group.add(mesh);return mesh;};
  for(const x of [-.14,.14]){
    box([.21,.2,.32],[x,.13,.04],black);
    cylinder(.105,.49,[x,.45,0],coat);cylinder(.113,.065,[x,.34,0],reflective);
    cylinder(.1,.44,[Math.sign(x)*.35,.92,0],coat);cylinder(.105,.06,[Math.sign(x)*.35,.81,0],reflective);
    sphere(.11,[Math.sign(x)*.35,.68,.02],black);
  }
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.26,.35,4,10),view.material(coat));body.position.y=.96;group.add(body);
  cylinder(.275,.075,[0,.8,0],reflective);box([.075,.32,.025],[-.13,1.03,.25],reflective);box([.075,.32,.025],[.13,1.03,.25],reflective);
  box([.14,.13,.035],[.17,1.17,.24],color);box([.09,.14,.06],[-.15,1.18,.25],black); // crew patch + radio
  sphere(.21,[0,1.43,0],black); // protective hood
  const visor=sphere(.18,[0,1.44,.1],0x71969c,[.82,.7,.8]);visor.material=view.material(0x71969c,{transparent:true,opacity:.78,metalness:.2});
  cylinder(.31,.055,[0,1.55,0],0xf2c74b);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(.27,12,8,0,Math.PI*2,0,Math.PI/2),view.material(0xf2c74b));dome.position.y=1.56;group.add(dome);
  box([.15,.15,.035],[0,1.67,.24],color);box([.06,.1,.1],[.26,1.59,.05],0xe4e9da);
  box([.31,.49,.09],[0,.99,-.27],black);
  cylinder(.125,.57,[0,1.01,-.34],0xbbc6bb);cylinder(.14,.065,[0,.97,-.34],black);cylinder(.07,.08,[0,1.34,-.34],black);
  view.line(group,[[.03,1.34,-.34],[.3,1.36,-.13],[.29,1.36,.16],[.07,1.35,.25]],black);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.57,24),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;group.add(ring);
  group.userData.role='firefighter';return group;
}

export function makeResponseVehicle(view,parent,placement){
  const group=new THREE.Group();group.position.set(placement.x,0,placement.z);parent.add(group);
  group.userData={vehicle:placement.id};
  const red=0xaf3835,dark=0x31434b,steel=0xa7b2b5;
  const box=(size,pos,color,options)=>view.box(group,size,pos,color,options);
  const cylinder=(r,h,pos,color)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,14),view.material(color));mesh.position.set(...pos);group.add(mesh);return mesh;};
  box([7,.35,2.15],[0,.56,0],dark);box([4.8,1.06,2.22],[-1.05,1.12,0],red);
  box([1.9,1.73,2.28],[2.37,1.44,0],red);box([2.03,.12,2.4],[2.37,2.34,0],0xe1e7e6);
  box([.03,.69,1.94],[3.34,1.82,0],0x739ba5);box([.04,.1,1.9],[3.38,1.5,0],dark);
  for(const z of [-1.15,1.15]){
    box([1.42,.62,.025],[2.4,1.8,z],0x739ba5);box([.045,.7,.035],[2.23,1.81,z],red);
    box([5.1,.13,.025],[-.95,.93,z],0xf3e6b3);
    for(const x of [-2.55,-1.3]){
      box([1.02,.67,.035],[x,1.3,z],steel);
      for(let i=0;i<5;i++)box([.97,.018,.045],[x,1.05+i*.12,z*1.015],0x7b8a90);
    }
    box([1.15,.67,.04],[.23,1.31,z],dark);
    for(const x of [-.1,.26,.61]){const valve=cylinder(.12,.045,[x,1.37,z*1.03],steel);valve.rotation.x=Math.PI/2;}
    for(const x of [-2.45,-1.25,2.32]){
      const tire=cylinder(.44,.19,[x,.45,z*1.06],0x263239);tire.rotation.x=Math.PI/2;
      const hub=cylinder(.22,.2,[x,.45,z*1.065],steel);hub.rotation.x=Math.PI/2;
    }
  }
  box([.3,.21,2.4],[3.52,.59,0],steel);
  for(const z of [-.77,.77])box([.055,.22,.36],[3.46,1.04,z],0xf2e4b3);
  for(const z of [-.68,.68])box([.6,.16,.35],[2.3,2.49,z],z<0?0x407faa:0xe06c62,{emissive:z<0?0x143b54:0x601e19,emissiveIntensity:.3});
  // Folded roof ladder stays below the cab roof; no raised boom obscures the model.
  const ladderY=placement.kind==='ladder'?2.12:1.86;
  for(const z of [-.43,.43])box([4.65,.08,.065],[-.81,ladderY,z],steel);
  for(let x=-3;x<=1.3;x+=.42)box([.055,.065,.86],[x,ladderY,0],steel);
  if(placement.kind==='ladder')for(const z of [-.32,.32])box([4.3,.06,.045],[-.8,ladderY+.12,z],0xc8cfcb);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#af3835';ctx.fillRect(0,0,256,64);ctx.fillStyle='#fff2ce';ctx.font='bold 35px sans-serif';ctx.textAlign='center';ctx.fillText(placement.kind==='ladder'?'LADDER 02':'ENGINE 01',128,45);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.35),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(1.22,1.25,1.163);group.add(sign);
  // One cone per vehicle and a small hose coil add context without filling the street.
  const cone=new THREE.Mesh(new THREE.ConeGeometry(.19,.54,12),view.material(0xdc8641));cone.position.set(-3.9,.3,.1);group.add(cone);box([.44,.05,.44],[-3.9,.04,.1],dark);
  const coil=new THREE.Mesh(new THREE.TorusGeometry(.36,.07,6,20),view.material(0xb5a77c));coil.rotation.x=Math.PI/2;coil.position.set(-2.5,.1,1.37);group.add(coil);
  return group;
}
