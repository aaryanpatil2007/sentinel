import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeFirefighter, makeResponseVehicle } from './response-view.js';
import { makeFurnishing } from './furnishings.js';
import { FLOOR_HEIGHT, LEVELS, ROOMS, UNIT_COLORS, levelLabel, BATHROOMS, LOCKED_ROOMS, OBSTACLES, fireLobes, edgeClear, segmentClear, ROOM_CHARACTER, dangerAppearance, RESPONSE_STAGING, key } from './building.js';

const VIEW_FLOOR_HEIGHT = 8;
const viewY = y => (y - .48) / FLOOR_HEIGHT * VIEW_FLOOR_HEIGHT + .48;

const colors = { slab: 0xe4ded0, wall: 0xf1e9db, metal: 0x576b78, room: 0xe7edf0, glass: 0x8eaebe, route: 0x147f9a };
export class BuildingView {
  constructor(container, simulation, onSelect) {
    this.container = container; this.sim = simulation; this.onSelect = onSelect; this.floor = null; this.shell = false; this.fitScale = 1; this.activeUnit = 1; this.roomLabels = []; this.contextObjects = [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xeaf0f5);
    this.scene.fog = new THREE.Fog(0xeaf0f5, 110, 230);
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 350);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer(); this.labelRenderer.domElement.className = 'scene-labels';
    container.appendChild(this.labelRenderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .08;
    this.controls.minDistance = 15; this.controls.maxDistance = 135; this.controls.maxPolarAngle = Math.PI * .49;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc2c4b8, 2.5));
    const sun = new THREE.DirectionalLight(0xfff4e7, 3.5); sun.position.set(-30, 65, 35); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 50, bottom: -40, far: 150 });
    sun.shadow.bias = -.0006; this.scene.add(sun);
    this.materials = new Map(); this.floorGroups = []; this.shellGroups = []; this.pings = new Map(); this.fires = new Map();
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.crewModels = new Map(); this.walkers = new Map(); this.assemblyLabels = new Map(); this.doorVisuals = new Map(); this.smokeLayers = new Map(); this.smokeVisible = true;
    this.makeGround(); this.makeBuilding(); this.makeSmokeLayers(); this.makeMarkers();
    this.pathGroup = new THREE.Group(); this.scene.add(this.pathGroup); this.lastPath = '';
    this.syncCrews();
    this.resetCamera();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize();
  }
  material(color, options = {}) {
    const id = `${color}-${JSON.stringify(options)}`;
    if (!this.materials.has(id)) this.materials.set(id, new THREE.MeshStandardMaterial({ color, roughness: .8, ...options }));
    return this.materials.get(id);
  }
  box(parent, size, pos, color, options) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color, options));
    mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  line(parent, points, color, opacity = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })); parent.add(line); return line;
  }
  label(parent, text, pos, className = '') {
    const el = document.createElement('div'); el.className = `map-label ${className}`; el.textContent = text;
    const label = new CSS2DObject(el); label.position.set(...pos); parent.add(label); return label;
  }
  makeGround() {
    this.ground=this.box(this.world,[56,.2,38],[0,-8.8,3],0xe1e8ed);
    this.siteContext=new THREE.Group();this.world.add(this.siteContext);
    const outline=[[-29,-16],[29,-16],[29,23],[-29,23]];
    const footprint=[[-17.8,-9.7],[-17.8,8.9],[-11.8,8.9],[-11.8,11],[11.8,11],[11.8,8.9],[17.8,8.9],[17.8,-9.7]];
    const terrain=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,z)));
    terrain.holes.push(new THREE.Path(footprint.map(([x,z])=>new THREE.Vector2(x,z))));
    const surface=new THREE.Mesh(new THREE.ShapeGeometry(terrain),new THREE.MeshBasicMaterial({color:0x9fb8bc,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));
    surface.rotation.x=Math.PI/2;surface.position.y=-.12;this.siteContext.add(surface);
    this.line(this.siteContext,[...outline,outline[0]].map(([x,z])=>[x,-.1,z]),0x829fa7,.42);
    this.line(this.siteContext,[...footprint,footprint[0]].map(([x,z])=>[x,-.08,z]),0x718e99,.55);
    const ghostBox=(size,pos,color,opacity)=>{
      const mesh=this.box(this.siteContext,size,pos,color,{transparent:true,opacity,depthWrite:false});
      mesh.castShadow=false;mesh.receiveShadow=false;return mesh;
    };
    // A faint cut face conveys the depth below the outside ground plane.
    for(const x of [-17.8,17.8]){
      ghostBox([.04,7.8,18.6],[x,-4.1,-.4],0x8ea6af,.13);
      this.line(this.siteContext,[[x,-.1,8.9],[x,-7.9,8.9]],0x7896a1,.5);
    }
    ghostBox([23.6,7.8,.04],[0,-4.1,11],0x8ea6af,.09);
    ghostBox([58,.04,6],[0,-.07,19.5],0x8eabb7,.19);
    this.line(this.siteContext,[[-29,-.02,16.5],[29,-.02,16.5]],0x91a7af,.5);
    for(let x=-25;x<=25;x+=10)this.line(this.siteContext,[[x,-.01,19.5],[x+4,-.01,19.5]],0xffffff,.65);
    ghostBox([10,.1,23],[-24,VIEW_FLOOR_HEIGHT-.2,-.3],0xb4c6c6,.21);
    const response=new THREE.Group();response.userData.floor=1;response.userData.overviewOnly=true;this.world.add(response);this.contextObjects.push(response);
    for(const placement of RESPONSE_STAGING)makeResponseVehicle(this,response,placement);
    this.label(this.siteContext,'Ground level',[24,.7,-7],'ground-level-label');
    this.label(this.siteContext,'Ridge Road',[4,.55,22],'site-street-label');
    for(const id of ['safe','safe-east']){
      const n=this.sim.building.nodes.get(id),y=viewY(n.y)-.4;
      const group=new THREE.Group();group.userData.floor=n.floor;this.world.add(group);this.contextObjects.push(group);
      this.box(group,[6,.12,3],[n.x,y,n.z],0xb9dace);
      this.assemblyLabels.set(id,this.label(group,'✓ Safe exit',[n.x,y+.9,n.z+1.6],'safe-label'));
    }
  }
  makeBuilding() {
    for(const f of LEVELS){
      const y=(f-1)*VIEW_FLOOR_HEIGHT,group=new THREE.Group();group.userData.floor=f;this.world.add(group);this.floorGroups.push(group);
      this.box(group,[35,.2,18],[0,y,-.4],0xdce3e5);
      this.box(group,[23,.2,5],[0,y,8.2],0xdce3e5);
      this.box(group,[32,.06,2.2],[0,y+.19,3],0xc7d8d6);
      const shell=new THREE.Group();group.add(shell);this.shellGroups.push(shell);
      this.box(shell,[34,VIEW_FLOOR_HEIGHT-.3,.2],[0,y+VIEW_FLOOR_HEIGHT/2,-9.3],0xd5dbda);
      for(const x of [-14,-10,-6,-2,2,6,10,14]){
        this.box(shell,[3.7,VIEW_FLOOR_HEIGHT-1.2,.12],[x,y+VIEW_FLOOR_HEIGHT/2,-9.15],0x99b7c3,{metalness:.15,roughness:.3});
        this.box(shell,[.1,VIEW_FLOOR_HEIGHT-1.1,.15],[x,y+VIEW_FLOOR_HEIGHT/2,-9.03],0x6d818e);
      }
      for(const room of [...ROOMS,...BATHROOMS].filter(r=>r.floor===f)){
        this.box(group,[room.w-.15,.08,room.d-.2],[room.x,y+.2,room.z],room.kind==='maker'||room.kind==='shop'?0xd0dce1:0xe5e7e0);
        // Low, translucent partitions expose useful detail without hiding occupants.
        const front=room.z>5?room.z-room.d/2:Math.min(1.4,room.z+room.d/2),back=room.z>5?room.z+room.d/2:room.z-room.d/2;
        const depth=Math.abs(back-front),middle=(back+front)/2,wall={transparent:true,opacity:.68};
        for(const x of [room.x-room.w/2,room.x+room.w/2])this.box(group,[.12,.75,depth],[x,y+.58,middle],0xa7b9c2,wall);
        this.box(group,[room.w,.75,.12],[room.x,y+.58,back],0xa7b9c2,wall);
        const gap=1.6,wing=(room.w-gap)/2;
        for(const direction of [-1,1])this.box(group,[wing,.75,.12],[room.x+direction*(gap/2+wing/2),y+.58,front],0xa7b9c2,wall);
        const locked=LOCKED_ROOMS.has(room.id);
        this.box(group,[1.4,.06,.5],[room.x,y+.32,front],locked?0xc58a3a:0x7da89b);
        if(locked){
          const panel=this.box(group,[1.4,.85,.12],[room.x,y+.7,front],0xc58a3a,{transparent:true,opacity:.8}),label=this.label(group,'Locked',[room.x,y+1.4,front],'locked-room-label');
          this.roomLabels.push(label);this.doorVisuals.set(room.id,{panel,label});
        }
        if(room.kind==='bathroom'){
          for(const direction of [-1,1])this.box(group,[.9,.55,1.1],[room.x+direction*.9,y+.55,room.z-.8],0xf6f7f5);
          this.box(group,[.1,.7,1.8],[room.x,y+.6,room.z-.8],0xb7c8ce,wall);
          this.box(group,[2.7,.65,.7],[room.x,y+.6,room.z+1.4],0xc1d4db);
        }
        if(ROOM_CHARACTER[room.id])this.box(group,[room.w*.65,.18,.14],[room.x,y+.9,back],0x81afb2);
        const text=room.kind==='bathroom'?'WC · Restrooms':room.kind==='studio'||room.kind==='maker'||room.kind==='shop'?room.label:room.id;
        const label=this.label(group,text,[room.x,y+.65,room.z-1],room.d>6?'room-label':'small-room-label');
        if(ROOM_CHARACTER[room.id]){label.element.innerHTML=`<strong>${text}</strong><small>${ROOM_CHARACTER[room.id]}</small>`;label.element.classList.add('character-label');}
        this.roomLabels.push(label);
      }
      for(const prop of OBSTACLES.filter(p=>p.floor===f)){
        makeFurnishing(this,group,prop,y);
        if(prop.kind==='materialsCart'||prop.kind==='fallenWhiteboard')this.roomLabels.push(this.label(group,prop.label,[prop.x,y+1.5,prop.z],'obstruction-label'));
      }
      const passageFire=this.sim.building.fires.find(front=>front.floor===f&&(f===1||f===3));
      if(passageFire)this.roomLabels.push(this.label(group,'Fire blocks through-passage',[passageFire.x,y+1.5,passageFire.z],'blocked-label'));
      for(const [x,name]of [[-16,'E'],[16,'W']]){
        this.box(group,[3,.18,3.5],[x,y+.23,4],0x9dadb3);
        for(let i=0;i<13&&f<3;i++)this.box(group,[2.2,.13,.25],[x,y+.35+i*VIEW_FLOOR_HEIGHT/13,2.5+i*.25],0x586f7e);
        this.box(group,[.16,3.8,3.6],[x+(x<0?-1.4:1.4),y+2,4],0x9baab0);
        // Stair names appear with the isolated floor, keeping overview labels sparse.
        this.roomLabels.push(this.label(group,`${name} stair`,[x,y+.8,6.7],'stair-label'));
      }
      this.label(group,f===0?'B · Basement':f===1?'1 · Ground':String(f),[-20,y+1,8],'floor-label');
      this.box(shell,[35,VIEW_FLOOR_HEIGHT-.3,.25],[0,y+VIEW_FLOOR_HEIGHT/2,6],0xa2afb3);
      for(const x of [-13,-8,-3,2,7,12])this.box(shell,[4.6,2.9,.16],[x,y+2.1,6.16],0x8aafbe,{metalness:.3,roughness:.22});
      this.box(shell,[.25,3.8,17],[-17.4,y+2,-.5],0x6b7e89);
      this.box(shell,[.25,3.8,17],[17.4,y+2,-.5],0x6b7e89);
    }
    this.roof=new THREE.Group();this.world.add(this.roof);
    const top=3*VIEW_FLOOR_HEIGHT;
    this.box(this.roof,[36,.35,19],[0,top,-.5],0xc5cdd0);
    for(const x of [-12,-6,0,6,12])for(const z of [-6,-1,4])this.box(this.roof,[5.5,.12,4.5],[x,top+.6,z],0x3f6075,{metalness:.4,roughness:.25});
    this.label(this.roof,'Jacobs Hall',[0,top+1.1,7],'building-label');
    this.blockMarkers=[];
    for(const edge of this.sim.building.edges.values())if(edge.blocked&&!edge.obstruction){
      const a=this.sim.building.nodes.get(edge.a),b=this.sim.building.nodes.get(edge.b);
      const label=this.label(this.world,edge.type==='stairs'?'✕ Stair':'✕ Passage',[(a.x+b.x)/2,viewY((a.y+b.y)/2)+.8,(a.z+b.z)/2+1],'blocked-label');
      this.blockMarkers.push({label,floors:[a.floor,b.floor]});
    }
    for(const [text,pos,floor]of [['West entrance',[23,.9,7],1],['East entrance',[-23,VIEW_FLOOR_HEIGHT+.9,5],2]]){
      const label=this.label(this.world,text,pos,'entrance-label');label.userData.floor=floor;this.contextObjects.push(label);
    }
    this.setVisibility();
  }
  makeSmokeLayers(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const context=canvas.getContext('2d'),gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(77,96,111,.3)');gradient.addColorStop(.45,'rgba(91,110,121,.16)');gradient.addColorStop(1,'rgba(110,128,139,0)');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);this.smokeTexture=new THREE.CanvasTexture(canvas);this.smokeTexture.colorSpace=THREE.SRGBColorSpace;
    for(const room of ROOMS){
      const haze=new THREE.Mesh(new THREE.PlaneGeometry(room.w*.96,room.d*.85),new THREE.MeshBasicMaterial({map:this.smokeTexture,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
      haze.rotation.x=-Math.PI/2;haze.position.set(room.x,(room.floor-1)*VIEW_FLOOR_HEIGHT+.56,room.z);
      this.floorGroups.find(g=>g.userData.floor===room.floor).add(haze);this.smokeLayers.set(`r${room.id}`,haze);
    }
  }
  toggleSmoke(){this.smokeVisible=!this.smokeVisible;return this.smokeVisible;}
  makePerson(color) {
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.25,.5,3,6),this.material(color).clone());body.position.y=.58;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),this.material(0xf4d3ae));head.position.y=1.2;g.add(head);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.57,24),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;g.add(ring);
    g.userData.tint={body,ring};return g;
  }
  tintPerson(group,appearance){
    if(group.userData.dangerColor===appearance.color)return;
    group.userData.dangerColor=appearance.color;group.userData.tint.body.material.color.set(appearance.color);group.userData.tint.ring.material.color.set(appearance.color);
  }
  makeMarkers() {
    for(const person of this.sim.people){
      const n=this.sim.building.nodes.get(person.node),g=this.makePerson(0xd9784d);g.position.set(n.x,viewY(n.y),n.z);this.scene.add(g);
      const el=document.createElement('button');el.type='button';el.className='person-ping urgent';el.title=`Person ${person.id} · ${n.label}`;el.setAttribute('aria-label',el.title);
      el.innerHTML=`<span class="ping-dot"></span>${person.id}<span class="ping-room">${person.room}</span>`;el.addEventListener('click',()=>this.onSelect(person.id));
      const label=new CSS2DObject(el);label.position.set(0,2,0);g.add(label);this.pings.set(person.id,{group:g,label,el});
      const walker=this.makePerson(0x259a75);const tag=this.label(walker,`P${person.id}`,[0,1.8,0],'walking-label');walker.visible=false;this.scene.add(walker);this.walkers.set(person.id,{group:walker,tag});
    }
  }
  syncCrews(){
    for(const [id,model]of this.crewModels){if(!this.sim.firefighters.some(f=>f.id===id)){model.tag.element.remove();this.scene.remove(model.group);model.escorts.forEach(e=>this.scene.remove(e));this.crewModels.delete(id);}}
    for(const ff of this.sim.firefighters)if(!this.crewModels.has(ff.id)){
      const group=makeFirefighter(this,ff.color);const tag=this.label(group,`F${ff.id}`,[0,2.2,0],'unit-map-label');tag.element.style.color=ff.color;this.scene.add(group);
      const escorts=[this.makePerson(0x259a75),this.makePerson(0x259a75)];escorts.forEach(e=>{e.visible=false;this.scene.add(e);});this.crewModels.set(ff.id,{group,tag,escorts});
    }
  }
  makeFire(front) {
    const g=new THREE.Group();g.position.y=viewY((front.floor-1)*FLOOR_HEIGHT+.48);
    const lobes=[],tongues=[],smoke=[];
    for(let j=0;j<3;j++){
      const footprint=new THREE.Mesh(new THREE.CircleGeometry(1,48),new THREE.MeshBasicMaterial({color:0xe96e2c,transparent:true,opacity:.52,depthWrite:false}));
      footprint.rotation.x=-Math.PI/2;footprint.position.y=.02+j*.004;g.add(footprint);
      const rim=new THREE.Mesh(new THREE.RingGeometry(1,1.06,48),new THREE.MeshBasicMaterial({color:0xf7af44,transparent:true,opacity:.68,side:THREE.DoubleSide,depthWrite:false}));
      rim.rotation.x=-Math.PI/2;rim.position.y=.035+j*.004;g.add(rim);lobes.push({footprint,rim});
      for(let i=0;i<4;i++){
        const flame=new THREE.Mesh(new THREE.ConeGeometry(.21,1.35,6),new THREE.MeshBasicMaterial({color:i%2?0xffc353:0xf16a2e,transparent:true,opacity:.9,depthWrite:false}));
        flame.userData={lobe:j,angle:i*2.4,offset:i?.5:0};g.add(flame);tongues.push(flame);
      }
      const puff=new THREE.Sprite(new THREE.SpriteMaterial({map:this.smokeTexture,transparent:true,opacity:.4,depthWrite:false}));puff.scale.set(2.4,2.4,1);g.add(puff);smoke.push(puff);
    }
    this.scene.add(g);const fire={group:g,lobes,tongues,smoke,floor:front.floor};this.fires.set(front.id,fire);return fire;
  }
  setActiveUnit(id){if(this.activeUnit!==id){this.activeUnit=id;this.lastPath='';}}
  drawRoute(){
    const ff=this.sim.firefighters.find(f=>f.id===this.activeUnit)??this.sim.firefighter;
    const route=this.sim.routeNodes(ff);
    const signature=ff.id+'|'+route.join(',')+'|'+ff.escapePath.join(',')+'|'+ff.pickups.join(',')+'|'+this.sim.building.hazardVersion;
    if(signature===this.lastPath)return;this.lastPath=signature;
    while(this.pathGroup.children.length){const c=this.pathGroup.children[0];this.pathGroup.remove(c);c.geometry?.dispose();c.material?.dispose();}
    const make=(ids,color)=>{
      for(let i=1;i<ids.length;i++){
        const a=this.sim.building.nodes.get(ids[i-1]),b=this.sim.building.nodes.get(ids[i]);
        if(!edgeClear(this.sim.building,a.id,b.id,{allowForcedEntry:true}))continue;
        const curve=new THREE.LineCurve3(new THREE.Vector3(a.x,viewY(a.y)+.3,a.z),new THREE.Vector3(b.x,viewY(b.y)+.3,b.z));
        const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,1,.13,6,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthTest:true}));
        mesh.renderOrder=10;mesh.userData.floors=[a.floor,b.floor];this.pathGroup.add(mesh);
      }
    };
    if(ff.pickups.length){
      const split=Math.max(0,route.length-ff.escapePath.length);
      make(route.slice(0,split+1),ff.color);make(route.slice(split),0x168c73);
    }else make(route,ff.carrying.length?0x168c73:ff.color);
  }
  setVisibility(){
    this.floorGroups.forEach(g=>{g.visible=this.floor===null||g.userData.floor===this.floor;});
    this.roomLabels.forEach(label=>{label.visible=this.floor!==null;});
    this.ground.visible=this.floor===null;
    this.siteContext.visible=this.floor===null||this.floor===0||this.floor===1;
    this.contextObjects.forEach(object=>{object.visible=this.floor===null||(!object.userData.overviewOnly&&object.userData.floor===this.floor);});
    this.shellGroups.forEach(g=>{g.visible=this.shell;});this.roof.visible=this.shell&&this.floor===null;
    for(const {label,floors}of this.blockMarkers)label.visible=this.floor===null||floors.includes(this.floor);
  }
  setFloor(floor){this.floor=floor==='all'?null:Number(floor);this.setVisibility();this.resetCamera(this.topView);}
  toggleShell(){this.shell=!this.shell;this.setVisibility();return this.shell;}
  resetCamera(top=false){
    this.topView=top;const y=this.floor===null?5:(this.floor-1)*VIEW_FLOOR_HEIGHT;
    this.camera.position.set(top?0:46,top?y+68:y+35,top?.01:62);this.controls.target.set(0,y,0);
    this.camera.position.sub(this.controls.target).multiplyScalar(this.fitScale).add(this.controls.target);this.controls.update();
  }
  resize(){
    const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;
    const fitScale=Math.max(1,1.05/(width/height));this.camera.position.sub(this.controls.target).multiplyScalar(fitScale/this.fitScale).add(this.controls.target);this.fitScale=fitScale;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);this.labelRenderer.setSize(width,height);
  }
  onFloor(y){return this.floor===null||Math.abs(y-((this.floor-1)*FLOOR_HEIGHT+.48))<FLOOR_HEIGHT*.8;}
  update(elapsed){
    this.controls.update();this.syncCrews();this.drawRoute();
    for(const p of this.sim.people){
      const appearance=dangerAppearance(this.sim.urgency(p)),ping=this.pings.get(p.id),n=this.sim.building.nodes.get(p.node),location=this.sim.position(p);ping.group.position.set(location.x,viewY(location.y),location.z);
      this.tintPerson(ping.group,appearance);
      ping.el.style.setProperty('--danger-color',appearance.color);ping.el.style.setProperty('--danger-ink',appearance.ink);ping.el.style.setProperty('--danger-bg',appearance.background);ping.el.dataset.severity=appearance.label;
      ping.el.title=`Person ${p.id} · ${n.label} · ${appearance.label} danger · ${Math.round(this.sim.urgency(p)*100)}%`;
      ping.group.visible=['waiting','stranded'].includes(p.status)&&this.onFloor(location.y);
      const owner=this.sim.firefighters.find(f=>f.pickups.includes(p.id));ping.el.classList.toggle('target',owner?.id===this.activeUnit);ping.el.setAttribute('aria-label',`Person ${p.id} · ${n.label} · ${appearance.label.toLowerCase()} danger${owner?` · assigned to unit ${owner.id}`:''}`);
      const walker=this.walkers.get(p.id),pos=this.sim.position(p),destination=new THREE.Vector3(pos.x,viewY(pos.y),pos.z);
      if(p.status==='rescued'&&walker.group.visible)walker.group.position.lerp(destination,.18);else walker.group.position.copy(destination);
      walker.group.visible=['walking','rescued'].includes(p.status)&&this.onFloor(pos.y);walker.group.userData.status=p.status;
      walker.tag.visible=this.floor!==null&&p.status==='walking';this.tintPerson(walker.group,appearance);walker.tag.element.style.color=appearance.color;walker.tag.element.textContent=`P${p.id} · ${appearance.label}`;
    }
    for(const [id,label]of this.assemblyLabels){const count=this.sim.people.filter(p=>p.status==='rescued'&&p.node===id).length;label.element.textContent=count?`✓ Safe exit · ${count} safe`:'✓ Safe exit';}
    for(const [id,haze]of this.smokeLayers){const node=this.sim.building.nodes.get(id);haze.material.opacity=this.smokeVisible?Math.min(.32,node.smoke*.36):0;}
    for(const [room,{panel,label}]of this.doorVisuals){const door=this.sim.building.edges.get(key(`r${room}`,`d${room}`));panel.visible=door.locked;label.element.textContent=door.locked?'Locked':'Forced open';label.element.classList.toggle('forced-open',!door.locked);}
    for(const front of this.sim.building.fires){
      const fire=this.fires.get(front.id)??this.makeFire(front),lobes=fireLobes(front);
      fire.group.visible=this.floor===null||front.floor===this.floor;
      fire.lobes.forEach(({footprint,rim},i)=>{
        const lobe=lobes[i];for(const mesh of [footprint,rim]){mesh.position.x=lobe.x;mesh.position.z=lobe.z;mesh.scale.setScalar(lobe.radius);}
      });
      fire.tongues.forEach((t,i)=>{
        const lobe=lobes[t.userData.lobe],offset=t.userData.offset*lobe.radius;
        t.position.set(lobe.x+Math.cos(t.userData.angle)*offset,.65,lobe.z+Math.sin(t.userData.angle)*offset);
        t.scale.y=.8+Math.sin(elapsed*7+i*2)*.18;
      });
      fire.smoke.forEach((p,i)=>{const rise=(elapsed*.32+i*.6)%2.6;p.visible=this.smokeVisible;p.position.set(lobes[i].x+Math.sin(elapsed*.35+i)*.25,1.1+rise,lobes[i].z);p.material.opacity=(this.sim.containmentStarted?.26:.4)*(1-rise/3.8);p.scale.setScalar(1.8+rise*.4);});
    }
    for(const ff of this.sim.firefighters){
      const model=this.crewModels.get(ff.id),p=this.sim.position(ff);model.group.position.set(p.x+(ff.node==='safe'?(ff.id-2)*2.4*(ff.next?1-ff.progress:1):0),viewY(p.y),p.z);model.group.visible=this.onFloor(p.y);model.tag.visible=ff.id===this.activeUnit;model.tag.element.textContent=`F${ff.id}`;model.tag.element.classList.toggle('active-unit',ff.id===this.activeUnit);
      const toward=this.sim.building.nodes.get(ff.next??ff.path[0]);if(toward&&Math.hypot(toward.x-p.x,toward.z-p.z)>.01)model.group.rotation.y=Math.atan2(toward.x-p.x,toward.z-p.z);
      model.escorts.forEach((e,i)=>{
        e.visible=ff.carrying.length>i&&model.group.visible;
        const escorted=this.sim.people.find(person=>person.id===ff.carrying[i]);if(escorted)this.tintPerson(e,dangerAppearance(this.sim.urgency(escorted)));
        const candidate={x:p.x+(i?.22:-.22),y:p.y,z:p.z};
        const location=segmentClear(this.sim.building,candidate,candidate,{clearance:.28,fixtureClearance:.28})?candidate:p;
        e.position.set(location.x,viewY(location.y),location.z);
      });
    }
    for(const m of this.pathGroup.children)m.visible=this.floor===null||m.userData.floors.includes(this.floor);
    this.renderer.render(this.scene,this.camera);this.labelRenderer.render(this.scene,this.camera);
  }
}
