// Drill library, tagged by the faults grade.js detects.
// Videos open a YouTube search for the drill so you always get current, working videos.
export const DRILLS = [
  { name: 'Wall Butt Drill', tags: ['early-extension', 'spine'], steps: ['Set up with your butt touching a wall.', 'Make slow swings keeping your butt on the wall through impact.', 'Feel the lead glute stay on the wall as you rotate.'] },
  { name: 'Chair Drill', tags: ['early-extension'], steps: ['Put a chair behind you touching your backside.', 'Swing without losing contact through impact.'] },
  { name: 'Head Against Wall Drill', tags: ['head'], steps: ['Face a wall, head lightly touching a towel on the wall.', 'Make backswing turns without the head leaving the towel.'] },
  { name: 'Shadow Drill', tags: ['head'], steps: ['Stand with the sun behind you.', 'Watch your head\'s shadow — keep it on a ball/tee during the swing.'] },
  { name: 'Alignment Stick Hip Drill', tags: ['sway'], steps: ['Push an alignment stick into the ground just outside your trail hip.', 'Turn back without bumping the stick.'] },
  { name: 'Trail Foot Flare / Pressure Drill', tags: ['sway', 'turn'], steps: ['Flare trail foot slightly.', 'Feel pressure on the inside of the trail foot at the top — never the outside.'] },
  { name: 'Cross-Arm Turn Drill', tags: ['turn'], steps: ['Cross arms on chest holding a club.', 'Turn until the club points at the ball, then turn through to face target.'] },
  { name: 'Pump Drill', tags: ['tempo', 'over-the-top'], steps: ['Swing to the top, pump down halfway twice.', 'On the third, hit the ball. Trains a smooth, shallow transition.'] },
  { name: '3:1 Tempo Count', tags: ['tempo'], steps: ['Count "one-two-three" to the top, "four" at impact.', 'Use a metronome app at ~ 72 bpm.'] },
  { name: 'Feet Together Drill', tags: ['tempo', 'weight', 'sway'], steps: ['Hit half shots with feet touching.', 'Forces balance and rhythm — no lunging.'] },
  { name: 'Step-Through Drill', tags: ['weight'], steps: ['Hit a shot and let the trail foot step toward the target after impact.', 'Trains full weight transfer.'] },
  { name: 'Hold Your Finish (3 sec)', tags: ['weight'], steps: ['After every shot, hold the finish for 3 seconds.', 'Belt buckle facing target, trail toe only on the ground.'] },
  { name: 'Headcover Outside Ball', tags: ['over-the-top', 'path'], steps: ['Place a headcover just outside and behind the ball.', 'Swing without hitting it — forces an inside path.'] },
  { name: 'Gate Drill', tags: ['path', 'over-the-top'], steps: ['Two tees just wider than the clubhead around the ball.', 'Swing through the gate cleanly.'] },
  { name: 'Split Hand Drill', tags: ['path', 'release'], steps: ['Grip with hands 3 inches apart.', 'Feel the forearms rotate and the club release past the hands.'] },
  { name: 'Towel Under Arms', tags: ['path', 'turn'], steps: ['Tuck a towel under both armpits.', 'Hit half shots without dropping it — connects arms and body.'] },
  { name: 'Lead Wrist Bow Drill', tags: ['slice', 'release'], steps: ['At the top, feel the lead wrist flat or slightly bowed.', 'Hold that through impact for a square face.'] },
  { name: 'Strong Grip Check', tags: ['slice'], steps: ['See 2-3 knuckles on lead hand at address.', 'V\'s point at trail shoulder.'] },
  { name: 'Low Point Line Drill', tags: ['contact'], steps: ['Draw a line in the sand or spray a line.', 'Make divots that start on the target side of the line.'] },
  { name: 'Pause at the Top', tags: ['tempo', 'over-the-top'], steps: ['Swing to the top, pause 1 second.', 'Start down with the lower body first.'] },
];

export const FAULTS = { all: 'All', head: 'Head', 'early-extension': 'Early ext.', sway: 'Sway', turn: 'Turn', tempo: 'Tempo', weight: 'Weight', 'over-the-top': 'Over the top', path: 'Path', slice: 'Slice', release: 'Release', contact: 'Contact' };

export const videoUrl = d => `https://www.youtube.com/results?search_query=${encodeURIComponent(d.name + ' golf drill')}`;
export const shortsUrl = d => `https://www.youtube.com/results?search_query=${encodeURIComponent(d.name + ' golf drill #shorts')}`;

export function suggest(metrics, n = 4) {
  const weak = [...metrics].sort((a, b) => a.score - b.score).filter(m => m.score < 8).slice(0, 3);
  const out = [];
  weak.forEach(m => DRILLS.filter(d => d.tags.includes(m.fault)).forEach(d => !out.includes(d) && out.push({ ...d, why: m.name })));
  return out.slice(0, n);
}
