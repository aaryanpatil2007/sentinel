import { SAMPLE_SCENES } from './sample-packets.js';
import { BlueprintView } from './blueprint-view.js';
import { THEMES, TURN_LABEL, cueFor, describeRoute, floorsOnRoute, formatMeters, hazardLabel, hazardsOnRoute, packetSignature, statusInfo } from './packet.js';

// Guidance view shell: picks a packet (sample scene or live engine), feeds it
// to the blueprint renderer, and keeps the HUD (cue card, steps, status) in
// sync with the walkthrough. Everything shown is a candidate for command review.

const params = new URLSearchParams(location.search);
const state = {
  source: 'sample', persona: params.get('persona') === 'civilian' ? 'civilian' : 'responder',
  sceneId: params.get('scene') ?? SAMPLE_SCENES[0]?.id,
  engineUrl: (params.get('engine') ?? 'http://localhost:8787').replace(/\/$/, ''),
  entityId: null, packet: null, lastSignature: '', pollTimer: null, lastStep: -1, entities: { responder: [], civilian: [] },
};
const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V4m0 0-6 6m6-6 6 6"/></svg>',
  stairs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h4v-4h4v-4h4V8h4V4"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4m0 0h12l-3 4 3 4H5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>',
};

document.querySelector('#app').innerHTML = `
  <div class="ar-app">
    <header class="ar-top">
      <div class="ar-brand"><span class="ar-mark"></span><strong>Sentinel</strong><span class="ar-sub">Guidance view · blueprint preview of the AR layer</span></div>
      <div class="persona-switch" role="group" aria-label="Persona">
        <button data-persona="responder" class="active" aria-pressed="true">Firefighter</button>
        <button data-persona="civilian" aria-pressed="false">Occupant</button>
      </div>
      <div class="source-switch">
        <label class="sr-only" for="scene-select">Scene</label>
        <select id="scene-select">${SAMPLE_SCENES.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}</select>
        <button id="live-toggle" aria-pressed="false">Live engine</button>
      </div>
      <div class="status-pill" id="status-pill"><span></span><em>—</em></div>
    </header>
    <div class="ar-body">
      <aside class="ar-left">
        <section class="card" id="route-card"></section>
        <section class="card live-panel" id="live-panel" hidden>
          <h3>Live engine</h3>
          <div class="row"><input id="engine-url" value="${state.engineUrl}" spellcheck="false" aria-label="Engine base URL"/><button id="connect-button" class="small">Connect</button></div>
          <div class="row"><label for="entity-select">Entity</label><select id="entity-select"></select></div>
          <div class="row buttons"><button id="seed-button" class="small">Seed demo scenario</button><button id="block-button" class="small warn">Block west stairwell</button></div>
          <p class="live-status" id="live-status">Not connected. Start the engine with <code>uvicorn sentinel_engine.api:app --port 8787</code>.</p>
        </section>
        <section class="card advisory" id="advisory-card" hidden></section>
        <section class="card scene-note" id="scene-note"></section>
      </aside>
      <main class="ar-stage">
        <div id="scene" role="img" aria-label="Blueprint-style guidance view"></div>
        <div class="stage-toolbar">
          <div class="seg"><button id="mode-walk" class="active" aria-pressed="true">Walkthrough</button><button id="mode-overview" aria-pressed="false">Overview</button></div>
          <button id="play-button" class="icon-button" aria-label="Pause">${icons.pause}</button>
          <button id="restart-button" class="icon-button" aria-label="Restart walkthrough">${icons.restart}</button>
          <select id="speed-select" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select>
        </div>
        <div class="compass" id="compass"><div class="needle"></div><span>N</span></div>
        <div class="floor-chip" id="floor-chip">—</div>
        <div class="cue-card" id="cue-card">
          <div class="cue-glyph" id="cue-glyph">${icons.arrow}</div>
          <div class="cue-text"><strong id="cue-title">—</strong><p id="cue-detail"></p><small id="cue-next"></small></div>
          <div class="cue-distance" id="cue-distance"></div>
        </div>
        <div class="progress"><div id="progress-fill"></div></div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
        <div class="stage-hint">Illustrative simulated geometry · candidate guidance · not emergency instructions</div>
      </main>
      <aside class="ar-right">
        <div class="steps-heading"><h3>Steps</h3><span id="steps-count"></span></div>
        <ol id="steps" class="steps"></ol>
        <div class="hazard-list" id="hazard-list"></div>
        <p class="disclaimer" id="disclaimer"></p>
      </aside>
    </div>
  </div>`;

