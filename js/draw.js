// Overlay: automatic lines from pose data + manual drawing tools.
import { L, mid, hands, nearestFrame } from './analyze.js';

export class Overlay {
  constructor(canvas, video) {
    this.c = canvas; this.v = video; this.ctx = canvas.getContext('2d');
    this.tool = 'none'; this.color = '#ffd60a';
    this.shapes = []; this.draft = null;
    this.pose = null; this.phases = null;
    this.auto = { skeleton: true, spine: true, feet: true, head: true, hands: true, plane: true };
    this.onChange = () => {};
    const ev = (n, f) => canvas.addEventListener(n, f, { passive: false });
    ev('pointerdown', e => this.down(e)); ev('pointermove', e => this.move(e));
    ev('pointerup', e => this.up(e)); ev('pointercancel', () => { this.draft = null; this.render(); });
    new ResizeObserver(() => this.render()).observe(canvas);
  }
  // video content rect inside canvas (object-fit: contain)
  rect() {
    const W = this.c.clientWidth, H = this.c.clientHeight, vw = this.v.videoWidth || 9, vh = this.v.videoHeight || 16;
    const s = Math.min(W / vw, H / vh), w = vw * s, h = vh * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  toN(e) { const b = this.c.getBoundingClientRect(), r = this.rect(); return { x: (e.clientX - b.left - r.x) / r.w, y: (e.clientY - b.top - r.y) / r.h }; }
  P(p) { const r = this.rect(); return [r.x + p.x * r.w, r.y + p.y * r.h]; }

  down(e) {
    if (this.tool === 'none') return;
    e.preventDefault(); this.c.setPointerCapture(e.pointerId);
    const p = this.toN(e);
    if (this.tool === 'angle' && this.draft?.type === 'angle') { this.draft.pts.push(p); return this.render(); }
    this.draft = { type: this.tool, color: this.color, pts: [p, { ...p }], t: this.v.currentTime };
  }
  move(e) {
    if (!this.draft) return; e.preventDefault();
    const p = this.toN(e);
    if (this.draft.type === 'free') this.draft.pts.push(p); else this.draft.pts[this.draft.pts.length - 1] = p;
    this.render();
  }
  up() {
    if (!this.draft) return;
    if (this.draft.type === 'angle' && this.draft.pts.length < 3) return; // wait for 3rd point
    this.shapes.push(this.draft); this.draft = null; this.render(); this.onChange(this.shapes);
  }
  undo() { this.shapes.pop(); this.draft = null; this.render(); this.onChange(this.shapes); }
  clear() { this.shapes = []; this.draft = null; this.render(); this.onChange(this.shapes); }

  line(a, b, color, w = 3, dash) {
    const g = this.ctx; g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath(); g.moveTo(...this.P(a)); g.lineTo(...this.P(b)); g.stroke(); g.restore();
  }
  label(p, text, color = '#fff') {
    const g = this.ctx, [x, y] = this.P(p); g.save(); g.font = '600 13px -apple-system,system-ui';
    const w = g.measureText(text).width + 10; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x + 6, y - 18, w, 20);
    g.fillStyle = color; g.fillText(text, x + 11, y - 4); g.restore();
  }
  ext(a, b, k = 3) { return [{ x: a.x - (b.x - a.x) * k, y: a.y - (b.y - a.y) * k }, { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }]; }

