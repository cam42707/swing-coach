// Claude swing coach. Sends key still frames + metrics (never the video file).
const MODEL = 'claude-sonnet-5-5';
export const getKey = () => localStorage.getItem('apiKey') || '';

const SYSTEM = name => `You are ${name || 'Coach'}, an elite, friendly PGA-level golf swing coach talking to a player through their iPhone.
You can see still frames from their swing (address, top, impact, finish) and on-device pose metrics.
Rules:
- Talk like a real coach on the range: short, direct, encouraging. Replies are often spoken aloud, so keep them to 2-4 sentences unless asked for detail. No markdown, no bullet symbols.
- Lead with the ONE biggest fix, explain the feel, then give one drill.
- Reference what you actually see in the frames (positions, angles), and the metrics.
- Pose metrics are estimates from phone video; trust what you see if they disagree.
- If no swing is attached, coach from the conversation.`;

let history = [];   // [{role, content}]
let attached = null; // swing id whose frames are in history

export function resetChat() { history = []; attached = null; }
export const attachedSwing = () => attached;

export function attachSwing(swing) {
  if (!swing?.keyFrames) return false;
  attached = swing.id;
  const content = [];
  for (const [phase, url] of Object.entries(swing.keyFrames)) {
    content.push({ type: 'text', text: `${phase.toUpperCase()} frame:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: url.split(',')[1] } });
  }
  const mt = swing.analysis?.metrics?.map(m => `${m.name}: ${m.score.toFixed(1)}/10 (${m.raw}) — ${m.note}`).join('\n') || 'not analyzed';
  content.push({ type: 'text', text: `Swing info: club ${swing.club}, camera ${swing.view === 'dtl' ? 'down-the-line' : 'face-on'}, player is ${localStorage.getItem('hand') === 'L' ? 'left' : 'right'}-handed.
Overall grade (app estimate): ${swing.analysis?.grade ?? '?'}/10
Metrics:
${mt}
${swing.notes ? 'Player notes: ' + swing.notes : ''}
Look at my swing and give me your take.` });
  history.push({ role: 'user', content });
  return true;
}

export async function ask(text) {
  const key = getKey();
  if (!key) throw new Error('Add your Claude API key in Settings (⚙︎) first.');
  if (text) {
    const last = history[history.length - 1];
    // merge into a pending user turn (e.g. right after attaching a swing)
    if (last?.role === 'user') last.content.push({ type: 'text', text });
    else history.push({ role: 'user', content: [{ type: 'text', text }] });
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM(localStorage.getItem('coachName')), messages: history }),
  });
  const data = await res.json();
  if (!res.ok) { history.pop(); throw new Error(data?.error?.message || `Claude error ${res.status}`); }
  const reply = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  history.push({ role: 'assistant', content: [{ type: 'text', text: reply }] });
  return reply;
}