const $ = s => document.querySelector(s);
let view = null;
try { view = new BlueprintView($('#scene')); }
catch (error) { console.error(error); $('#scene').innerHTML = '<div class="render-error"><h2>3D rendering is unavailable</h2><p>Enable hardware acceleration, then reload. The step list still works.</p></div>'; }

let toastTimer = null;
function toast(text, tone = '') { const el = $('#toast'); el.textContent = text; el.className = `toast show ${tone}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200); }

// ------------------------------------------------------------------ static HUD
function renderStatic() {
  const p = state.packet, theme = THEMES[state.persona];
  document.body.dataset.persona = state.persona;
  const st = statusInfo(p); const pill = $('#status-pill'); pill.dataset.tone = st.tone; pill.querySelector('em').textContent = `${st.label}${state.source === 'live' ? ' · live' : ' · sample'}`;
  const hazards = hazardsOnRoute(p), floors = floorsOnRoute(p).map(f => f.floor_id).join(' → ') || '—';
  $('#route-card').innerHTML = `
    <div class="card-kicker">${theme.badge} · ${p?.entity?.entity_id ?? '—'}</div>
    <h2>${describeRoute(p)}</h2>
    <dl>
      <div><dt>Route</dt><dd>${p?.route_id ?? '—'}</dd></div>
      <div><dt>Status</dt><dd class="tone-${st.tone}">${p?.status?.replace(/_/g, ' ') ?? '—'}</dd></div>
      <div><dt>Distance</dt><dd>${p?.total_distance_m ? formatMeters(p.total_distance_m) : '—'}</dd></div>
      <div><dt>Weighted cost</dt><dd>${p?.total_cost ? p.total_cost.toFixed(1) : '—'}</dd></div>
      <div><dt>Floors</dt><dd>${floors}</dd></div>
      <div><dt>Destination</dt><dd>${p?.destination ? `${theme.destinationWord.toLowerCase()} · ${p.destination.label}` : '—'}</dd></div>
      <div><dt>Hazards on route</dt><dd class="${hazards.length ? 'tone-red' : ''}">${hazards.length || 'none'}</dd></div>
    </dl>
    ${p?.unreachable_reason ? `<p class="unreachable">${p.unreachable_reason}</p>` : ''}
    ${p?.progress?.skipped_steps ? `<p class="note">Snapped to the responder's reported position; ${p.progress.skipped_steps} earlier step(s) hidden.</p>` : ''}
    ${p?.assumptions?.length ? `<ul class="assumptions">${p.assumptions.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}`;
  const adv = $('#advisory-card');
  if (state.persona === 'civilian' && p?.message) { adv.hidden = false; adv.innerHTML = `<div class="card-kicker">Draft advisory · pending command approval</div><p>${p.message}</p>${p.responder_en_route ? '<p class="note">A responder route to this occupant exists.</p>' : ''}`; }
  else adv.hidden = true;
  const scene = SAMPLE_SCENES.find(s => s.id === state.sceneId);
  $('#scene-note').innerHTML = state.source === 'sample' && scene ? `<div class="card-kicker">Sample scene</div><p>${scene.subtitle}</p><p class="note">Sample packets are exported from the engine's demo scenario by <code>python -m sentinel_engine.export_guidance</code>.</p>` : `<div class="card-kicker">Live</div><p>Polling <code>${state.engineUrl}/guidance/${state.persona}/${state.entityId ?? '…'}</code> every 2 s. Route changes redraw automatically.</p>`;
  $('#steps').innerHTML = (p?.steps ?? []).map((s, i) => `<li data-step="${i}"><span class="n">${i + 1}</span><div><strong>${TURN_LABEL[s.turn] ?? s.turn}</strong><p>${s.instruction}</p></div><span class="chip">${s.floor_id}</span></li>`).join('') || `<li class="empty">${p?.status === 'no_active_route' ? 'No route has been computed for this entity yet.' : p?.status === 'unreachable' ? 'No traversable path with the current hazards.' : p?.status === 'no_location' ? 'Location unresolved — needs contact.' : 'No steps.'}</li>`;
  $('#steps-count').textContent = p?.steps?.length ? `${p.steps.length} · ${formatMeters(p.total_distance_m)}` : '';
  $('#hazard-list').innerHTML = (p?.hazards ?? []).length ? `<h3>Hazards in state</h3>${p.hazards.map(h => `<div class="hz hz-${h.hazard_type} ${h.on_route ? 'on-route' : ''}"><span class="dot"></span><div><strong>${hazardLabel(h)}</strong><small>${h.label} · ${h.floor_id}</small></div></div>`).join('')}` : '';
  $('#disclaimer').textContent = p?.disclaimer ?? '';
  $('#cue-card').hidden = !(p?.steps?.length);
  state.lastStep = -1;
}

// ------------------------------------------------------------------ per-frame HUD
function renderFrame(info) {
  const p = state.packet, theme = THEMES[state.persona];
  if (info.stepIndex !== state.lastStep) {
    state.lastStep = info.stepIndex;
    document.querySelectorAll('#steps li[data-step]').forEach(li => { const i = Number(li.dataset.step); li.classList.toggle('current', i === info.stepIndex); li.classList.toggle('done', i < info.stepIndex); });
    document.querySelector('#steps li.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const step = info.step, next = p.steps[info.stepIndex + 1];
  if (info.arrived) {
    $('#cue-glyph').innerHTML = icons.flag; $('#cue-glyph').style.transform = ''; $('#cue-title').textContent = `Arrived · ${theme.destinationWord.toLowerCase()}`;
    $('#cue-detail').textContent = p.destination?.label ?? ''; $('#cue-next').textContent = state.persona === 'responder' ? 'Confirm contact and report to command.' : 'Move to the assembly point and wait for responders.'; $('#cue-distance').textContent = '';
  } else if (step) {
    const cue = cueFor(step, theme, { remaining: info.distanceToNext });
    const stairs = step.turn === 'up' || step.turn === 'down';
    $('#cue-glyph').innerHTML = stairs ? icons.stairs : icons.arrow; $('#cue-glyph').style.transform = stairs ? (step.turn === 'down' ? 'scaleY(-1)' : '') : `rotate(${cue.rotation}deg)`;
    $('#cue-title').textContent = cue.title; $('#cue-detail').textContent = cue.detail;
    $('#cue-next').textContent = next ? `Then ${(TURN_LABEL[next.turn] ?? next.turn).toLowerCase()} · ${next.to_label}` : '';
    $('#cue-distance').textContent = formatMeters(info.distanceToNext);
  }
  $('#progress-fill').style.width = `${info.total ? (info.progress / info.total) * 100 : 0}%`;
  $('#floor-chip').textContent = info.floorId ?? '—';
  $('#compass .needle').style.transform = `rotate(${-info.heading}deg)`;
  const play = $('#play-button'); play.innerHTML = info.playing ? icons.pause : icons.play; play.setAttribute('aria-label', info.playing ? 'Pause' : 'Play');
}
if (view) view.onFrame = renderFrame;

// ------------------------------------------------------------------ loading
function loadPacket(packet, { announce } = {}) {
  state.packet = packet; state.lastSignature = packetSignature(packet);
  view?.load(packet); renderStatic();
  if (announce) toast(announce, 'info');
}
function loadScene(id) {
  const scene = SAMPLE_SCENES.find(s => s.id === id) ?? SAMPLE_SCENES[0]; if (!scene) return;
  state.sceneId = scene.id; state.persona = scene.persona; syncPersonaButtons(); $('#scene-select').value = scene.id;
  loadPacket(scene.packet);
}
function syncPersonaButtons() { document.querySelectorAll('[data-persona]').forEach(b => { const on = b.dataset.persona === state.persona; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }); }

// ------------------------------------------------------------------ live engine
async function api(path, options = {}) {
  const res = await fetch(`${state.engineUrl}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}`);
  return res.json();
}
async function refreshEntities() {
  const [responders, civilians] = await Promise.all([api('/responders'), api('/civilians')]);
  state.entities = { responder: responders.map(r => r.entity_id), civilian: civilians.map(c => c.entity_id) };
  const ids = state.entities[state.persona];
  if (!ids.includes(state.entityId)) state.entityId = ids[0] ?? null;
  $('#entity-select').innerHTML = ids.map(id => `<option value="${id}" ${id === state.entityId ? 'selected' : ''}>${id}</option>`).join('') || '<option value="">(none)</option>';
}
async function pollPacket({ announce = true } = {}) {
  if (state.source !== 'live' || !state.entityId) return;
  try {
    const packet = await api(`/guidance/${state.persona}/${state.entityId}`);
    const sig = packetSignature(packet);
    if (sig !== state.lastSignature) loadPacket(packet, { announce: announce && state.packet ? (packet.status === 'candidate' ? 'Route updated from engine state' : `Route status: ${packet.status.replace(/_/g, ' ')}`) : undefined });
    $('#live-status').textContent = `Connected · ${state.engineUrl} · last poll ${new Date().toLocaleTimeString()}`;
  } catch (error) { $('#live-status').textContent = `Poll failed: ${error.message}`; }
}
async function connect() {
  state.engineUrl = $('#engine-url').value.trim().replace(/\/$/, '');
  try {
    const health = await api('/health');
    state.source = 'live'; $('#live-toggle').classList.add('active'); $('#live-toggle').setAttribute('aria-pressed', 'true'); $('#live-panel').hidden = false; $('#scene-select').disabled = true;
    $('#live-status').textContent = `Connected · building ${health.building_id} · surrogate ${health.surrogate_loaded ? 'loaded' : 'absent'}`;
    await refreshEntities(); state.lastSignature = ''; await pollPacket({ announce: false });
    if (!state.packet || state.source !== 'live') renderStatic();
    clearInterval(state.pollTimer); state.pollTimer = setInterval(pollPacket, 2000);
    toast('Live engine connected', 'ok');
  } catch (error) { $('#live-status').textContent = `Cannot reach ${state.engineUrl}: ${error.message}. Is the engine running with CORS open?`; toast('Engine unreachable', 'warn'); }
}
function disconnect() {
  clearInterval(state.pollTimer); state.pollTimer = null; state.source = 'sample';
  $('#live-toggle').classList.remove('active'); $('#live-toggle').setAttribute('aria-pressed', 'false'); $('#live-panel').hidden = true; $('#scene-select').disabled = false;
  loadScene(state.sceneId);
}

// ------------------------------------------------------------------ wiring
document.querySelectorAll('[data-persona]').forEach(b => b.addEventListener('click', async () => {
  state.persona = b.dataset.persona; syncPersonaButtons();
  if (state.source === 'live') { await refreshEntities(); state.lastSignature = ''; await pollPacket({ announce: false }); renderStatic(); }
  else { const moment = state.sceneId?.includes('reroute') ? 'reroute' : 'initial'; loadScene(`${state.persona}-${moment}`); }
}));
$('#scene-select').addEventListener('change', e => loadScene(e.target.value));
$('#live-toggle').addEventListener('click', () => { if (state.source === 'live') disconnect(); else { $('#live-panel').hidden = false; connect(); } });
$('#connect-button').addEventListener('click', connect);
$('#entity-select').addEventListener('change', async e => { state.entityId = e.target.value; state.lastSignature = ''; await pollPacket({ announce: false }); renderStatic(); });
$('#seed-button').addEventListener('click', async () => {
  try { const r = await api('/demo/scenario', { method: 'POST', body: JSON.stringify({ block_west_stairwell: false }) }); toast(`Scenario seeded · ${r.route_id} ${r.route_status}`, 'ok'); await refreshEntities(); state.lastSignature = ''; await pollPacket({ announce: false }); renderStatic(); }
  catch (error) { toast(error.message, 'warn'); }
});
$('#block-button').addEventListener('click', async () => {
  try { await api('/hazards', { method: 'POST', body: JSON.stringify({ hazard_type: 'blocked', text: 'west stairwell', default_floor: 'F2', verified: true, source: 'responder_report', description: 'radio report: west stairwell blocked' }) }); toast('Hazard recorded · west stairwell blocked', 'warn'); await pollPacket(); }
  catch (error) { toast(error.message, 'warn'); }
});
function setMode(mode) { view?.setMode(mode); $('#mode-walk').classList.toggle('active', mode === 'walk'); $('#mode-walk').setAttribute('aria-pressed', String(mode === 'walk')); $('#mode-overview').classList.toggle('active', mode === 'overview'); $('#mode-overview').setAttribute('aria-pressed', String(mode === 'overview')); }
$('#mode-walk').addEventListener('click', () => setMode('walk'));
$('#mode-overview').addEventListener('click', () => setMode('overview'));
$('#play-button').addEventListener('click', () => { if (!view) return; if (view.progress >= view.total) view.restart(); else view.setPlaying(!view.playing); });
$('#restart-button').addEventListener('click', () => view?.restart());
$('#speed-select').addEventListener('change', e => { if (view) view.speed = Number(e.target.value); });
$('#steps').addEventListener('click', e => { const li = e.target.closest('li[data-step]'); if (!li || !view) return; const step = state.packet.steps[Number(li.dataset.step)]; view.setProgress(step.start_at_m); view.setPlaying(true); });
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('#play-button').click(); }
  if (e.key === '1') setMode('walk'); if (e.key === '2') setMode('overview'); if (e.key.toLowerCase() === 'r') view?.restart();
});

loadScene(state.sceneId);
// Deep links: ?scene=…&mode=overview&at=<metres along the route>&paused=1&live=1&engine=<url>
if (params.get('mode') === 'overview') setMode('overview');
const startAt = Number(params.get('at'));
if (view && Number.isFinite(startAt) && startAt > 0) view.setProgress(startAt);
if (view && params.get('paused') === '1') view.setPlaying(false);
if (params.get('live') === '1') connect();
