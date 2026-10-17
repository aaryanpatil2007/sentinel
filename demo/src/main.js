import { RescueSimulation } from './simulation.js';
import { LEVELS, levelLabel, SOURCES, dangerAppearance } from './building.js';
import { BuildingView } from './building-view.js';

const icons = {
  flame: '<path d="M13 3c1 5-4 6-2 10 2-1 2-2 2-3 6 5 5 11-1 11S3 15 7 10c0 3 1 4 2 4-1-5 3-6 4-11Z"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>', pause: '<path d="M8 5h3v14H8zM15 5h3v14h-3z"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  person: '<circle cx="12" cy="6" r="3"/><path d="M7 21v-5a5 5 0 0 1 10 0v5M9 14v7m6-7v7"/>',
  route: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M5 8v7a3 3 0 0 0 3 3h3m8-2V9a3 3 0 0 0-3-3h-3"/>',
  exit: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h12"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5m-18 5 9 5 9-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  arrows: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
  smoke: '<path d="M3 8c3-4 6 4 9 0s6 4 9 0M3 13c3-4 6 4 9 0s6 4 9 0M3 18c3-4 6 4 9 0s6 4 9 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.route}</svg>`;
const formatTime = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const sim = new RescueSimulation('fixed');
let speed = 4, selected = null, selectedUnit = 1, lastUi = -1;

document.querySelector('#app').innerHTML = `
  <div class="workspace">
    <aside class="scenario-panel">
      <div class="sidebar-brand"><span class="brand-mark">${icon('flame')}</span><h1>Sentinel</h1><button class="quiet-button" id="about-button" aria-label="About Sentinel" title="About Sentinel">${icon('info')}</button></div>
      <div class="building-address"><strong>Jacobs Hall, UC Berkeley</strong><span>Basement + 3 floors · rescue simulation</span></div>
      <fieldset class="mode-picker"><legend>Fire behavior</legend>
        <label class="mode-option selected"><input type="radio" name="mode" value="fixed" checked/><span class="radio-indicator"></span><span><strong>Fixed fire</strong><small>Plan around a frozen incident.</small></span><span class="mode-number">01</span></label>
        <label class="mode-option"><input type="radio" name="mode" value="spread"/><span class="radio-indicator"></span><span><strong>Spreading fire</strong><small>Watch routes adapt in real time.</small></span><span class="mode-number">02</span></label>
      </fieldset>
      <div id="mode-description" class="mode-description"></div>
      <div class="simulation-actions"><button id="start-button" class="primary-button">${icon('play')}<span>Start rescue</span></button><button id="reset-button" class="square-button" aria-label="Reset the scenario" title="Reset the scenario">${icon('reset')}</button></div>
      <button id="delay-button" class="delay-button" hidden aria-describedby="mode-description">Wait 60s · let fire spread</button>
      <div class="speed-row"><label for="speed">Simulation speed</label><select id="speed"><option value="1">1×</option><option value="4" selected>4×</option><option value="10">10×</option></select></div>
      <div id="strategy-row" class="strategy-row" hidden><label for="strategy">Rescue strategy</label><select id="strategy"><option value="urgent" selected>Sentinel · urgency first</option><option value="distance">Distance first</option></select></div>
      <div class="priority-explainer"><span class="section-icon">${icon('shield')}</span><div><strong id="strategy-title">Danger first. Distance matters.</strong><p id="strategy-explanation">Priorities balance immediate danger, two-person pickups, and safe handoffs. Crews share assignments.</p></div></div>
      <div class="scenario-bottom"><span>Illustrative demo · not emergency guidance</span><a href="https://jacobsinstitute.berkeley.edu/our-spaces-at-a-glance/" target="_blank" rel="noopener noreferrer">Building reference ↗</a></div>
    </aside>
    <main class="main-panel">
      <div class="scene-header"><div><h2>Building overview</h2><p>Choose a crew for its route. Select a floor for room labels.</p></div><div class="status-pill" id="simulation-status"><span></span>Ready to begin</div></div>
      <div class="scene-stats"><div>${icon('person')}<span><strong id="remaining-count">8</strong><small>Need assistance</small></span></div><div>${icon('shield')}<span><strong id="rescued-count">0<span> / 8</span></strong><small id="outside-label">Safely outside</small></span></div><div>${icon('flame')}<span><strong id="fire-count">4</strong><small>Burning zones</small></span></div><div>${icon('clock')}<span><strong id="elapsed">00:00</strong><small>Incident time</small></span></div></div>
      <div class="scene-wrap"><div id="scene" aria-label="Interactive Jacobs Hall building. Drag to rotate; scroll to zoom." role="group"></div>
        <div class="view-toolbar"><div class="view-tabs"><button id="perspective-button" class="active" aria-pressed="true">3D view</button><button id="top-button" aria-pressed="false">Top view</button></div><button id="shell-button" class="toolbar-button" aria-pressed="false">${icon('layers')}<span>Exterior</span></button><button id="smoke-button" class="toolbar-button active" aria-pressed="true" title="Show or hide smoke visuals">${icon('smoke')}<span>Smoke</span></button><button id="camera-button" class="toolbar-button" aria-label="Reset camera" title="Reset camera">${icon('arrows')}</button></div>
        <div class="scene-orientation">${icon('compass')}<span>N</span></div>
        <div id="selected-person" class="selected-person hidden"></div>
        <div class="floor-control"><span>Floor</span><div id="floor-buttons"><button class="active" data-floor="all" aria-pressed="true">All</button>${LEVELS.map(f=>`<button data-floor="${f}" aria-pressed="false">${f===0?'B':f}</button>`).join('')}</div></div>
        <div class="scene-hint">Floors spaced for visibility <span>·</span> Drag to rotate <span>·</span> Scroll to zoom</div>
      </div>
      <div class="map-legend"><span><i class="legend-person"></i>Firefighter</span><span class="danger-legend"><i aria-hidden="true"></i>Low → Critical</span><span><i class="legend-route"></i>Selected crew</span><span><i class="legend-escape"></i>Safe handoff</span><span><i class="legend-blocked">×</i>Blocked</span></div>
    </main>
    <aside class="guidance-panel">
      <div class="panel-heading"><span class="section-icon">${icon('route')}</span><span>Firefighter guidance</span><span id="live-dot" class="live-dot"></span></div>
      <div class="guidance-content"><div class="team-size-row"><label for="team-size">Firefighters</label><select id="team-size"><option value="1" selected>1 firefighter</option><option value="2">2 firefighters</option><option value="3">3 firefighters</option></select></div><div class="team-heading"><h3>Active crews</h3><span>Capacity 2 each</span></div><div id="team-list" class="team-list"></div><div class="assignment-label"><span>Current assignment</span><span id="unit-state">Unit 01</span></div><div class="assignment" id="assignment"></div>
      <div class="guidance-card"><div class="guidance-card-heading">${icon('compass')}<span>Next instruction</span></div><p id="instruction" aria-live="polite" aria-atomic="true"></p><div class="instruction-sub" id="instruction-sub"></div></div>
      <div class="route-summary"><span>Path updates</span><strong id="replan-count">0</strong><span class="route-summary-divider"></span><span>Blocked links</span><strong id="blocked-count">2</strong></div>
      <div class="queue-heading"><h3>Rescue priority</h3><span>Live order</span></div><div id="priority-list" class="priority-list"></div>
      <div class="events-heading"><h3>Incident log</h3><span id="event-count">1 event</span></div><div id="events" class="event-list" role="log" aria-label="Incident log"></div></div>
      <div class="guidance-footer">${icon('exit')}<span>Safe handoff → independent exit</span></div>
    </aside>
  </div>

  <dialog id="about-dialog"><button class="dialog-close square-button" aria-label="Close about dialog">×</button><span class="brand-mark">${icon('flame')}</span><h2>Sentinel</h2><p>This demo follows UC Berkeley’s published Jacobs Hall floor diagrams: basement studios 10 and 10C, metal shop and robotics lab; level 1 makerspaces 110 and 120; level 2 MDes studios 210 and 220; and level 3 studio 310, breakout rooms, and advanced prototyping. West access is via Etcheverry Plaza at level 1; east access is via LeRoy Avenue at level 2. Dimensions and circulation waypoints are approximate. The top-floor connecting door is a deliberate demo adaptation, providing a same-floor bypass around the left-side fire.</p><p><strong>Only urgent rescues:</strong> all eight occupants start in heat and smoke. No low-risk bystanders are added.</p><p><strong>Coordinated crews:</strong> choose 1–3 firefighters. Each can escort up to two people. A joint assignment search chooses non-overlapping single- and two-person jobs, balancing danger, travel, and detours. Firefighters release escorts as soon as a low-heat, low-smoke route outside is available; people then walk out independently.</p><p><strong>Building details:</strong> Berkeley’s equipment guides and interior photos informed the woodshop’s CNC bed and saws, studio 110’s orange robot arms, electronics and laser stations, MDes desks, mobile whiteboards, teaching tables, and amber printer enclosures. Furnishings and placements are selectively simplified; they share their footprints with the route planner. Bathroom fixtures and locked doors add circulation constraints. Locks and obstructions are fictional incident details. Orange footprints show the burning area; both movement and routing check the full passage with clearance around that footprint.</p><p><strong>Civilian colors:</strong> green means lower current danger, then yellow, orange, red, and dark red as danger increases. Bodies, numbered pings, and priority labels share this live scale. Escorts use their current location, so colors can improve as a firefighter takes them away from the hazard.</p><p><strong>Optimistic incident:</strong> all eight original occupants remain rescue assignments until recovered. Crews can force designated interior doors in a timed six-second action. In spreading mode, functioning sprinklers limit the middle-floor fires after 30 simulated seconds while ventilation clears protected passages. Starting promptly with Sentinel can save all eight with 1–3 firefighters. Delays and distance-first dispatch can miss rescue windows. Smoke uses faint room wisps and soft source plumes; its toolbar toggle affects visuals only.</p><p><strong>Rescue window:</strong> spreading mode forecasts which evacuation routes will close or require substantial detours within 180 seconds and prioritizes those occupants. Basement flames expand past the side-door fallbacks, and the top-floor front accelerates after 70 seconds. Sentinel prioritizes those rescue windows. Distance first uses travel cost alone with the same crew capacity, doors, and fire checks; a late response can leave rooms fully cut off. Use the strategy selector or Wait 60s to compare.</p><p><strong>Live changes:</strong> spreading fire recalculates all crew assignments each simulated second. Walking occupants also recheck their routes. If fire cuts their way off, they stop and request assistance. The fire model and priority score are illustrative, not validated emergency guidance or a globally optimal time-dependent rescue plan.</p><p><a href="${SOURCES.guide}" target="_blank" rel="noopener noreferrer">UC Berkeley floor guide</a> · <a href="${SOURCES.entrances}" target="_blank" rel="noopener noreferrer">Entrance information</a> · <a href="${SOURCES.equipment}" target="_blank" rel="noopener noreferrer">Equipment references</a> · <a href="${SOURCES.studios}" target="_blank" rel="noopener noreferrer">MDes interior photos</a></p><button class="primary-button dialog-done">Back to the simulation</button></dialog>
`;

let view;
try { view = new BuildingView(document.querySelector('#scene'), sim, id => {selected = id; renderUi(true);}); }
catch (error) {
  console.error(error);
  document.querySelector('#scene').innerHTML = '<div class="render-error"><h2>3D rendering is unavailable</h2><p>Enable hardware acceleration in your browser, then reload. The rescue controls and guidance still work.</p></div>';
}

function activeUnit(){return sim.firefighters.find(f=>f.id===selectedUnit)??sim.firefighter;}
function instruction(){
  const ff=activeUnit(),next=sim.building.nodes.get(ff.next??ff.path[0]),current=sim.building.nodes.get(ff.node);
  if(sim.phase==='cutoff')return [`${sim.rescued} saved; ${sim.cutOffPeople.length} occupants cut off by fire.`,'Reset with Sentinel urgency first to recover the closing rescue windows.'];
  if(sim.complete)return ['All endangered occupants are safely outside.','Reset to compare crew counts or fire modes.'];
  if(ff.action?.type==='force-door')return [`Force the locked door to ${ff.action.room}.`,`${Math.ceil(ff.action.remaining)} seconds remaining. Check conditions before entering.`];
  if(ff.phase==='holding')return ['Hold position. No viable assignment is available.','Other crews may still be working; guidance updates as conditions change.'];
  if(ff.phase==='withdrawing')return ['Withdraw along the clear route outside.','No reachable pickup is available to this unit. Continue to the assembly point.'];
  if(ff.phase==='standby')return ['Stand by. Released occupants are walking outside.', 'No one needs an escort from this unit right now.'];
  if(!sim.running&&sim.time===sim.responseDelay){
    const entrance=sim.routeNodes(ff).find(id=>sim.building.nodes.get(id).type==='exit');
    return [`Enter through the ${entrance==='east-exit'?'LeRoy Avenue':'Etcheverry Plaza'} entrance.`, `Unit ${ff.id}: ${ff.pickups.length} assigned pickup${ff.pickups.length===1?'':'s'}, capacity 2. ${ff.pickups.some(id=>sim.people.find(p=>p.id===id)?.room==='10C'||sim.people.find(p=>p.id===id)?.room==='ROBOT')?'Basement first. ':''}Press Start rescue.`];
  }
  const escorted=ff.carrying.length;
  if(ff.handoff&&next?.id===ff.handoff&&!ff.pickups.length)return [`Escort to ${next.label.toLowerCase()}.`,`Release ${escorted} ${escorted===1?'person':'people'} once the remaining route is clear; they can walk outside.`];
  if(next?.type==='exit')return [`Use the ${next.id==='west-exit'?'Etcheverry Plaza':'LeRoy Avenue'} entrance.`,`${escorted}/2 people with you. Follow this unit’s colored route.`];
  if(next&&next.floor!==current.floor)return [`${next.floor>current.floor?'Climb':'Descend'} the ${next.id.startsWith('w')?'west':'east'} stair to ${levelLabel(next.floor).toLowerCase()}.`,`${escorted}/2 escorted · ${ff.pickups.length} pickup${ff.pickups.length===1?'':'s'} remaining.`];
  if(['10c-side-approach','10c-side-door','10c-front-aisle'].includes(next?.id))return ['Use Studio 10C’s side entrance around the burning passage.','Follow the workshop-side detour. Force the latched side door if it is still closed.'];
  if(next?.id==='robot-side-door')return ['Use the lab’s side door to avoid the passage fire.','Follow the clear aisle past the electronics benches.'];
  if(next?.id==='apt-studio-door')return ['Use the connecting door between prototyping and studio 310.','Bypass the burning left passage along the marked route.'];
  if(next?.id.startsWith('studio-'))return ['Cross studio 310 along the clear front aisle.','Follow the marked route around the teaching tables to the next doorway.'];
  if(next?.type==='room'&&next.id!==sim.people.find(p=>p.id===ff.target)?.node)return [`Pass through ${next.label} to bypass the fire.`, 'Follow the marked bypass to the next doorway.'];
  if(next?.type==='room')return [`Enter ${next.label} and locate person ${ff.target}.`,escorted?'Collect the second person, then escort both to the safe handoff.':'Capacity available for two people.'];
  if(next?.type==='rescue')return [`Reach person ${ff.target} at the marked refuge point.`,'Their walking route closed. Resume the escort toward a clear route outside.'];
  return [`Continue through ${levelLabel(next?.floor??current.floor).toLowerCase()}.`,ff.pickups.length?`Reach ${ff.pickups.map(id=>sim.people.find(p=>p.id===id).room).join(' + ')}. ${escorted}/2 escorted.`:'Follow the green segment to a clear evacuation route.'];
}
function renderUi(force=false){
  const stamp=`${Math.floor(sim.time*2)}|${sim.running}|${sim.rescued}|${sim.walking}`;if(!force&&stamp===lastUi)return;lastUi=stamp;
  const ff=activeUnit(),target=sim.people.find(p=>p.id===(ff.target??ff.carrying[0])),cutOff=sim.cutOffPeople,cutOffIds=new Set(cutOff.map(p=>p.id));
  view?.setActiveUnit(ff.id);
  document.querySelector('#remaining-count').textContent=sim.people.filter(p=>['waiting','escorted','stranded'].includes(p.status)).length;
  document.querySelector('#rescued-count').innerHTML=`${sim.rescued}<span> / ${sim.people.length}</span>`;
  document.querySelector('#outside-label').textContent=cutOff.length?`${cutOff.length} cut off by fire`:sim.walking?`${sim.walking} walking out`:'Safely outside';
  document.querySelector('#fire-count').textContent=sim.fireCount;document.querySelector('#elapsed').textContent=formatTime(sim.time);
  document.querySelector('#replan-count').textContent=sim.replans;document.querySelector('#blocked-count').textContent=sim.blockedCount;
  const status=document.querySelector('#simulation-status');status.className=`status-pill ${sim.running?'running':''} ${sim.complete?'complete':''}`;
  status.innerHTML=`<span></span>${sim.phase==='cutoff'?`${sim.rescued} safe · ${cutOff.length} cut off`:sim.complete?'Rescue complete':sim.running?sim.mode==='spread'?'Fire spreading · rescue windows closing':'Rescue in progress':sim.time>sim.responseDelay?'Simulation paused':sim.responseDelay?'Response delayed 60s':'Ready to begin'}`;
  document.querySelector('#live-dot').classList.toggle('active',sim.running);
  document.querySelector('#start-button').innerHTML=`${icon(sim.running?'pause':'play')}<span>${sim.running?'Pause rescue':sim.finished?'Run finished':sim.time>sim.responseDelay?'Resume rescue':'Start rescue'}</span>`;
  document.querySelector('#start-button').disabled=sim.finished;
  const teamHtml=sim.firefighters.map(unit=>`<button class="crew-row ${unit.id===ff.id?'active':''}" data-unit="${unit.id}" aria-pressed="${unit.id===ff.id}" style="--unit-color:${unit.color}"><span class="crew-id">F${unit.id}</span><span><strong>Unit ${unit.id}</strong><small>${unit.pickups.length?unit.pickups.map(id=>sim.people.find(p=>p.id===id).room).join(' + '):unit.carrying.length?'Safe handoff':sim.complete?'Complete':unit.phase==='holding'?'Holding':unit.phase==='withdrawing'?'Withdraw':'Standby'}</small></span><span class="crew-capacity">${unit.carrying.length}<small>/2</small></span></button>`).join('');
  const teamList=document.querySelector('#team-list');if(teamList.innerHTML!==teamHtml)teamList.innerHTML=teamHtml;
  document.querySelector('#unit-state').textContent=`Unit ${ff.id} · ${ff.carrying.length}/2 escorted`;
  document.querySelector('#assignment').innerHTML=target?`<div class="target-icon ${ff.carrying.length?'escorting':''}">${icon(ff.carrying.length?'exit':'person')}</div><div><h2>${ff.pickups.length?target.room:'Safe handoff'}</h2><p>${ff.pickups.length?ff.pickups.map(id=>`P${id}`).join(' + '):ff.carrying.map(id=>`P${id}`).join(' + ')} <span>·</span> ${levelLabel(sim.building.nodes.get(target.node).floor)}</p></div><span class="risk-badge ${ff.pickups.length?'high':''}">${ff.pickups.length?'Urgent':'Escorting'}</span>`:`<div class="target-icon escorting">${icon('shield')}</div><div><h2>${sim.complete?'Everyone outside':ff.phase==='holding'?'Holding':'Standby'}</h2><p>${sim.walking?`${sim.walking} walking independently`:`${sim.rescued} safely outside`}</p></div>`;
  const [primary,secondary]=instruction(),instructionEl=document.querySelector('#instruction');if(instructionEl.textContent!==primary)instructionEl.textContent=primary;document.querySelector('#instruction-sub').textContent=secondary;
  const candidates=sim.candidates();
  const delayButton=document.querySelector('#delay-button');delayButton.hidden=sim.mode!=='spread';delayButton.disabled=sim.time>0||sim.running;
  document.querySelector('#strategy-row').hidden=sim.mode!=='spread';
  document.querySelector('#strategy-title').textContent=sim.strategy==='urgent'?'Closing windows first.':'Distance-first comparison';
  document.querySelector('#strategy-explanation').textContent=sim.strategy==='urgent'?'Rescue the basement and upper breakout room before fire seals their routes. Nearby rooms can wait.':'The crew chooses shorter trips. Watch distant rescue windows close while it works nearby.';
  const basement=candidates.filter(c=>sim.building.nodes.get(c.person.node).floor===0),upper=candidates.filter(c=>sim.building.nodes.get(c.person.node).floor===3);
  const window=Math.min(...basement.map(c=>c.closesIn)),upperWindow=Math.min(...upper.map(c=>c.closesIn));
  let description='Basement passages are burning. Fire stays fixed; crews use clear doorways and the upper studio bypass.';
  if(sim.mode==='spread'){
    if(sim.complete)description='All eight occupants reached safety. Switch strategies to compare the rescue order.';
    else if(sim.finished)description=`${sim.rescued}/8 saved; ${cutOff.length} cut off by growing fire. Reset with Sentinel to compare.`;
    else if(cutOff.length)description=`${cutOff.length} occupants cut off. Crews continue the reachable rescues; earlier windows were missed.`;
    else if(sim.strategy==='distance')description='Distance first chooses nearby rooms. Watch the basement and top-floor rescue windows close.';
    else if(basement.length&&Number.isFinite(window))description=`Basement first: ~${Math.ceil(window)}s until a route loss. Then recover the upper-floor breakout room.`;
    else if(upper.length&&Number.isFinite(upperWindow))description=`Upper floor next: ~${Math.ceil(upperWindow)}s until a route loss. The fire can seal the breakout room.`;
    else description='Urgent rooms recovered. Fire is still spreading through the cleared basement and upper floor.';
  }
  document.querySelector('#mode-description').textContent=description;

  document.querySelector('#priority-list').innerHTML=candidates.slice(0,4).map((c,i)=>{const risk=dangerAppearance(c.urgency);return `<button style="--danger-color:${risk.color};--danger-bg:${risk.background}" class="priority-row ${selected===c.person.id?'selected':''}" data-person="${c.person.id}"><span class="queue-number">P${c.person.id}</span><span class="queue-person"><strong>${c.person.room}</strong><small>${Number.isFinite(c.closesIn)?c.closesIn>0?`Route window ~${Math.ceil(c.closesIn)}s`:'Short route lost':levelLabel(sim.building.nodes.get(c.person.node).floor)} · ${c.unit?`Unit ${c.unit}`:'Unassigned'}</small></span><span class="queue-risk high">${cutOffIds.has(c.person.id)?'Cut off':!c.approach||!c.escape?'No route':risk.label}<small>${Math.round(c.urgency*100)}% danger</small></span></button>`;}).join('')||`<div class="queue-empty">${sim.complete?'Everyone has reached an outside assembly point.':sim.walking?'Released occupants are walking outside.':'Crews are escorting the remaining occupants.'}</div>`;
  document.querySelector('#event-count').textContent=`${sim.events.length} events`;
  document.querySelector('#events').innerHTML=sim.events.slice(0,5).map(e=>`<div class="event ${e.type}"><span class="event-dot"></span><div><p>${e.message}</p><time>${formatTime(e.time)}</time></div></div>`).join('');
  const card=document.querySelector('#selected-person');
  if(selected){
    const p=sim.people.find(p=>p.id===selected),c=candidates.find(c=>c.person.id===selected),node=sim.building.nodes.get(p.node);
    const risk=dangerAppearance(sim.urgency(p));card.style.setProperty('--danger-color',risk.color);card.style.setProperty('--danger-bg',risk.background);
    card.classList.remove('hidden');card.innerHTML=`<button id="dismiss-person" aria-label="Close person details">×</button><span class="detail-label">Occupant ${p.id} · ${risk.label} danger</span><strong>${p.room}<small>${levelLabel(node.floor)}</small></strong><p>${cutOffIds.has(p.id)?'All rescue routes to this room are blocked by growing fire. The earlier rescue window was missed.':p.status==='rescued'?'Safely outside.':p.status==='stranded'?'Trapped by changing heat. Hold position; additional assistance required.':p.status==='walking'?'Released from escort. Walking independently on a clear route outside.':p.status==='escorted'?`With unit ${p.unit}. Escorted toward safety.`:`${Math.round(sim.urgency(p)*100)}% relative danger · ${c?.unit?`Assigned to unit ${c.unit}`:'Awaiting a viable route'}`}</p>`;
  }else card.classList.add('hidden');
}

document.querySelectorAll('input[name="mode"]').forEach(radio=>radio.addEventListener('change',()=>{
  sim.reset(radio.value,sim.teamSize,radio.value==='spread'?document.querySelector('#strategy').value:'urgent'); selected=null; view&&(view.lastPath='');
  document.querySelectorAll('.mode-option').forEach(label=>label.classList.toggle('selected',label.querySelector('input').checked));
  renderUi(true);
}));
document.querySelector('#start-button').addEventListener('click',()=>{sim.running=!sim.running;renderUi(true);});
document.querySelector('#delay-button').addEventListener('click',()=>{sim.delayResponse(60);selected=null;document.querySelector('[data-floor="0"]').click();renderUi(true);});
document.querySelector('#reset-button').addEventListener('click',()=>{sim.reset();selected=null;renderUi(true);});
document.querySelector('#strategy').addEventListener('change',e=>{sim.reset(sim.mode,sim.teamSize,e.target.value);selectedUnit=1;selected=null;view&&(view.lastPath='');renderUi(true);});
document.querySelector('#team-size').addEventListener('change',e=>{sim.reset(sim.mode,Number(e.target.value));selectedUnit=1;selected=null;renderUi(true);});
document.querySelector('#team-list').addEventListener('click',e=>{const row=e.target.closest('[data-unit]');if(row){selectedUnit=Number(row.dataset.unit);renderUi(true);}});
document.querySelector('#speed').addEventListener('change',e=>{speed=Number(e.target.value);});
document.querySelector('#priority-list').addEventListener('click',e=>{const row=e.target.closest('[data-person]');if(row){selected=Number(row.dataset.person);renderUi(true);}});
document.querySelector('#selected-person').addEventListener('click',e=>{if(e.target.closest('#dismiss-person')){selected=null;renderUi(true);}});
document.querySelector('#floor-buttons').addEventListener('click',e=>{
  const button=e.target.closest('[data-floor]');if(!button)return;
  view?.setFloor(button.dataset.floor);
  document.querySelectorAll('[data-floor]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button?'true':'false');});
});
function setView(top) {
  view?.resetCamera(top);
  document.querySelector('#perspective-button').classList.toggle('active',!top);document.querySelector('#perspective-button').setAttribute('aria-pressed',String(!top));
  document.querySelector('#top-button').classList.toggle('active',top);document.querySelector('#top-button').setAttribute('aria-pressed',String(top));
}
document.querySelector('#perspective-button').addEventListener('click',()=>setView(false));
document.querySelector('#top-button').addEventListener('click',()=>setView(true));
document.querySelector('#smoke-button').addEventListener('click',e=>{const active=view?.toggleSmoke();e.currentTarget.classList.toggle('active',!!active);e.currentTarget.setAttribute('aria-pressed',String(!!active));});
document.querySelector('#camera-button').addEventListener('click',()=>setView(false));
document.querySelector('#shell-button').addEventListener('click',e=>{const active=view?.toggleShell();e.currentTarget.classList.toggle('active',!!active);e.currentTarget.setAttribute('aria-pressed',String(!!active));});
const dialog=document.querySelector('#about-dialog');document.querySelector('#about-button').addEventListener('click',()=>dialog.showModal());
dialog.querySelectorAll('.dialog-close,.dialog-done').forEach(b=>b.addEventListener('click',()=>dialog.close()));
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
renderUi(true);
let previous=performance.now(),visualTime=0;
function animate(now) {
  const dt=Math.min((now-previous)/1000,.1);previous=now;
  if(sim.running){visualTime+=dt;const step=dt*speed;for(let remaining=step;remaining>0;remaining-=.1)sim.tick(Math.min(.1,remaining));}
  view?.update(visualTime);renderUi();requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
// Read-only state for browser verification.
window.emberSnapshot=()=>({mode:sim.mode,strategy:sim.strategy,cutOff:sim.cutOffPeople.map(p=>p.id),responseDelay:sim.responseDelay,basementShortcutClosed:sim.shortcutClosed,containmentStarted:sim.containmentStarted,smokeVisible:view?.smokeVisible,time:sim.time,running:sim.running,rescued:sim.rescued,walking:sim.walking,total:sim.people.length,fires:sim.fireCount,blocked:sim.blockedCount,replans:sim.replans,phase:sim.phase,selectedUnit,firefighters:sim.firefighters.map(ff=>({id:ff.id,phase:ff.phase,action:ff.action?{...ff.action}:null,pickups:ff.pickups.slice(),carrying:ff.carrying.slice(),handoff:ff.handoff,position:sim.position(ff),route:sim.routeNodes(ff)})),people:sim.people.map(p=>({...p,position:sim.position(p),danger:sim.urgency(p)})),visibleRescued:sim.people.filter(p=>p.status==='rescued'&&view?.walkers.get(p.id)?.group.visible).length,handoffs:sim.handoffs.map(h=>({...h})),fireFronts:sim.building.fires.map(f=>({...f})),webgl:!!view});
