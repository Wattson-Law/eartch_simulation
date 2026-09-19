import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/ui/sceneEnvironment.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { CLOUDS, cloudPosition, FISH_ROUTES, fishPosition, fitFishRoutes } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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
