import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/ui/sceneEnvironment.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const {
  CLOUDS,
  cloudPosition,
  FISH_ROUTES,
  fishPosition,
  fitFishRoutes,
  advanceSeasonVisual,
  advanceDayVisual,
  dayPhasePosition,
  dayPhaseAt,
  dayPhaseLabel,
  dayPaletteAt,
  environmentPaletteAt,
  approachVisual,
  seasonPaletteAt,
  rgba,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

assert.equal(advanceSeasonVisual(0, 'winter', 0), 0, 'A zero visual delta must keep the season position still');
assert.ok(advanceSeasonVisual(3.8, 'spring', 0.25) > 3.8, 'Season interpolation should take the short wrapped path');
assert.equal(dayPhasePosition('dawn'), 0, 'Dawn must anchor the day cycle');
assert.equal(dayPhaseAt(4.99), 'night', 'Day phase lookup must wrap continuously at the cycle edge');
assert.equal(dayPhaseLabel('evening'), '傍晚', 'Day phase labels must remain user-facing and localized');
assert.equal(advanceDayVisual(0, 'dawn', 0), 0, 'A zero visual delta must keep the day position still');
assert.ok(advanceDayVisual(4.8, 'dawn', 0.25) > 4.8, 'Day interpolation should take the short wrapped path');
assert.ok(approachVisual(0, 1, 0.4, 3) > 0 && approachVisual(0, 1, 0.4, 3) < 1, 'Visual approach must stay below its target');
assert.ok(approachVisual(1, 0, 0.4, 3) > 0 && approachVisual(1, 0, 0.4, 3) < 1, 'Visual approach must stay above its target');
for (const position of [0, 0.5, 1.5, 2.5, 3.99, -0.25]) {
  const palette = seasonPaletteAt(position);
  for (const channel of [...palette.skyTop, ...palette.skyBottom, ...palette.far, ...palette.near, ...palette.carpet]) {
    assert.ok(channel >= 0 && channel <= 255, 'Interpolated colour channels stay in byte range');
  }
  assert.ok(palette.snow >= 0 && palette.snow <= 1, 'Snow interpolation stays within 0–1');
}
for (const position of [0, 0.5, 1.5, 2.5, 3.99, 4.99, -0.25]) {
  const palette = dayPaletteAt(position);
  for (const channel of [
    ...palette.skyTop, ...palette.skyBottom, ...palette.farLight, ...palette.nearLight,
    ...palette.cloud, ...palette.sun, ...palette.moon, ...palette.horizonGlow,
  ]) {
    assert.ok(channel >= 0 && channel <= 255, 'Daylight colour channels stay in byte range');
  }
  for (const value of [
    palette.cloudAlpha, palette.sunAlpha, palette.moonAlpha, palette.starAlpha,
    palette.horizonGlowAlpha, palette.ambientLight, palette.shadow, palette.warmth,
  ]) {
    assert.ok(value >= 0 && value <= 1, 'Daylight opacity and lighting values stay normalized');
  }
  assert.ok(palette.sunElevation >= -1 && palette.sunElevation <= 1, 'Sun elevation stays normalized');
}
assert.ok(dayPaletteAt(2).sunAlpha > dayPaletteAt(4).sunAlpha, 'Noon must be brighter than night');
assert.ok(dayPaletteAt(4).starAlpha > dayPaletteAt(2).starAlpha, 'Night must expose stars');
const merged = environmentPaletteAt(1.5, 2);
assert.ok(merged.skyTop[2] > merged.skyTop[0], 'Merged noon sky keeps a cool blue bias');
assert.ok(merged.far[0] >= 0 && merged.far[0] <= 255, 'Merged seasonal/day palette remains valid');
assert.equal(rgba([12.4, 34.6, 255.2], 1.4), 'rgba(12,35,255,1)', 'RGBA helper clamps alpha and rounds channels');

for (const [index, cloud] of CLOUDS.entries()) {
  assert.ok(cloudPosition(index, 10) - cloudPosition(index, 0) > .025, 'Cloud motion must be visible over ten seconds');
  const wrap = (1 + cloud.width / 2 - cloud.start) / cloud.speed;
  assert.ok(cloudPosition(index, wrap - .001) - cloud.width / 2 > .999, 'Cloud wrapped before its trailing edge left the screen');
  assert.ok(cloudPosition(index, wrap + .001) + cloud.width / 2 < .001, 'Cloud reappeared inside the screen');
}
assert.equal(fitFishRoutes(() => false).length, 0, 'Never place fish on land');
assert.equal(fitFishRoutes(() => true).length, FISH_ROUTES.length, 'Unobstructed routes should remain available');
for (const route of FISH_ROUTES) {
  const start = fishPosition(route, 0);
  const end = fishPosition(route, Math.PI * 2 / route.speed);
  assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-9, 'Swim loop has a positional seam');
  assert.ok(Math.hypot(start.dx - end.dx, start.dy - end.dy) < 1e-9, 'Swim loop has a heading seam');
  let previous = start;
  for (let frame = 1; frame <= 3600; frame++) {
    const position = fishPosition(route, frame / 60);
    assert.ok(Math.hypot(position.x - previous.x, position.y - previous.y) < .0004, 'Fish jumped between adjacent frames');
    assert.ok(Math.hypot(position.dx, position.dy) > 0, 'Fish heading became undefined');
    previous = position;
  }
}
const manifest = JSON.parse(await readFile(new URL('../public/assets/ecosystem-v1/manifest.json', import.meta.url), 'utf8'));
let smoothClips = 0;
for (const actions of Object.values(manifest.animals)) for (const [action, clip] of Object.entries(actions)) {
  if (action === 'idle') continue;
  assert.ok(clip.frames >= 32, 'Locomotion and gestures require intermediate poses');
  assert.equal(clip.frames / clip.fps, clip.source.frames / clip.source.fps, 'Interpolation must preserve cycle duration');
  assert.ok(clip.source.src.startsWith('animals/'), 'Rebuilding must not interpolate previously interpolated assets');
  assert.equal(clip.anchor.y, .91015625, 'Feet must retain the approved ground anchor');
  const png = await readFile(new URL(`../public/assets/ecosystem-v1/${clip.src}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), clip.frameW * clip.frames, 'Sprite strip width disagrees with metadata');
  assert.equal(png.readUInt32BE(20), clip.frameH, 'Sprite strip height disagrees with metadata');
  smoothClips++;
}
assert.equal(smoothClips, 9);
console.log(`environment verification passed: ${CLOUDS.length} cloud wraps, ${FISH_ROUTES.length} continuous swim routes, ${smoothClips} smooth clips`);