  drawShape(s) {
    const g = this.ctx, [a, b, c] = s.pts;
    g.save(); g.strokeStyle = s.color; g.lineWidth = 3; g.lineCap = g.lineJoin = 'round';
    if (s.type === 'line') { this.line(a, b, s.color); }
    else if (s.type === 'circle') { const r = this.rect(), rad = Math.hypot((b.x - a.x) * r.w, (b.y - a.y) * r.h); g.beginPath(); g.arc(...this.P(a), rad, 0, 7); g.stroke(); }
    else if (s.type === 'free') { g.beginPath(); s.pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](...this.P(p))); g.stroke(); }
    else if (s.type === 'angle') {
      this.line(a, b, s.color); if (c) { this.line(b, c, s.color);
        const r = this.rect(), v1 = [(a.x - b.x) * r.w, (a.y - b.y) * r.h], v2 = [(c.x - b.x) * r.w, (c.y - b.y) * r.h];
        const ang = Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])) * 180 / Math.PI;
        this.label(b, `${ang.toFixed(0)}°`, s.color); }
    }
    g.restore();
  }

  drawAuto() {
    if (!this.pose?.frames?.length) return;
    const fr = nearestFrame(this.pose.frames, this.v.currentTime), lm = fr.lm, A = this.pose.frames[this.phases?.address ?? 0].lm;
    const g = this.ctx, au = this.auto;
    if (au.skeleton) {
      const bones = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
      bones.forEach(([i, j]) => this.line(lm[i], lm[j], 'rgba(255,255,255,.75)', 2.5));
      g.fillStyle = '#4cc3ff'; [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => { g.beginPath(); g.arc(...this.P(lm[i]), 4, 0, 7); g.fill(); });
    }
    if (au.feet) { // foot line at address + toe line, stays fixed
      const [p, q] = this.ext(A[L.lAn], A[L.rAn], 0.6); this.line(p, q, '#ffd60a', 3, [8, 6]);
      this.line(A[L.lAn], A[L.lToe], '#ffd60a', 2); this.line(A[L.rAn], A[L.rToe], '#ffd60a', 2);
      this.label(q, 'Feet line', '#ffd60a');
    }
    if (au.spine) { // address spine line fixed, current spine line live
      const ha = mid(A[L.lHip], A[L.rHip]), sa = mid(A[L.lSh], A[L.rSh]);
      const [p, q] = this.ext(ha, sa, 0.5); this.line(p, q, 'rgba(255,90,95,.55)', 2, [6, 6]);
      this.line(mid(lm[L.lHip], lm[L.rHip]), mid(lm[L.lSh], lm[L.rSh]), '#ff5a5f', 3.5);
      this.label(sa, 'Spine', '#ff5a5f');
    }
    if (au.head) { // box around address head position
      const r = this.rect(), n = A[L.nose], sz = Math.abs(A[L.lSh].x - A[L.rSh].x) * 0.35;
      g.save(); g.strokeStyle = '#34d27b'; g.lineWidth = 2; g.setLineDash([5, 4]);
      const [x, y] = this.P(n); g.strokeRect(x - sz * r.w, y - sz * r.w * 1.2, sz * 2 * r.w, sz * 2.4 * r.w); g.restore();
    }
    if (au.plane) { // estimated shaft plane: address hands → shoulders line, extended to ground
      const h = hands(A), s = mid(A[L.lSh], A[L.rSh]);
      const [p, q] = this.ext(h, s, 1.2); this.line(p, q, '#c084fc', 2.5, [10, 6]);
      this.label(h, 'Plane (est.)', '#c084fc');
    }
    if (au.hands) { // hand path trace up to now, colored back (blue) / down (orange)
      const top = this.phases?.top ?? 0, upto = this.pose.frames.filter(f => f.t <= this.v.currentTime + 1e-3);
      g.save(); g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 1; i < upto.length; i++) {
        const idx = this.pose.frames.indexOf(upto[i]);
        g.strokeStyle = idx <= top ? '#4cc3ff' : '#ff9f0a';
        g.beginPath(); g.moveTo(...this.P(hands(upto[i - 1].lm))); g.lineTo(...this.P(hands(upto[i].lm))); g.stroke();
      }
      g.restore();
    }
  }

  render() {
    const dpr = devicePixelRatio || 1, W = this.c.clientWidth, H = this.c.clientHeight;
    if (this.c.width !== W * dpr) { this.c.width = W * dpr; this.c.height = H * dpr; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.clearRect(0, 0, W, H);
    this.drawAuto();
    this.shapes.forEach(s => this.drawShape(s));
    if (this.draft) this.drawShape(this.draft);
  }
}
