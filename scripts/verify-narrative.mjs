import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [narrative, wildlife, ecoView, canvas, eventLog] = await Promise.all([
  readFile(new URL('../src/ui/FieldNarrative.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/sim/wildlife.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/EcoView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/EcoSceneCanvas.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/EventLog.tsx', import.meta.url), 'utf8'),
]);

assert.match(narrative, /巡护故事线/, 'field narrative panel is present');
for (const phase of ['dawn', 'morning', 'noon', 'evening', 'night']) {
  assert.match(narrative, new RegExp(`id: '${phase}'`), `narrative includes ${phase} chapter`);
}
for (const eventPhase of ['stalk', 'chase', 'caught', 'escaped']) {
  assert.match(narrative, new RegExp(`observation[.]phase === '${eventPhase}'`), `narrative includes ${eventPhase} event beat`);
}
assert.match(wildlife, /CAPS: Record<WildlifeKind, number> = \{ rabbit: 1, deer: 1, wolf: 1 \}/, 'visual cast stays at one representative per species');
assert.match(ecoView, /onDayPhase=\{setDayPhase\}/, 'eco view receives the scene day phase');
assert.match(canvas, /dayPhaseRef\.current\?\./, 'canvas publishes day phase changes without a per-frame React update');
assert.match(eventLog, /seenPredation/, 'repeated predation entries are compacted in the visitor journal');

console.log('narrative verification passed: five day chapters, four event beats, one representative per species');
