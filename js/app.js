import { saveSwing, getSwing, listSwings, deleteSwing } from './db.js';
import { startCamera, flipCamera, cameraOn, startRecording, stopRecording, isRecording, grabFrame, stopCamera, getMotion, findSwingWindow } from './record.js';
import { trackPose, findPhases } from './analyze.js';
import { gradeSwing, gradeColor } from './grade.js';
import { Overlay } from './draw.js';
import { DRILLS, FAULTS, suggest, videoUrl, shortsUrl } from './drills.js';
import * as coach from './coach.js';
import { Listener, speak, stopSpeaking, voiceSupported } from './voice.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let current = null, currentUrl = null;

/* ---------- tabs ---------- */
function showTab(name) {
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $('#title').textContent = { record: 'Record', swings: 'Swings', drills: 'Drills', coach: 'AI Coach' }[name];
  if (name !== 'record' && cameraOn() && !isRecording()) camOff();
  $('#selectBtn').classList.toggle('hidden', name !== 'swings' || !!current);
  if (name !== 'swings') setSelect(false);
  if (name === 'swings' && !current) renderList();
  if (name === 'drills') renderDrills();
  if (name === 'coach') renderCoachCtx();
}
$$('.tabbar button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- settings ---------- */
const dlg = $('#settings');
$('#settingsBtn').onclick = () => {
  $('#apiKey').value = localStorage.getItem('apiKey') || '';
  $('#coachName').value = localStorage.getItem('coachName') || '';
  $('#hand').value = localStorage.getItem('hand') || 'R';
  $('#speakReplies').checked = localStorage.getItem('speak') !== '0';
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  localStorage.setItem('apiKey', $('#apiKey').value.trim());
  localStorage.setItem('coachName', $('#coachName').value.trim());
  localStorage.setItem('hand', $('#hand').value);
  localStorage.setItem('speak', $('#speakReplies').checked ? '1' : '0');
});

