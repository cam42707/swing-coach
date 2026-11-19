// On-device recording. Prefers the 0.5x ultra-wide rear lens and always records portrait.
let stream = null, recorder = null, chunks = [], facing = 'environment';
let srcVideo = null, canvas = null, rafId = 0, recStream = null;

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
}
export function stopRecording() {
  return new Promise(res => {
    if (!recorder) return res(null);
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
