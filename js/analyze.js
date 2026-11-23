// On-device pose tracking with MediaPipe (runs in the phone's browser, no upload).
const VER = '0.10.14';
const MP = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let landmarker = null, lastTs = 0; // MediaPipe needs timestamps that always increase, even across analyses

async function getLandmarker() {
  if (landmarker) return landmarker;
  const { PoseLandmarker, FilesetResolver } = await import(`${MP}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  landmarker = await PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO', numPoses: 1,
  });
  return landmarker;
}

const seek = (v, t) => new Promise(r => { const on = () => { v.removeEventListener('seeked', on); r(); }; v.addEventListener('seeked', on); v.currentTime = t; });

// Returns { frames:[{t, lm:[{x,y,v}]}], duration }
export async function trackPose(video, onProgress, from = 0, to = Infinity) {
  const lmk = await getLandmarker();
  video.pause();
  const dur = video.duration;
  if (!isFinite(dur) || !dur) throw new Error('This video could not be read. Try recording it again.');
  const a = Math.max(0, from), b = Math.min(dur * 0.999, to), len = b - a;
  const n = Math.min(120, Math.max(40, Math.round(len * 30)));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = a + (len * i) / (n - 1);
    await seek(video, t);
    lastTs += 33;
    const r = lmk.detectForVideo(video, lastTs);
    const p = r.landmarks?.[0];
    if (p) frames.push({ t, lm: p.map(q => ({ x: q.x, y: q.y, v: q.visibility ?? 1 })) });
    onProgress?.((i + 1) / n);
  }
  await seek(video, a);
  return { frames, duration: dur };
}

// landmark indices
export const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lToe: 31, rToe: 32 };
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const hands = lm => mid(lm[L.lWr], lm[L.rWr]);

// Find address / top / impact / finish from the hand path.
export function findPhases(frames) {
  if (frames.length < 8) return null;
  const hy = frames.map(f => hands(f.lm).y);
  const hx = frames.map(f => hands(f.lm).x);
  const speed = hy.map((y, i) => i ? Math.hypot(y - hy[i - 1], hx[i] - hx[i - 1]) : 0);
  const maxSp = Math.max(...speed);
  // start of motion = first frame hands move meaningfully
  let start = speed.findIndex(s => s > maxSp * 0.15);
  start = Math.max(0, start - 1);
  // impact = fastest hand motion while hands are low (bottom half of hand range)
  const lowY = Math.min(...hy), highY = Math.max(...hy); // y grows downward
  let impact = start, best = -1;
  for (let i = start + 2; i < frames.length; i++) if (hy[i] > lowY + (highY - lowY) * 0.6 && speed[i] > best) { best = speed[i]; impact = i; }
  // top = highest hands between start and impact
  let top = start;
  for (let i = start; i <= impact; i++) if (hy[i] < hy[top]) top = i;
  if (top === start) top = Math.round((start + impact) / 2);
  // finish = highest hands after impact
  let finish = impact;
  for (let i = impact; i < frames.length; i++) if (hy[i] < hy[finish]) finish = i;
  if (finish === impact) finish = frames.length - 1;
  return { address: start, top, impact, finish };
}

export function nearestFrame(frames, t) {
  let b = 0;
  for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[b].t - t)) b = i;
  return frames[b];
}