/* ---------- record ---------- */
const cam = $('#cam'), recBtn = $('#recBtn');
const CLUBS = ['Driver', '3 Wood', 'Hybrid', '5 Iron', '7 Iron', '9 Iron', 'Wedge', 'Putter'];
function renderClubs() {
  $('#clubPills').innerHTML = CLUBS.map(c => `<button class="pill ${c === $('#clubSel').value ? 'active' : ''}">${c}</button>`).join('');
  $$('#clubPills .pill').forEach(b => b.onclick = () => { $('#clubSel').value = b.textContent; renderClubs(); });
}
renderClubs();
function setView(v) {
  $('#viewSel').value = v; localStorage.setItem('view', v);
  $$('#viewSeg button').forEach(x => x.classList.toggle('active', x.dataset.v === v));
}
$$('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.v));
setView(localStorage.getItem('view') || 'face');
$('#tipsBtn').onclick = () => {
  $('#tipAngle').textContent = $('#viewSel').value === 'dtl'
    ? 'Down-the-line: camera behind your hands, pointing along your target line at the target. Best for plane, club path and posture.'
    : 'Face-on: camera straight across from your chest, centered on your stance. Best for sway, turn and weight shift.';
  $('#tips').showModal(); $('#tips').scrollTop = 0; document.activeElement?.blur();
};
function setRecUI(on) { recBtn.classList.toggle('on', on); recBtn.textContent = on ? 'Stop recording' : 'Start recording'; $('#recDot').classList.toggle('hidden', !on); }
async function ensureCam() {
  if (cameraOn()) return true;
  try { await startCamera(cam); $('.cam-wrap').classList.add('live'); $('#recHint').textContent = 'Phone at hip height, whole body and club in the outline.'; return true; }
  catch (e) { $('#recHint').textContent = 'Camera blocked: ' + e.message; return false; }
}
function camOff() { stopCamera(); $('.cam-wrap').classList.remove('live'); $('#previewBtn').classList.remove('on'); $('#previewBtn').textContent = 'Preview angle'; }
$('.cam-wrap').onclick = async () => { if (await ensureCam()) { $('#previewBtn').classList.add('on'); $('#previewBtn').textContent = 'Stop preview'; } };
$('#previewBtn').onclick = async () => {
  if (cameraOn()) { if (!isRecording()) camOff(); return; }
  if (await ensureCam()) { $('#previewBtn').classList.add('on'); $('#previewBtn').textContent = 'Stop preview'; }
};
$('#flipBtn').onclick = () => flipCamera(cam);

const REC_SECONDS = 15;
async function countdown(n = 5, say = false) {
  const el = $('#countdown'); el.classList.remove('hidden');
  for (let i = n; i > 0; i--) { el.textContent = i; if (say) speak(String(i)); await new Promise(r => setTimeout(r, 1000)); }
  el.classList.add('hidden');
}
let coachRec = false; // recording was started by talking to the AI coach
async function beginRec(say = false) {
  if (isRecording() || !(await ensureCam())) return false;
  await countdown(5, say);
  startRecording(); setRecUI(true);
  if (say) speak('Go');
  $('#recHint').textContent = `Recording ${REC_SECONDS}s. Take your time and hit when ready, I'll trim it to the swing.`;
  clearTimeout(beginRec.t); beginRec.t = setTimeout(endRec, REC_SECONDS * 1000);
  return true;
}
async function endRec() {
  if (!isRecording()) return;
  clearTimeout(beginRec.t);
  const blob = await stopRecording();
  setRecUI(false);
  if (!blob?.size) { $('#recHint').textContent = 'Recording came out empty — try again.'; return; }
  const motion = getMotion().slice(), recDur = motion.length ? motion[motion.length - 1].t : 0;
  const swing = { id: Date.now().toString(36), date: Date.now(), blob, club: $('#clubSel').value, view: $('#viewSel').value, shapes: [], notes: '',
    trim: findSwingWindow(motion, recDur) };
  await saveSwing(swing);
  $('#recHint').textContent = swing.trim ? 'Trimmed to your swing and saved.' : 'Saved (couldn\u2019t spot the swing, showing the full clip).';
  if (coachRec) { coachRec = false; await coachReview(swing.id); return; }
  if (recVoice?.want) { speak('Got it. Saved.'); $('#recHint').textContent = 'Saved. Say “record” for another, or “analyze”.'; }
  else { showTab('swings'); openSwing(swing.id, true); }
}
recBtn.onclick = () => isRecording() ? endRec() : beginRec();

// voice commands while recording ("record", "stop", "analyze")
let recVoice = null;
$('#voiceRecBtn').onclick = async () => {
  if (!voiceSupported) return alert('Voice not supported here. Use Safari on iPhone.');
  if (recVoice?.want) { recVoice.stop(); $('#voiceRecBtn').classList.remove('on'); return; }
  await ensureCam();
  recVoice = new Listener({
    onFinal: async t => {
      t = t.toLowerCase();
      if (/\b(record|start|go|action)\b/.test(t)) beginRec();
      else if (/\b(stop|cut|done|end)\b/.test(t)) endRec();
      else if (/\banaly[sz]e\b/.test(t)) { recVoice.stop(); $('#voiceRecBtn').classList.remove('on'); const [s] = await listSwings(); if (s) { showTab('swings'); openSwing(s.id, true); } }
    },
  });
  recVoice.start(); $('#voiceRecBtn').classList.add('on');
  $('#recHint').textContent = 'Listening… say “record”, “stop”, or “analyze”.';
};

/* ---------- swing list ---------- */
async function renderList() {
  $('#swingDetail').classList.add('hidden'); $('#swingList').classList.remove('hidden');
  const all = await listSwings();
  if (!all.length) { $('#swingList').innerHTML = '<div class="empty">No swings yet.<br>Record one in the Record tab.</div>'; return; }
  $('#swingList').innerHTML = all.map(s => {
    const g = s.analysis?.grade;
    return `<button class="swing-card" data-id="${s.id}">
      <video muted playsinline preload="metadata" data-blob="${s.id}"></video>
      <div class="meta"><span>${esc(s.club)}<br><small style="color:var(--mute)">${new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${new Date(s.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></span>
      <span class="grade-pill" style="color:${g != null ? gradeColor(g) : 'var(--mute)'}">${g != null ? g.toFixed(1) : '—'}</span></div></button>`;
  }).join('');
  all.forEach(s => { const v = $(`video[data-blob="${s.id}"]`); v.src = URL.createObjectURL(s.blob) + '#t=' + ((s.trim?.start || 0) + 0.3).toFixed(2); });
  $$('.swing-card').forEach(b => b.onclick = () => {
    if (!selecting) return openSwing(b.dataset.id);
    selected.has(b.dataset.id) ? selected.delete(b.dataset.id) : selected.add(b.dataset.id);
    b.classList.toggle('picked'); updateSelBar();
  });
}
// select + delete several swings
let selecting = false; const selected = new Set();
function setSelect(on) {
  selecting = on; selected.clear();
  $('#selectBtn').textContent = on ? 'Cancel' : 'Select';
  $('#swingList').classList.toggle('selecting', on);
  $$('.swing-card.picked').forEach(c => c.classList.remove('picked'));
  updateSelBar();
}
function updateSelBar() {
  $('#selBar').classList.toggle('hidden', !selecting);
  $('#delSelBtn').textContent = selected.size ? `Delete ${selected.size} swing${selected.size === 1 ? '' : 's'}` : 'Delete';
  $('#delSelBtn').disabled = !selected.size;
}
$('#selectBtn').onclick = () => setSelect(!selecting);
$('#selAllBtn').onclick = () => { $$('.swing-card').forEach(c => { selected.add(c.dataset.id); c.classList.add('picked'); }); updateSelBar(); };
$('#delSelBtn').onclick = async () => {
  if (!selected.size || !confirm(`Delete ${selected.size} swing${selected.size === 1 ? '' : 's'} from your phone?`)) return;
  for (const id of selected) await deleteSwing(id);
  setSelect(false); renderList();
};

/* ---------- swing detail ---------- */
const player = $('#player'), overlay = new Overlay($('#overlay'), player);
overlay.onChange = shapes => { if (current) { current.shapes = shapes; saveSwing(current); } };

async function openSwing(id, autoAnalyze = false) {
  current = await getSwing(id);
  if (!current) return;
  setSelect(false); $('#selectBtn').classList.add('hidden');
  $('#swingList').classList.add('hidden'); $('#swingDetail').classList.remove('hidden');
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  player.src = currentUrl = URL.createObjectURL(current.blob);
  player.playbackRate = +$('#speedSel').value;
  overlay.shapes = current.shapes || [];
  overlay.pose = current.pose || null; overlay.phases = current.analysis?.phases || null;
  await new Promise(r => player.readyState >= 1 ? r() : player.addEventListener('loadedmetadata', r, { once: true }));
  // iOS sometimes reports Infinity duration for fresh recordings
  if (!isFinite(player.duration)) { player.currentTime = 1e6; await new Promise(r => player.addEventListener('timeupdate', r, { once: true })); player.currentTime = 0; }
  player.currentTime = win().start;
  overlay.render();
  renderBreakdown();
  if (autoAnalyze && !current.analysis) return runAnalysis();
}
$('#backBtn').onclick = () => { current = null; player.pause(); renderList(); $('#selectBtn').classList.remove('hidden'); };
// the part of the clip we show/analyze (trimmed to the swing when we found it)
const win = () => { const d = player.duration || 0, t = current?.trim; return t && isFinite(d) && t.start < d ? { start: t.start, end: Math.min(t.end, d) } : { start: 0, end: d }; };

// playback
$('#playBtn').onclick = () => { if (player.paused) { const w = win(); if (player.currentTime >= w.end - 0.05) player.currentTime = w.start; player.play(); } else player.pause(); };
player.onplay = () => $('#playBtn').textContent = '❚❚';
player.onpause = () => $('#playBtn').textContent = '▶';
$('#speedSel').onchange = e => player.playbackRate = +e.target.value;
$('#scrubber').oninput = e => { player.pause(); const w = win(); player.currentTime = w.start + (e.target.value / 1000) * (w.end - w.start); };
(function loop() {
  if (current && !$('#swingDetail').classList.contains('hidden')) {
    const w = win();
    if (!player.paused && player.currentTime >= w.end) player.currentTime = w.start; // loop the swing
    if (w.end > w.start) $('#scrubber').value = ((player.currentTime - w.start) / (w.end - w.start)) * 1000;
    overlay.render();
  }
  requestAnimationFrame(loop);
})();

// tools
$$('#tools [data-tool]').forEach(b => b.onclick = () => {
  $$('#tools [data-tool]').forEach(x => x.classList.toggle('active', x === b));
  overlay.tool = b.dataset.tool; overlay.draft = null;
});
$('#colorPick').oninput = e => overlay.color = e.target.value;
$('#undoBtn').onclick = () => overlay.undo();
$('#clearBtn').onclick = () => confirm('Clear all your drawings on this swing?') && overlay.clear();
$$('#autoToggles input').forEach(i => i.onchange = () => { overlay.auto[i.dataset.auto] = i.checked; overlay.render(); });

// analysis
const seekTo = t => new Promise(r => { player.addEventListener('seeked', r, { once: true }); player.currentTime = t; });
async function runAnalysis() {
  const st = $('#analyzeStatus'), btn = $('#analyzeBtn');
  btn.disabled = true;
  try {
    st.textContent = 'Loading on-device pose model…';
    const w = win();
    const pose = await trackPose(player, p => st.textContent = `Tracking body… ${Math.round(p * 100)}%`, w.start, w.end);
    if (pose.frames.length < 8) throw new Error('Could not find your body in enough frames. Make sure your whole body is in view.');
    const phases = findPhases(pose.frames);
    const result = gradeSwing(pose.frames, phases, current.view);
    // key frames for the AI coach
    const keyFrames = {};
    for (const k of ['address', 'top', 'impact', 'finish']) { await seekTo(pose.frames[phases[k]].t); keyFrames[k] = grabFrame(player, 560, 0.75); }
    await seekTo(w.start);
    current.pose = pose; current.keyFrames = keyFrames;
    current.analysis = { ...result, phases, phaseTimes: Object.fromEntries(Object.entries(phases).map(([k, i]) => [k, pose.frames[i].t])) };
    await saveSwing(current);
    overlay.pose = pose; overlay.phases = phases;
    st.textContent = '';
    renderBreakdown();
  } catch (e) { st.textContent = '⚠︎ ' + e.message; console.error(e); }
  btn.disabled = false;
}
$('#analyzeBtn').onclick = runAnalysis;

function renderBreakdown() {
  const a = current?.analysis, el = $('#breakdown');
  $('#analyzeBtn').textContent = a ? 'Re-analyze swing' : 'Analyze swing';
  $('#phaseJump').innerHTML = a ? Object.entries(a.phaseTimes).map(([k, t]) => `<button data-t="${t}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('') : '';
  $$('#phaseJump button').forEach(b => b.onclick = () => { player.pause(); player.currentTime = +b.dataset.t; });
  if (!a) { el.innerHTML = ''; return; }
  const c = gradeColor(a.grade);
  const sug = suggest(a.metrics, 3);
  el.innerHTML = `
    <div class="grade-hero">
      <div class="grade-ring" style="--p:${a.grade * 10};--c:${c}"><div>${a.grade.toFixed(1)}<small>/10</small></div></div>
      <div><b style="font-size:18px">${a.grade >= 8 ? 'Great swing' : a.grade >= 6 ? 'Solid — room to improve' : 'Let’s fix a few things'}</b>
      <div class="hint" style="text-align:left">${esc(current.club)} · ${current.view === 'dtl' ? 'Down-the-line' : 'Face-on'} · tempo ${a.tempo.toFixed(1)}:1</div></div>
    </div>
    <div class="sec-title">Full breakdown</div>
    ${a.metrics.map(m => `<div class="metric"><div class="mh"><span>${m.name}</span><span style="color:${gradeColor(m.score)}">${m.score.toFixed(1)}</span></div>
      <div class="bar"><i style="width:${m.score * 10}%;background:${gradeColor(m.score)}"></i></div>
      <p>${esc(m.raw)} — ${esc(m.note)}</p></div>`).join('')}
    ${sug.length ? `<div class="sec-title">Suggested drills</div>${sug.map(drillCard).join('')}` : ''}
    <div class="sec-title">Notes</div>
    <textarea id="notes" rows="2" style="width:100%;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit" placeholder="How did it feel? Where did it go?">${esc(current.notes || '')}</textarea>`;
  $('#notes').onchange = e => { current.notes = e.target.value; saveSwing(current); };
}
$('#deleteSwingBtn').onclick = async () => { if (confirm('Delete this swing from your phone?')) { await deleteSwing(current.id); current = null; renderList(); } };
$('#askCoachBtn').onclick = async () => {
  if (!current.analysis) await runAnalysis();
  if (!current.analysis) return;
  coach.resetChat(); $('#chat').innerHTML = '';
  coach.attachSwing(current);
  showTab('coach');
  sendToCoach(null, 'Looking at your swing…');
};

/* ---------- drills ---------- */
let drillFilter = 'all', libOpen = false;
$('#libToggle').onclick = () => { libOpen = !libOpen; renderDrills(); };
const drillCard = d => `<div class="drill"><h3>${esc(d.name)}</h3>
  <div class="tags">${d.why ? 'Fixes: ' + esc(d.why) + ' · ' : ''}${d.tags.map(t => FAULTS[t] || t).join(' · ')}</div>
  <ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
  <div class="vid"><a href="${videoUrl(d)}" target="_blank" rel="noopener">▶ Watch drill videos</a><a href="${shortsUrl(d)}" target="_blank" rel="noopener" style="background:var(--card2)">Shorts</a></div></div>`;
async function renderDrills() {
  const all = await listSwings(), [latest] = all.filter(s => s.analysis);
  const empty = (title, sub, btn) => `<div class="empty-state"><div class="es-icon">⛳</div><b>${title}</b><p>${sub}</p>${btn ? `<button class="primary" id="esBtn">${btn}</button>` : ''}</div>`;
  if (!latest) {
    $('#suggested').innerHTML = all.length
      ? empty('No suggestions yet', 'Analyze one of your swings and I’ll pick drills for exactly what you need.', 'Go to my swings')
      : empty('No swings yet', 'Record a swing to get drill suggestions picked for you.', 'Record a swing');
    $('#esBtn').onclick = () => showTab(all.length ? 'swings' : 'record');
  } else {
    const sug = suggest(latest.analysis.metrics);
    $('#suggested').innerHTML = `<div class="sec-title">Suggested for your last swing (${latest.analysis.grade.toFixed(1)}/10)</div>` +
      (sug.length ? sug.map(drillCard).join('') : '<p class="hint">Nothing needs fixing on your last swing — keep grooving it!</p>');
  }
  $('#drillLib').classList.toggle('hidden', !libOpen);
  $('#libToggle').textContent = libOpen ? 'Hide drill library' : 'Browse all drills';
  $('#drillFilters').innerHTML = Object.entries(FAULTS).map(([k, v]) => `<button class="chip ${k === drillFilter ? 'active' : ''}" data-f="${k}">${v}</button>`).join('');
  $$('#drillFilters .chip').forEach(c => c.onclick = () => { drillFilter = c.dataset.f; renderDrills(); });
  $('#drillList').innerHTML = `<div class="sec-title">Drill library</div>` + DRILLS.filter(d => drillFilter === 'all' || d.tags.includes(drillFilter)).map(drillCard).join('');
}

/* ---------- coach chat + hands-free ---------- */
const chat = $('#chat'), orb = $('#orb'), orbLabel = $('#orbLabel');
function addMsg(text, who) { const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text; chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; }
async function renderCoachCtx() {
  const id = coach.attachedSwing(), s = id && await getSwing(id);
  $('#coachCtx').textContent = s ? `Talking about: ${s.club} swing · ${s.analysis.grade.toFixed(1)}/10 · ${new Date(s.date).toLocaleString()}` : 'No swing attached — say “look at my last swing” or tap “Ask coach” on a swing.';
}
function setOrb(state, label) { orb.className = 'orb ' + (state || ''); orbLabel.textContent = label; }

async function sendToCoach(text, pending = '…') {
  if (text) addMsg(text, 'user');
  // "look at my last swing" → attach the newest analyzed swing
  if (text && /\b(last|latest|recent|my) swing\b/i.test(text) && !coach.attachedSwing()) {
    const [s] = (await listSwings()).filter(x => x.analysis);
    if (s) { coach.attachSwing(s); renderCoachCtx(); }
  }
  const bubble = addMsg(pending, 'bot');
  if (handsFree) { listener.pause(); setOrb('thinking', 'Thinking…'); }
  try {
    const reply = await coach.ask(text);
    bubble.textContent = reply;
    if (handsFree || localStorage.getItem('speak') !== '0') { setOrb('speaking', 'Speaking… (tap to interrupt)'); await speak(reply); }
  } catch (e) { bubble.textContent = '⚠︎ ' + e.message; }
  renderCoachCtx();
  if (handsFree) { setOrb('listening', 'Listening… just talk'); listener.resume(); } else setOrb('', 'Tap the orb for hands-free coach');
}
$('#chatForm').onsubmit = e => { e.preventDefault(); const t = $('#chatInput').value.trim(); if (t) { $('#chatInput').value = ''; sendToCoach(t); } };

let handsFree = false;
const listener = new Listener({
  onFinal: t => {
    if (/^(stop|goodbye|bye coach|that's all)\b/i.test(t)) { endHandsFree(); speak('Talk soon.'); return; }
    if (/\b(record|film|tape)\b/i.test(t) && !/\b(how|what|why|when)\b/i.test(t)) { coachRecord(); return; }
    if (/^(new chat|reset|start over)\b/i.test(t)) { coach.resetChat(); chat.innerHTML = ''; renderCoachCtx(); speak('Fresh start. What are we working on?'); return; }
    sendToCoach(t);
  },
  onInterim: t => orbLabel.textContent = '“' + t + '”',
  onState: s => { if (s === 'denied') { endHandsFree(); alert('Microphone / speech permission denied. Enable in Settings › Safari.'); } },
});
// "Record my swing" -> countdown, record, trim, analyze, then the coach talks you through it
function resumeListening() { if (handsFree) { setOrb('listening', 'Listening… just talk'); listener.resume(); } }
async function coachRecord() {
  listener.pause(); setOrb('thinking', 'Getting the camera ready…');
  showTab('record');
  if (!(await ensureCam())) { showTab('coach'); speak('I can\u2019t get the camera. Tap record instead.'); resumeListening(); return; }
  await speak('Okay, set the phone down and get set. Recording in 5.');
  coachRec = true;
  if (!(await beginRec(true))) { coachRec = false; resumeListening(); }
}
async function coachReview(id) {
  speak('Got it. Give me a second to look.');
  showTab('swings');
  await openSwing(id, true);
  if (!current?.analysis) { showTab('coach'); speak('I couldn\u2019t track your body in that one. Make sure you\u2019re fully in frame and try again.'); resumeListening(); return; }
  coach.resetChat(); chat.innerHTML = '';
  coach.attachSwing(current);
  showTab('coach');
  sendToCoach('Here\u2019s the swing I just hit. Give me quick feedback I can use on the next one.');
}
function endHandsFree() { handsFree = false; listener.stop(); stopSpeaking(); setOrb('', 'Tap the orb for hands-free coach'); }
orb.onclick = () => {
  if (orb.classList.contains('speaking')) { stopSpeaking(); return; }
  if (handsFree) return endHandsFree();
  if (!voiceSupported) return alert('Voice not supported in this browser. Use Safari on iPhone.');
  handsFree = true; speak(''); // unlock iOS audio with a user tap
  listener.start(); setOrb('listening', 'Listening… just talk (say “stop” to end)');
};

/* ---------- boot ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (!localStorage.getItem('apiKey')) setTimeout(() => addMsg('Hey! I’m your swing coach. Add your Claude API key in ⚙︎ Settings, then record a swing and tap “Ask coach” — or tap the orb and just talk to me.', 'bot'), 0);
