import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOOR_HEIGHT, LEVELS, ROOMS, UNIT_COLORS, levelLabel } from './building.js';

const colors = { slab: 0xe4ded0, wall: 0xf1e9db, metal: 0x576b78, room: 0xe7edf0, glass: 0x8eaebe, route: 0x147f9a };
export class BuildingView {
  constructor(container, simulation, onSelect) {
    this.container = container; this.sim = simulation; this.onSelect = onSelect; this.floor = null; this.shell = false; this.fitScale = 1;
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
    this.box(this.world,[73,.35,53],[0,-5.45,3],0xdce4e9);
    const grid=new THREE.GridHelper(90,45,0xc8d5de,0xd5e0e8);grid.position.y=-5.2;this.scene.add(grid);
    this.box(this.world,[13,.4,32],[24,-.35,1],0xe1e2d9);
    this.box(this.world,[12,.4,32],[-24,4.1,1],0xd7dfe1);
    this.box(this.world,[64,.16,7],[0,-.3,22],0xb5c3ce);
    this.label(this.world,'Ridge Road',[0,.2,24],'street-label');
    this.label(this.world,'Etcheverry Plaza',[25,.2,-5],'street-label');
    this.label(this.world,'LeRoy Avenue',[-25,4.8,-5],'street-label');
    for(const [x,y,z]of [[24,0,16],[-25,4.5,15]]){
      this.box(this.world,[7,.1,4],[x,y,z],0xa9cfbd);
      this.label(this.world,'✓ Outside assembly',[x,y+.7,z+2],'safe-label');
    }
    for(const [x,y,z]of [[28,0,-10],[-28,4.5,-10],[29,0,10]]){
      this.box(this.world,[.35,2,.35],[x,y+.7,z],0x8d8272);
      const tree=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6,1),this.material(0x8ba79a));tree.position.set(x,y+2.7,z);tree.castShadow=true;this.world.add(tree);
    }
    this.box(this.world,[7,1.6,2.5],[13,.6,22],0xc95948);
    this.box(this.world,[2,1.8,2.5],[8.5,.7,22],0xeff0eb);
    this.box(this.world,[1.4,.7,2.55],[8.5,1.1,22],0x688899);
    this.box(this.world,[4.8,.15,1.3],[13,1.6,22],0xbcc7cf);
    this.label(this.world,'Basement shown in cutaway',[0,-4.7,13],'entrance-label');
  }
  makeBuilding() {
    for(const f of LEVELS){
      const y=(f-1)*FLOOR_HEIGHT,group=new THREE.Group();group.userData.floor=f;this.world.add(group);this.floorGroups.push(group);
      this.box(group,[35,.28,18],[0,y,-.4],0xd8dcdb);
      this.box(group,[23,.28,5],[0,y,8.2],0xd8dcdb);
      this.box(group,[32,.06,2.2],[0,y+.19,3],0xc7d8d6);
      this.box(group,[34,3.7,.2],[0,y+2,-9.3],0xd5dbda);
      for(const x of [-14,-10,-6,-2,2,6,10,14]){
        this.box(group,[3.7,2.7,.12],[x,y+2.1,-9.15],0x99b7c3,{metalness:.15,roughness:.3});
        this.box(group,[.1,2.8,.15],[x,y+2.1,-9.03],0x6d818e);
      }
      for(const room of ROOMS.filter(r=>r.floor===f)){
        this.box(group,[room.w-.15,.08,room.d-.2],[room.x,y+.2,room.z],room.kind==='maker'||room.kind==='shop'?0xd0dce1:0xe5e7e0);
        if(room.kind==='studio'||room.kind==='maker'){
          for(let x=room.x-room.w/2+2;x<room.x+room.w/2-1;x+=3.4)for(const z of [-6,-2]){
            this.box(group,[2.3,.16,1.2],[x,y+.95,z],0xb6a286);
            for(const dx of [-.8,.8])this.box(group,[.08,.75,.08],[x+dx,y+.5,z],0x73858c);
            this.box(group,[.5,.45,.5],[x,y+.45,z+1.1],0x8c9ca7);
            if(room.kind==='maker')this.box(group,[.65,.65,.65],[x,y+1.35,z],0x6d8290);
          }
        }else{
          this.box(group,[Math.min(room.w-1,3),.2,1.3],[room.x,y+.95,room.z],0xb9a78c);
          if(room.kind==='lab'||room.kind==='shop')this.box(group,[.8,.9,.8],[room.x,y+1.5,room.z],0x829eaa);
          this.box(group,[.13,1,room.d],[room.x-room.w/2,y+.7,room.z],0xe6e5dc);
          this.box(group,[room.w,1,.13],[room.x,y+.7,room.z+room.d/2],0xe6e5dc);
        }
        const tile=new THREE.Mesh(new THREE.PlaneGeometry(room.w-.3,room.d-.3),new THREE.MeshBasicMaterial({color:0xed773f,transparent:true,opacity:0,depthWrite:false}));
        tile.rotation.x=-Math.PI/2;tile.position.set(room.x,y+.27,room.z);group.add(tile);this.heatTiles.set(`r${room.id}`,tile);
        const text=room.kind==='studio'||room.kind==='maker'||room.kind==='shop'?room.label:room.id;
        this.label(group,text,[room.x,y+.65,room.z-1],room.d>6?'room-label':'small-room-label');
      }
      for(const [x,name]of [[-16,'E'],[16,'W']]){
        this.box(group,[3,.18,3.5],[x,y+.23,4],0x9dadb3);
        for(let i=0;i<13&&f<3;i++)this.box(group,[2.2,.13,.25],[x,y+.35+i*FLOOR_HEIGHT/13,2.5+i*.25],0x586f7e);
        this.box(group,[.16,3.8,3.6],[x+(x<0?-1.4:1.4),y+2,4],0x9baab0);
        this.label(group,name,[x,y+.8,6.7],'stair-label');
      }
      this.label(group,f===0?'B':String(f),[-20,y+1,8],'floor-label');
      const shell=new THREE.Group();group.add(shell);this.shellGroups.push(shell);
      this.box(shell,[35,3.8,.25],[0,y+2,6],0xa2afb3);
      for(const x of [-13,-8,-3,2,7,12])this.box(shell,[4.6,2.9,.16],[x,y+2.1,6.16],0x8aafbe,{metalness:.3,roughness:.22});
      this.box(shell,[.25,3.8,17],[-17.4,y+2,-.5],0x6b7e89);
      this.box(shell,[.25,3.8,17],[17.4,y+2,-.5],0x6b7e89);
    }
    this.roof=new THREE.Group();this.world.add(this.roof);
    const top=3*FLOOR_HEIGHT;
    this.box(this.roof,[36,.35,19],[0,top,-.5],0xc5cdd0);
    for(const x of [-12,-6,0,6,12])for(const z of [-6,-1,4])this.box(this.roof,[5.5,.12,4.5],[x,top+.6,z],0x3f6075,{metalness:.4,roughness:.25});
    this.label(this.roof,'Jacobs Hall',[0,top+1.1,7],'building-label');
    this.blockMarkers=[];
    for(const edge of this.sim.building.edges.values())if(edge.blocked){
      const a=this.sim.building.nodes.get(edge.a),b=this.sim.building.nodes.get(edge.b);
      const label=this.label(this.world,edge.type==='stairs'?'✕ West stair blocked':'✕ Passage blocked',[(a.x+b.x)/2,(a.y+b.y)/2+.8,(a.z+b.z)/2+1],'blocked-label');
      this.blockMarkers.push({label,floors:[a.floor,b.floor]});
    }
    this.label(this.world,'West entrance · level 1',[23,.8,7],'entrance-label');
    this.label(this.world,'East entrance · level 2',[-23,5.3,5],'entrance-label');
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
      const n=this.sim.building.nodes.get(person.node),g=this.makePerson(0xd9784d);g.position.set(n.x,n.y,n.z);this.scene.add(g);
      const el=document.createElement('button');el.type='button';el.className='person-ping urgent';el.title=`Person ${person.id} · ${n.label}`;el.setAttribute('aria-label',el.title);
      el.innerHTML=`<span class="ping-dot"></span>${person.id}<span class="ping-room">${person.room}</span>`;el.addEventListener('click',()=>this.onSelect(person.id));
      const label=new CSS2DObject(el);label.position.set(0,2,0);g.add(label);this.pings.set(person.id,{group:g,label,el});
      const walker=this.makePerson(0x259a75);const tag=this.label(walker,`P${person.id} · walking`,[0,1.8,0],'walking-label');walker.visible=false;this.scene.add(walker);this.walkers.set(person.id,{group:walker,tag});
    }
  }
  syncCrews(){
    for(const [id,model]of this.crewModels){if(!this.sim.firefighters.some(f=>f.id===id)){model.tag.element.remove();this.scene.remove(model.group);model.escorts.forEach(e=>this.scene.remove(e));this.crewModels.delete(id);}}
    for(const ff of this.sim.firefighters)if(!this.crewModels.has(ff.id)){
      const group=this.makePerson(ff.color,true);const tag=this.label(group,`F${ff.id} · 0/2`,[0,2.2,0],'unit-map-label');tag.element.style.color=ff.color;this.scene.add(group);
      const escorts=[this.makePerson(0x259a75),this.makePerson(0x259a75)];escorts.forEach(e=>{e.visible=false;this.scene.add(e);});this.crewModels.set(ff.id,{group,tag,escorts});
    }
  }
  makeFire(node) {
    const g=new THREE.Group();g.position.set(node.x,node.y,node.z);
    const tongues=[];
    for(let i=0;i<7;i++) {
      const flame=new THREE.Mesh(new THREE.ConeGeometry(.3+(i%3)*.12,1.4+(i%2)*.8,5),new THREE.MeshBasicMaterial({color:i%2?0xffbf47:0xf06932,transparent:true,opacity:.88,depthWrite:false}));
      flame.position.set(Math.sin(i*2.4)*.7,.7,Math.cos(i*2.4)*.7);flame.rotation.z=Math.sin(i)*.15;g.add(flame);tongues.push(flame);
    }
    const smoke=[];
    for(let i=0;i<4;i++) {
      const puff=new THREE.Mesh(new THREE.IcosahedronGeometry(.65+i*.12,1),new THREE.MeshBasicMaterial({color:0x687685,transparent:true,opacity:.14,depthWrite:false}));
      puff.position.set(.1,1.8+i*.4,0);g.add(puff);smoke.push(puff);
    }
    this.scene.add(g);const fire={group:g,tongues,smoke,floor:node.floor};this.fires.set(node.id,fire);return fire;
  }
  drawRoute(){
    const signature=this.sim.firefighters.map(ff=>this.sim.routeNodes(ff).join(',')+'|'+ff.escapePath.join(',')+'|'+ff.carrying.length).join(';');
    if(signature===this.lastPath)return;this.lastPath=signature;
    while(this.pathGroup.children.length){const c=this.pathGroup.children[0];this.pathGroup.remove(c);c.geometry?.dispose();c.material?.dispose();}
    const make=(ids,color,radius,opacity)=>{
      if(ids.length<2)return;
      for(let i=1;i<ids.length;i++){
        const a=this.sim.building.nodes.get(ids[i-1]),b=this.sim.building.nodes.get(ids[i]);
        const curve=new THREE.LineCurve3(new THREE.Vector3(a.x,a.y+.3,a.z),new THREE.Vector3(b.x,b.y+.3,b.z));
        const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,1,radius,6,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false}));
        mesh.renderOrder=10;mesh.userData.floors=[a.floor,b.floor];this.pathGroup.add(mesh);
      }
    };
    for(const ff of this.sim.firefighters){make(ff.escapePath,0x32a07c,.065,.4);make(this.sim.routeNodes(ff),ff.carrying.length&&!ff.pickups.length?0x168c73:ff.color,.11,.95);}
  }
  setVisibility(){
    this.floorGroups.forEach(g=>{g.visible=this.floor===null||g.userData.floor===this.floor;});
    this.shellGroups.forEach(g=>{g.visible=this.shell;});this.roof.visible=this.shell&&this.floor===null;
    for(const {label,floors}of this.blockMarkers)label.visible=this.floor===null||floors.includes(this.floor);
  }
  setFloor(floor){this.floor=floor==='all'?null:Number(floor);this.setVisibility();this.resetCamera(this.topView);}
  toggleShell(){this.shell=!this.shell;this.setVisibility();return this.shell;}
  resetCamera(top=false){
    this.topView=top;const y=this.floor===null?3:(this.floor-1)*FLOOR_HEIGHT;
    this.camera.position.set(top?0:43,top?y+68:y+29,top?.01:53);this.controls.target.set(0,y,0);
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
      const ping=this.pings.get(p.id),n=this.sim.building.nodes.get(p.node),location=this.sim.position(p);ping.group.position.set(location.x,location.y,location.z);
      ping.group.visible=['waiting','stranded'].includes(p.status)&&this.onFloor(location.y);
      const owner=this.sim.firefighters.find(f=>f.pickups.includes(p.id));ping.el.classList.toggle('target',!!owner);ping.el.setAttribute('aria-label',`Person ${p.id} · ${n.label} · immediate danger${owner?` · assigned to unit ${owner.id}`:''}`);
      const walker=this.walkers.get(p.id),pos=this.sim.position(p);walker.group.position.set(pos.x,pos.y,pos.z);walker.group.visible=p.status==='walking'&&this.onFloor(pos.y);
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
      const model=this.crewModels.get(ff.id),p=this.sim.position(ff);model.group.position.set(p.x+(ff.node==='safe'?(ff.id-2)*.7:0),p.y,p.z);model.group.visible=this.onFloor(p.y);model.tag.element.textContent=`F${ff.id} · ${ff.carrying.length}/2`;
      model.escorts.forEach((e,i)=>{e.visible=ff.carrying.length>i&&model.group.visible;e.position.set(p.x+.7*(i?1:-1),p.y,p.z+.6);});
    }
    for(const m of this.pathGroup.children)m.visible=this.floor===null||m.userData.floors.includes(this.floor);
    this.renderer.render(this.scene,this.camera);this.labelRenderer.render(this.scene,this.camera);
  }
}
