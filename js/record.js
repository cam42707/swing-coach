// On-device recording with the rear camera.
let stream = null, recorder = null, chunks = [], facing = 'environment';

export async function startCamera(videoEl) {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 60 } },
  });
  videoEl.srcObject = stream;
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

export function startRecording() {
  if (!stream) throw new Error('Camera is off');
  chunks = [];
  const mimeType = pickMime();
  recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.start(250);
}
export function stopRecording() {
  return new Promise(res => {
    if (!recorder) return res(null);
    recorder.onstop = () => res(new Blob(chunks, { type: recorder.mimeType || 'video/mp4' }));
    recorder.stop();
  });
}

// small thumbnail-free poster: grab a JPEG frame from a video element
export function grabFrame(video, maxW = 640, q = 0.8) {
  const s = Math.min(1, maxW / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * s); c.height = Math.round(video.videoHeight * s);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
