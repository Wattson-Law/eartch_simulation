import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const transition = await read('src/ui/GlobeToEcoTransition.tsx');
const scene = await read('src/ui/EcoSceneCanvas.tsx');
const css = await read('src/App.css');

assert.match(transition, /data-transition=\{phase\}/, 'Globe-to-eco transition must expose its phase for QA');
assert.match(transition, /正在接近黄石/, 'Orbital handoff needs a readable arrival cue');
assert.match(transition, /进入黄石生态区/, 'Eco arrival needs a readable destination cue');
assert.match(app, /const arrival = window\.setTimeout\([^]*?, 380\)/, 'The globe must hold the orbital phase before swapping views');
assert.match(app, /const finish = window\.setTimeout\([^]*?, 1180\)/, 'The arrival phase must have a bounded cleanup timer');
assert.match(app, /clearTimeout\(timer\)/, 'Transition timers must be cancelled on cleanup and return');
assert.match(app, /document\.hidden \|\| viewRef\.current !== 'eco'/, 'The ecosystem clock must pause outside a visible Yellowstone view');
assert.match(scene, /advanceSeasonVisual\(visualSeason/, 'Season changes must use a continuous visual position');
assert.match(scene, /approachVisual\(visualRain/, 'Rainfall must ease toward its target');
assert.match(scene, /approachVisual\(visualFire/, 'Fire coverage must ease toward its target');
assert.match(scene, /activity === 'feed'/, 'Feed activity must have a dedicated visual gesture');
assert.match(scene, /activityName === 'caught'/, 'Caught activity must have a dedicated visual pose');
assert.match(scene, /cartoonCaught/, 'Only the caught rabbit receives the cartoon X-eye overlay');
assert.match(scene, /activityName === 'sit'/, 'Sit activity must have a dedicated stationary pose');
assert.match(scene, /environmentPaletteAt\(visualSeason, visualDay\)/, 'Season and day lighting must blend continuously');
assert.match(scene, /advanceDayVisual\(visualDay/, 'Daylight changes must use a continuous visual position');
assert.match(scene, /dayPaletteAt\(visualDay\)/, 'Renderer must consume the day palette');
assert.match(scene, /rainStrength/, 'Rain telemetry must expose a continuous intensity');
assert.match(scene, /snowStrength/, 'Snow telemetry must expose a continuous intensity');
assert.match(scene, /const motionScale = reducedMotion \? 0\.28 : 1/, 'Reduced-motion preference must slow presentation instead of freezing it');
assert.match(scene, /const ambientDelta = !document\.hidden \? delta \* motionScale : 0/, 'Ambient presentation clock must stop only for hidden documents');
assert.match(scene, /drawCritterSheet\(target, agent, x, y, w, elapsed, ambientDelta\)/, 'Idle animal frames must keep breathing while ecology time is paused');
assert.match(scene, /const generatedIdleSheets: Partial<Record<EcosystemAnimal/, 'Generated idle sheets must be retained for style-safe action fallback');
assert.match(scene, /const generatedIdle = generatedIdleSheet\(kind\);/, 'Missing generated action sheets must fall back to the canonical generated idle art');
assert.match(scene, /runtime: \{/, 'Development telemetry must expose animation runtime state');
assert.match(css, /@keyframes transition-orbit-zoom/, 'Orbital handoff needs a zoom animation');
assert.match(css, /@keyframes eco-view-arrival/, 'Eco view needs an arrival animation');

console.log('visual transition verification passed: orbit/arrival handoff, eased weather, and explicit wildlife gestures');
