import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOOR_HEIGHT, LEVELS, ROOMS, UNIT_COLORS, levelLabel } from './building.js';

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
    this.materials = new Map(); this.floorGroups = []; this.shellGroups = []; this.pings = new Map(); this.fires = new Map(); this.heatTiles = new Map();
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.crewModels = new Map(); this.walkers = new Map();
    this.makeGround(); this.makeBuilding(); this.makeMarkers();
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
    for(const id of ['safe','safe-east']){
      const n=this.sim.building.nodes.get(id),y=viewY(n.y)-.4;
      const group=new THREE.Group();group.userData.floor=n.floor;this.world.add(group);this.contextObjects.push(group);
      this.box(group,[6,.12,3],[n.x,y,n.z],0xb9dace);
      this.label(group,'✓ Safe exit',[n.x,y+.9,n.z+1.6],'safe-label');
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
      for(const room of ROOMS.filter(r=>r.floor===f)){
        this.box(group,[room.w-.15,.08,room.d-.2],[room.x,y+.2,room.z],room.kind==='maker'||room.kind==='shop'?0xd0dce1:0xe5e7e0);
        // Low partitions show room boundaries; furniture would obscure rescue markers.
        if(room.d<=6){
          this.box(group,[.1,.65,room.d],[room.x-room.w/2,y+.5,room.z],0xc2cdd2);
          this.box(group,[room.w,.65,.1],[room.x,y+.5,room.z+room.d/2],0xc2cdd2);
        }
        const tile=new THREE.Mesh(new THREE.PlaneGeometry(room.w-.3,room.d-.3),new THREE.MeshBasicMaterial({color:0xed773f,transparent:true,opacity:0,depthWrite:false}));
        tile.rotation.x=-Math.PI/2;tile.position.set(room.x,y+.27,room.z);group.add(tile);this.heatTiles.set(`r${room.id}`,tile);
        const text=room.kind==='studio'||room.kind==='maker'||room.kind==='shop'?room.label:room.id;
        const label=this.label(group,text,[room.x,y+.65,room.z-1],room.d>6?'room-label':'small-room-label');
        this.roomLabels.push(label);
      }
      for(const [x,name]of [[-16,'E'],[16,'W']]){
        this.box(group,[3,.18,3.5],[x,y+.23,4],0x9dadb3);
        for(let i=0;i<13&&f<3;i++)this.box(group,[2.2,.13,.25],[x,y+.35+i*VIEW_FLOOR_HEIGHT/13,2.5+i*.25],0x586f7e);
        this.box(group,[.16,3.8,3.6],[x+(x<0?-1.4:1.4),y+2,4],0x9baab0);
        // Stair names appear with the isolated floor, keeping overview labels sparse.
        this.roomLabels.push(this.label(group,`${name} stair`,[x,y+.8,6.7],'stair-label'));
      }
      this.label(group,f===0?'B':String(f),[-20,y+1,8],'floor-label');
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
    for(const edge of this.sim.building.edges.values())if(edge.blocked){
      const a=this.sim.building.nodes.get(edge.a),b=this.sim.building.nodes.get(edge.b);
      const label=this.label(this.world,edge.type==='stairs'?'✕ Stair':'✕ Passage',[(a.x+b.x)/2,viewY((a.y+b.y)/2)+.8,(a.z+b.z)/2+1],'blocked-label');
      this.blockMarkers.push({label,floors:[a.floor,b.floor]});
    }
    for(const [text,pos,floor]of [['West entrance',[23,.9,7],1],['East entrance',[-23,VIEW_FLOOR_HEIGHT+.9,5],2]]){
      const label=this.label(this.world,text,pos,'entrance-label');label.userData.floor=floor;this.contextObjects.push(label);
    }
    this.setVisibility();
  }
  makePerson(color, helmet=false) {
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.25,.5,3,6),this.material(color));body.position.y=.58;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),this.material(helmet?0xf0be55:0xf4d3ae));head.position.y=1.2;g.add(head);
    if(helmet) {const band=this.box(g,[.57,.12,.57],[0,1.35,0],0xf0be55);band.castShadow=false;}
    const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.57,24),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;g.add(ring);
    return g;
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
      const group=this.makePerson(ff.color,true);const tag=this.label(group,`F${ff.id}`,[0,2.2,0],'unit-map-label');tag.element.style.color=ff.color;this.scene.add(group);
      const escorts=[this.makePerson(0x259a75),this.makePerson(0x259a75)];escorts.forEach(e=>{e.visible=false;this.scene.add(e);});this.crewModels.set(ff.id,{group,tag,escorts});
    }
  }
  makeFire(node) {
    const g=new THREE.Group();g.position.set(node.x,viewY(node.y),node.z);
    const tongues=[];
    for(let i=0;i<3;i++) {
      const flame=new THREE.Mesh(new THREE.ConeGeometry(.3+(i%3)*.12,1.4+(i%2)*.8,5),new THREE.MeshBasicMaterial({color:i%2?0xffbf47:0xf06932,transparent:true,opacity:.88,depthWrite:false}));
      flame.position.set(Math.sin(i*2.4)*.7,.7,Math.cos(i*2.4)*.7);flame.rotation.z=Math.sin(i)*.15;g.add(flame);tongues.push(flame);
    }
    const smoke=[];
    for(let i=0;i<2;i++) {
      const puff=new THREE.Mesh(new THREE.IcosahedronGeometry(.65+i*.12,1),new THREE.MeshBasicMaterial({color:0x687685,transparent:true,opacity:.14,depthWrite:false}));
      puff.position.set(.1,1.8+i*.4,0);g.add(puff);smoke.push(puff);
    }
    this.scene.add(g);const fire={group:g,tongues,smoke,floor:node.floor};this.fires.set(node.id,fire);return fire;
  }
  setActiveUnit(id){if(this.activeUnit!==id){this.activeUnit=id;this.lastPath='';}}
  drawRoute(){
    const ff=this.sim.firefighters.find(f=>f.id===this.activeUnit)??this.sim.firefighter;
    const route=this.sim.routeNodes(ff);
    const signature=ff.id+'|'+route.join(',')+'|'+ff.escapePath.join(',')+'|'+ff.pickups.join(',');
    if(signature===this.lastPath)return;this.lastPath=signature;
    while(this.pathGroup.children.length){const c=this.pathGroup.children[0];this.pathGroup.remove(c);c.geometry?.dispose();c.material?.dispose();}
    const make=(ids,color)=>{
      for(let i=1;i<ids.length;i++){
        const a=this.sim.building.nodes.get(ids[i-1]),b=this.sim.building.nodes.get(ids[i]);
        const curve=new THREE.LineCurve3(new THREE.Vector3(a.x,viewY(a.y)+.3,a.z),new THREE.Vector3(b.x,viewY(b.y)+.3,b.z));
        const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,1,.13,6,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthTest:false}));
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
    this.contextObjects.forEach(object=>{object.visible=this.floor===null||object.userData.floor===this.floor;});
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
      const ping=this.pings.get(p.id),n=this.sim.building.nodes.get(p.node),location=this.sim.position(p);ping.group.position.set(location.x,viewY(location.y),location.z);
      ping.group.visible=['waiting','stranded'].includes(p.status)&&this.onFloor(location.y);
      const owner=this.sim.firefighters.find(f=>f.pickups.includes(p.id));ping.el.classList.toggle('target',owner?.id===this.activeUnit);ping.el.setAttribute('aria-label',`Person ${p.id} · ${n.label} · immediate danger${owner?` · assigned to unit ${owner.id}`:''}`);
      const walker=this.walkers.get(p.id),pos=this.sim.position(p);walker.group.position.set(pos.x,viewY(pos.y),pos.z);walker.group.visible=p.status==='walking'&&this.onFloor(pos.y);walker.tag.visible=this.floor!==null;
    }
    for(const n of this.sim.building.nodes.values()){
      const tile=this.heatTiles.get(n.id);if(tile)tile.material.opacity=Math.min(.66,n.heat*.72+n.smoke*.1);
      if(n.heat>.58&&!['safe','exit'].includes(n.type)){
        const fire=this.fires.get(n.id)??this.makeFire(n);fire.group.visible=this.floor===null||fire.floor===this.floor;
        fire.tongues.forEach((t,i)=>{t.scale.y=.65+Math.sin(elapsed*7+i*2)*.2+n.heat*.35;t.position.y=t.scale.y*.8;});
        fire.smoke.forEach((p,i)=>{p.position.y=1.6+((elapsed*.5+i*.5)%2.5);p.position.x=Math.sin(i+elapsed*.3)*.7;});
      }else if(this.fires.has(n.id))this.fires.get(n.id).group.visible=false;
    }
    for(const ff of this.sim.firefighters){
      const model=this.crewModels.get(ff.id),p=this.sim.position(ff);model.group.position.set(p.x+(ff.node==='safe'?(ff.id-2)*2.4*(ff.next?1-ff.progress:1):0),viewY(p.y),p.z);model.group.visible=this.onFloor(p.y);model.tag.visible=ff.id===this.activeUnit;model.tag.element.textContent=`F${ff.id}`;model.tag.element.classList.toggle('active-unit',ff.id===this.activeUnit);
      model.escorts.forEach((e,i)=>{e.visible=ff.carrying.length>i&&model.group.visible;e.position.set(p.x+.7*(i?1:-1),viewY(p.y),p.z+.6);});
    }
    for(const m of this.pathGroup.children)m.visible=this.floor===null||m.userData.floors.includes(this.floor);
    this.renderer.render(this.scene,this.camera);this.labelRenderer.render(this.scene,this.camera);
  }
}
