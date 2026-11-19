import { L, mid, hands } from './analyze.js';

const clamp = (v, a = 0, b = 10) => Math.max(a, Math.min(b, v));
const deg = r => r * 180 / Math.PI;
// score = 10 when |x - ideal| <= ok, falls to 0 at |x - ideal| >= bad
const band = (x, ideal, ok, bad) => { const d = Math.abs(x - ideal); return d <= ok ? 10 : clamp(10 - 10 * (d - ok) / (bad - ok)); };

// Each metric: score 0-10, raw value, plain-English note, fault tag used to suggest drills.
export function gradeSwing(frames, ph, view = 'face') {
  const A = frames[ph.address].lm, T = frames[ph.top].lm, I = frames[ph.impact].lm, F = frames[ph.finish].lm;
  const shW = Math.abs(A[L.lSh].x - A[L.rSh].x) || 0.1;
  const stance = Math.abs(A[L.lAn].x - A[L.rAn].x) || 0.1;
  const spine = lm => { const h = mid(lm[L.lHip], lm[L.rHip]), s = mid(lm[L.lSh], lm[L.rSh]); return deg(Math.atan2(s.x - h.x, h.y - s.y)); };
  const hipC = lm => mid(lm[L.lHip], lm[L.rHip]);
  const m = [];

  // 1. Head stability
  const headMove = Math.max(...frames.slice(ph.address, ph.impact + 1).map(f => Math.hypot(f.lm[L.nose].x - A[L.nose].x, f.lm[L.nose].y - A[L.nose].y))) / shW;
  m.push({ key: 'head', name: 'Head stability', score: band(headMove, 0, 0.15, 0.7), raw: `${Math.round(headMove * 100)}% of shoulder width`,
    note: headMove < 0.2 ? 'Head stays quiet — great.' : 'Head is moving a lot through the swing; keep it centered over the ball.', fault: 'head' });

  // 2. Spine angle hold (address vs impact)
  const sA = spine(A), sI = spine(I), dSpine = Math.abs(sI - sA);
  const upright = view === 'dtl' ? (A[L.nose].y < T[L.nose].y ? 0 : (A[L.nose].y - I[L.nose].y) / shW) : 0;
  m.push({ key: 'spine', name: 'Posture / spine angle', score: band(dSpine + upright * 30, 0, 6, 30), raw: `${dSpine.toFixed(0)}° change`,
    note: dSpine < 8 ? 'Spine angle held through impact.' : 'Spine angle changes into impact — classic early extension / standing up.', fault: 'early-extension' });

  // 3. Hip sway in backswing
  const sway = Math.abs(hipC(T).x - hipC(A).x) / stance;
  m.push({ key: 'sway', name: 'Hip sway (backswing)', score: band(sway, 0.05, 0.1, 0.45), raw: `${Math.round(sway * 100)}% of stance`,
    note: sway < 0.15 ? 'Turning, not sliding.' : 'Hips slide away from the target instead of rotating.', fault: 'sway' });

  // 4. Shoulder turn (face-on: shoulders narrow when turned)
  const shT = Math.abs(T[L.lSh].x - T[L.rSh].x);
  const turn = clamp(1 - shT / shW, 0, 1);
  m.push({ key: 'turn', name: 'Shoulder turn', score: view === 'face' ? band(turn, 0.6, 0.2, 0.6) : 7, raw: view === 'face' ? `${Math.round(turn * 100)}% turn index` : 'best from face-on',
    note: turn > 0.4 ? 'Full shoulder turn.' : 'Short shoulder turn — arms are doing the work.', fault: 'turn' });

  // 5. Tempo (backswing : downswing time, tour ~3:1)
  const back = frames[ph.top].t - frames[ph.address].t, down = Math.max(0.01, frames[ph.impact].t - frames[ph.top].t);
  const tempo = back / down;
  m.push({ key: 'tempo', name: 'Tempo', score: band(tempo, 3, 0.6, 2.5), raw: `${tempo.toFixed(1)} : 1`,
    note: Math.abs(tempo - 3) < 0.8 ? 'Smooth, tour-like 3:1 tempo.' : tempo < 3 ? 'Quick from the top — rushing the transition.' : 'Slow, long backswing relative to downswing.', fault: 'tempo' });

  // 6. Weight to lead side at finish
  const leadAnkle = Math.abs(F[L.lAn].x - hipC(F).x) < Math.abs(F[L.rAn].x - hipC(F).x) ? F[L.lAn] : F[L.rAn];
  const fin = Math.abs(hipC(F).x - leadAnkle.x) / stance;
  m.push({ key: 'finish', name: 'Weight shift / finish', score: band(fin, 0, 0.12, 0.5), raw: `${Math.round(fin * 100)}% off lead foot`,
    note: fin < 0.15 ? 'Balanced finish stacked on the lead side.' : 'Weight hanging back at finish — get to your lead side.', fault: 'weight' });

  // 7. Hand path (over the top proxy): hands at impact vs address position
  const hA = hands(A), hI = hands(I);
  const handGap = Math.hypot(hI.x - hA.x, hI.y - hA.y) / shW;
  m.push({ key: 'path', name: 'Hand / club path return', score: band(handGap, 0.1, 0.15, 0.8), raw: `${Math.round(handGap * 100)}% off address`,
    note: handGap < 0.25 ? 'Hands return close to address — consistent delivery.' : 'Hands come back to a different spot than address — path is off (often over-the-top).', fault: 'over-the-top' });

  const weights = { head: 1, spine: 1.3, sway: 1, turn: 1, tempo: 0.8, finish: 0.9, path: 1.4 };
  const tw = m.reduce((s, x) => s + weights[x.key], 0);
  const total = m.reduce((s, x) => s + x.score * weights[x.key], 0) / tw;
  return { grade: Math.round(total * 10) / 10, metrics: m, tempo };
}

export const gradeColor = g => g >= 8 ? 'var(--green)' : g >= 6 ? 'var(--yellow)' : 'var(--red)';
