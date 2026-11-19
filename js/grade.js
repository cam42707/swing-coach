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
  const m = [], dtl = view === 'dtl';
  // size reference: shoulder width face-on; in down-the-line shoulders overlap, so use torso length
  const torso = Math.hypot(mid(A[L.lSh], A[L.rSh]).x - hipC(A).x, mid(A[L.lSh], A[L.rSh]).y - hipC(A).y) || 0.2;
  const unit = dtl ? torso * 0.6 : shW, unitName = dtl ? 'torso size' : 'shoulder width';

  // 1. Head stability
  const headMove = Math.max(...frames.slice(ph.address, ph.impact + 1).map(f => Math.hypot(f.lm[L.nose].x - A[L.nose].x, f.lm[L.nose].y - A[L.nose].y))) / unit;
  m.push({ key: 'head', name: 'Head stability', score: band(headMove, 0, 0.15, 0.7), raw: `${Math.round(headMove * 100)}% of ${unitName}`,
    note: headMove < 0.2 ? 'Head stays quiet — great.' : dtl ? 'Head moves up/down or toward the ball — stay in your posture.' : 'Head is moving a lot through the swing; keep it centered over the ball.', fault: 'head' });

  // 2. Spine angle hold (address vs impact) — the best down-the-line measurement
  const sA = spine(A), sI = spine(I), dSpine = Math.abs(sI - sA);
  m.push({ key: 'spine', name: 'Spine angle hold', score: band(dSpine, 0, 6, 30), raw: `${dSpine.toFixed(0)}° change`,
    note: dSpine < 8 ? 'Spine angle held through impact.' : 'Spine angle changes into impact — classic early extension / standing up.', fault: 'early-extension' });

  if (dtl) {
    // 3. Hip depth: hips moving toward the ball by impact = early extension
    const ballDir = Math.sign(hands(A).x - hipC(A).x) || 1;
    const toward = ((hipC(I).x - hipC(A).x) * ballDir) / unit;
    m.push({ key: 'depth', name: 'Hip depth (early extension)', score: band(Math.max(0, toward), 0, 0.08, 0.45), raw: `${Math.round(Math.max(0, toward) * 100)}% toward ball`,
      note: toward < 0.12 ? 'Hips keep their depth — no thrust toward the ball.' : 'Hips push toward the ball at impact — stay back in your posture.', fault: 'early-extension' });
    // 4. Address posture: forward tilt from hips, ~30-45° is athletic
    const tilt = Math.abs(sA);
    m.push({ key: 'setup', name: 'Address posture', score: band(tilt, 38, 8, 25), raw: `${tilt.toFixed(0)}° forward tilt`,
      note: tilt < 28 ? 'Standing too tall at address — bend more from the hips.' : tilt > 50 ? 'Bent over too much at address.' : 'Athletic posture at address.', fault: 'early-extension' });
  } else {
    // 3. Hip sway in backswing
    const sway = Math.abs(hipC(T).x - hipC(A).x) / stance;
    m.push({ key: 'sway', name: 'Hip sway (backswing)', score: band(sway, 0.05, 0.1, 0.45), raw: `${Math.round(sway * 100)}% of stance`,
      note: sway < 0.15 ? 'Turning, not sliding.' : 'Hips slide away from the target instead of rotating.', fault: 'sway' });
    // 4. Shoulder turn (face-on: shoulders narrow when turned)
    const turn = clamp(1 - Math.abs(T[L.lSh].x - T[L.rSh].x) / shW, 0, 1);
    m.push({ key: 'turn', name: 'Shoulder turn', score: band(turn, 0.6, 0.2, 0.6), raw: `${Math.round(turn * 100)}% turn index`,
      note: turn > 0.4 ? 'Full shoulder turn.' : 'Short shoulder turn — arms are doing the work.', fault: 'turn' });
  }

  // 5. Tempo (backswing : downswing time, tour ~3:1)
  const back = frames[ph.top].t - frames[ph.address].t, down = Math.max(0.01, frames[ph.impact].t - frames[ph.top].t);
  const tempo = back / down;
  m.push({ key: 'tempo', name: 'Tempo', score: band(tempo, 3, 0.6, 2.5), raw: `${tempo.toFixed(1)} : 1`,
    note: Math.abs(tempo - 3) < 0.8 ? 'Smooth, tour-like 3:1 tempo.' : tempo < 3 ? 'Quick from the top — rushing the transition.' : 'Slow, long backswing relative to downswing.', fault: 'tempo' });

  // 6. Finish: face-on = weight on lead side; down-the-line = tall, balanced finish
  if (dtl) {
    const fTilt = Math.abs(spine(F));
    m.push({ key: 'finish', name: 'Balanced finish', score: band(fTilt, 0, 15, 45), raw: `${fTilt.toFixed(0)}° from upright`,
      note: fTilt < 20 ? 'Tall, balanced finish.' : 'Finish is falling over — hold a tall finish on your lead side.', fault: 'weight' });
  } else {
    const leadAnkle = Math.abs(F[L.lAn].x - hipC(F).x) < Math.abs(F[L.rAn].x - hipC(F).x) ? F[L.lAn] : F[L.rAn];
    const fin = Math.abs(hipC(F).x - leadAnkle.x) / stance;
    m.push({ key: 'finish', name: 'Weight shift / finish', score: band(fin, 0, 0.12, 0.5), raw: `${Math.round(fin * 100)}% off lead foot`,
      note: fin < 0.15 ? 'Balanced finish stacked on the lead side.' : 'Weight hanging back at finish — get to your lead side.', fault: 'weight' });
  }

  // 7. Hand path: hands return to address spot at impact (down-the-line shows over-the-top best)
  const hA = hands(A), hI = hands(I);
  const handGap = Math.hypot(hI.x - hA.x, hI.y - hA.y) / unit;
  m.push({ key: 'path', name: 'Hand / club path return', score: band(handGap, 0.1, 0.15, 0.8), raw: `${Math.round(handGap * 100)}% off address`,
    note: handGap < 0.25 ? 'Hands return close to address — consistent delivery.' : 'Hands come back to a different spot than address — path is off (often over-the-top).', fault: 'over-the-top' });

  const weights = { head: 1, spine: 1.3, sway: 1, turn: 1, depth: 1.2, setup: 0.8, tempo: 0.8, finish: 0.9, path: 1.4 };
  const tw = m.reduce((s, x) => s + weights[x.key], 0);
  const total = m.reduce((s, x) => s + x.score * weights[x.key], 0) / tw;
  return { grade: Math.round(total * 10) / 10, metrics: m, tempo };
}

export const gradeColor = g => g >= 8 ? 'var(--green)' : g >= 6 ? 'var(--yellow)' : 'var(--red)';
