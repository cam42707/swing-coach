// Hands-free voice: Safari speech recognition + speech synthesis.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;

// Continuous listener; calls onFinal(text) for each finished phrase.
export class Listener {
  constructor({ onFinal, onInterim, onState }) {
    this.onFinal = onFinal; this.onInterim = onInterim || (() => {}); this.onState = onState || (() => {});
    this.want = false; this.paused = false; this.rec = null;
  }
  start() {
    if (!SR) throw new Error('Voice recognition is not supported in this browser. On iPhone use Safari and turn on Siri & Dictation.');
    this.want = true; this.paused = false; this._spin();
  }
  stop() { this.want = false; try { this.rec?.stop(); } catch {} this.onState('off'); }
  pause() { this.paused = true; try { this.rec?.abort(); } catch {} }
  resume() { if (!this.want) return; this.paused = false; this._spin(); }
  _spin() {
    if (this.rec) { try { this.rec.abort(); } catch {} }
    const r = this.rec = new SR();
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true;
    r.onstart = () => this.onState('listening');
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) { if (t) this.onFinal(t); } else this.onInterim(t);
      }
    };
    r.onerror = e => { if (e.error === 'not-allowed') { this.want = false; this.onState('denied'); } };
    r.onend = () => { if (this.rec === r && this.want && !this.paused) setTimeout(() => this.want && !this.paused && this._spin(), 250); };
    try { r.start(); } catch {}
  }
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => /en-(US|GB)/.test(v.lang) && /(Premium|Enhanced|Siri|Samantha|Daniel|Alex)/i.test(v.name)) || vs.find(v => v.lang.startsWith('en')) || null;
}
speechSynthesis?.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });

export function speak(text) {
  return new Promise(res => {
    if (!window.speechSynthesis) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice ||= pickVoice(); u.rate = 1.02; u.pitch = 1;
    u.onend = u.onerror = () => res();
    speechSynthesis.speak(u);
  });
}
export const stopSpeaking = () => window.speechSynthesis?.cancel();
