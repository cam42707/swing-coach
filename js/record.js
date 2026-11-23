// On-device recording. Prefers the 0.5x ultra-wide rear lens and always records portrait.
let stream = null, recorder = null, chunks = [], facing = 'environment';
let srcVideo = null, canvas = null, rafId = 0, recStream = null;
// motion samples taken while recording, used to find the swing and trim the clip
let motion = [], mTimer = 0, mT0 = 0, mPrev = null;
const mc = document.createElement('canvas'); mc.width = 48; mc.height = 64;
function sampleMotion() {
  if (!srcVideo?.videoWidth) return;
  const g = mc.getContext('2d', { willReadFrequently: true });
  g.drawImage(srcVideo, 0, 0, 48, 64);
  const d = g.getImageData(0, 0, 48, 64).data, cur = new Uint8Array(48 * 64);
  let sum = 0;
  for (let i = 0; i < cur.length; i++) { cur[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; if (mPrev) sum += Math.abs(cur[i] - mPrev[i]); }
  if (mPrev) motion.push({ t: (performance.now() - mT0) / 1000, m: sum / cur.length });
  mPrev = cur;
}
export const getMotion = () => motion;

async function ultraWideId() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    return devs.find(d => /ultra ?wide/i.test(d.label))?.deviceId || null;
  } catch { return null; }
}

async function open(constraintsVideo) {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: constraintsVideo });
}

export async function startCamera(videoEl) {
  stopCamera();
  const base = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };
  stream = await open({ ...base, facingMode: facing });
  if (facing === 'environment') {
    // labels are only visible after permission, so look for the ultra-wide lens now
    const id = await ultraWideId();
    const cur = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (id && id !== cur) {
      stopCamera();
      try { stream = await open({ ...base, deviceId: { exact: id } }); }
      catch { stream = await open({ ...base, facingMode: facing }); }
    } else {
      // some iPhones expose one virtual camera that zooms out below 1x
      const tr = stream.getVideoTracks()[0], cap = tr.getCapabilities?.() || {};
      if (cap.zoom && cap.zoom.min < 1) tr.applyConstraints({ advanced: [{ zoom: cap.zoom.min }] }).catch(() => {});
    }
  }
  videoEl.srcObject = stream;
  srcVideo = videoEl;
  await videoEl.play().catch(() => {});
  return stream;
}
export function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
export function flipCamera(videoEl) { facing = facing === 'environment' ? 'user' : 'environment'; return startCamera(videoEl); }
export const cameraOn = () => !!stream;
export const isRecording = () => recorder?.state === 'recording';

function pickMime() {
  const opts = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return opts.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

// If the camera hands us a landscape frame, crop the middle into a portrait 9:16 video.
function portraitStream() {
  const w = srcVideo.videoWidth, h = srcVideo.videoHeight;
  if (!w || h >= w) return stream;
  const outH = Math.min(h, 1920), outW = Math.round(outH * 9 / 16);
  const cropW = Math.round(h * 9 / 16), sx = Math.round((w - cropW) / 2);
  canvas = document.createElement('canvas'); canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const draw = () => { ctx.drawImage(srcVideo, sx, 0, cropW, h, 0, 0, outW, outH); rafId = requestAnimationFrame(draw); };
  draw();
  recStream = canvas.captureStream(60);
  return recStream;
}

export function startRecording() {
  if (!stream) throw new Error('Camera is off');
  chunks = [];
  const mimeType = pickMime();
  const s = portraitStream();
  recorder = new MediaRecorder(s, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.start(250);
  motion = []; mPrev = null; mT0 = performance.now(); clearInterval(mTimer); mTimer = setInterval(sampleMotion, 66);
}
export function stopRecording() {
  return new Promise(res => {
    if (!recorder) return res(null);
    clearInterval(mTimer);
    recorder.onstop = () => {
      cancelAnimationFrame(rafId); recStream?.getTracks().forEach(t => t.stop()); recStream = null;
      res(new Blob(chunks, { type: recorder.mimeType || 'video/mp4' }));
    };
    recorder.stop();
  });
}

// grab a JPEG frame from a video element
export function grabFrame(video, maxW = 640, q = 0.8) {
  const s = Math.min(1, maxW / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * s); c.height = Math.round(video.videoHeight * s);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

// Find the swing: the LAST big burst of motion (walking up / setting up comes before it).
export function findSwingWindow(samples, dur) {
  if (!samples || samples.length < 20) return null;
  const sm = samples.map((s, i) => { const w = samples.slice(Math.max(0, i - 3), i + 4); return w.reduce((a, b) => a + b.m, 0) / w.length; });
  const max = Math.max(...sm);
  if (max <= 0) return null;
  let peak = -1;
  for (let i = sm.length - 1; i >= 0; i--) if (sm[i] >= max * 0.5) { peak = i; break; }
  // walk back to the top of that burst (the real peak of the last burst)
  let p = peak; while (p > 0 && sm[p - 1] >= sm[p]) p--;
  for (let i = peak; i >= 0 && sm[i] >= max * 0.3; i--) if (sm[i] > sm[p]) p = i;
  const tp = samples[p].t, end = Math.min(dur, tp + 1.8), start = Math.max(0, tp - 2.6);
  return end - start > 1.5 ? { start, end } : null;
}
