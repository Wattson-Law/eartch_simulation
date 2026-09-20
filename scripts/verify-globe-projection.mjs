import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/ui/globeProjection.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});
const { TAU, YELLOWSTONE, VIEW_LATITUDE, wrapAngle, projectLocation, createGlobeLookup, renderGlobeTexture } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const spaceSource = await readFile(new URL('../src/ui/spaceBackdrop.ts', import.meta.url), 'utf8');
const spaceOutput = ts.transpileModule(spaceSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
}).outputText;
const { SPACE_STAR_COUNT, SPACE_STAR_LAYERS, spaceStarPosition } =
  await import(`data:text/javascript;base64,${Buffer.from(spaceOutput).toString('base64')}`);

assert.equal(SPACE_STAR_LAYERS.length, 3, 'Space must retain separate far, middle, and near star layers');
assert.ok(SPACE_STAR_COUNT >= 120, 'Space backdrop needs enough stars to read at mobile and desktop sizes');
for (const layer of SPACE_STAR_LAYERS) for (const star of layer.stars) {
  assert.ok(star.x >= 0 && star.x < 1 && star.y >= 0 && star.y < 1, 'Generated stars must remain normalized');
  assert.ok(star.radius > 0 && star.alpha > 0 && star.alpha <= 1, 'Generated stars need visible bounded styling');
  const position = spaceStarPosition(star, layer, 120, -2.3);
  assert.ok(position.x >= 0 && position.x < 1 && position.y >= 0 && position.y < 1, 'Moving stars must wrap inside the viewport');
}
const parallaxStar = SPACE_STAR_LAYERS[2].stars[0];
const parallaxLayer = SPACE_STAR_LAYERS[2];
const parallaxA = spaceStarPosition(parallaxStar, parallaxLayer, 0, 0);
const parallaxB = spaceStarPosition(parallaxStar, parallaxLayer, 0, 0.5);
assert.notEqual(parallaxA.x, parallaxB.x, 'Near stars must respond to globe longitude with parallax');

assert.ok(Math.abs(wrapAngle(TAU)) < 1e-12, 'Full turns should wrap to zero');
assert.ok(Math.abs(wrapAngle(-TAU)) < 1e-12, 'Negative full turns should wrap to zero');
assert.ok(wrapAngle(Math.PI) < 0, 'Positive pi should use the half-open interval');
assert.ok(Math.abs(wrapAngle(-Math.PI) + Math.PI) < 1e-12, 'Negative pi should remain the interval start');
assert.ok(Math.abs(wrapAngle(TAU - 0.02) + 0.02) < 1e-12, 'Wrapped angles should remain continuous near the seam');

const center = projectLocation(0.8, VIEW_LATITUDE, 0.8);
assert.ok(Math.abs(center.x) < 1e-12 && Math.abs(center.y) < 1e-12, 'The view center should project to screen center');
assert.ok(Math.abs(center.z - 1) < 1e-12 && center.visible, 'The view center should be fully visible');
const horizon = projectLocation(Math.PI / 2, 0, 0, 0);
assert.ok(Math.abs(horizon.z) < 1e-12 && horizon.visible, 'The horizon should remain visible at z=0');
const back = projectLocation(Math.PI, 0, 0, 0);
assert.ok(back.z < 0 && !back.visible, 'The far side should be hidden');
const landmark = projectLocation(YELLOWSTONE.longitude, YELLOWSTONE.latitude, YELLOWSTONE.longitude);
assert.ok(landmark.visible && Math.abs(landmark.x) < 1e-12, 'Yellowstone should align with the central meridian');

const size = 64;
const textureWidth = 128;
const textureHeight = 64;
const texture = new Uint8ClampedArray(textureWidth * textureHeight * 4);
for (let y = 0; y < textureHeight; y++) {
  for (let x = 0; x < textureWidth; x++) {
    const pixel = (y * textureWidth + x) * 4;
    texture[pixel] = x;
    texture[pixel + 1] = y;
    texture[pixel + 2] = (x + y) & 255;
    texture[pixel + 3] = 255;
  }
}
const lookup = createGlobeLookup(size, textureWidth, textureHeight);
const target = new Uint8ClampedArray(size * size * 4);
renderGlobeTexture(target, texture, lookup, 0);
const centerPixel = ((size / 2 | 0) * size + (size / 2 | 0)) * 4;
assert.equal(target[centerPixel + 3], 255, 'Globe center should be opaque');
assert.equal(target[3], 0, 'Corner outside the globe should be transparent');

const oddSize = 65;
const oddLookup = createGlobeLookup(oddSize, textureWidth, textureHeight);
const oddTarget = new Uint8ClampedArray(oddSize * oddSize * 4);
renderGlobeTexture(oddTarget, texture, oddLookup, 0);
const oddCenter = ((oddSize / 2 | 0) * oddSize + (oddSize / 2 | 0)) * 4;
const expectedSourceX = textureWidth / 2 - 0.5;
const expectedSourceY = oddLookup.textureRow[oddSize * (oddSize / 2 | 0) + (oddSize / 2 | 0)];
const expectedShade = oddLookup.shade[oddSize * (oddSize / 2 | 0) + (oddSize / 2 | 0)];
assert.ok(Math.abs(oddTarget[oddCenter] - Math.round(expectedSourceX * expectedShade)) <= 1, 'Odd-size center should sample the central source longitude');
assert.ok(Math.abs(oddTarget[oddCenter + 1] - Math.round(expectedSourceY * expectedShade)) <= 1, 'Odd-size center should sample the precomputed source latitude row');

const adjacent = new Uint8ClampedArray(target.length);
renderGlobeTexture(adjacent, texture, lookup, 0.01);
let difference = 0;
for (let i = 0; i < target.length; i++) difference += Math.abs(target[i] - adjacent[i]);
assert.ok(difference > 0, 'Adjacent rotation angles should produce different pixels');

const wrapped = new Uint8ClampedArray(target.length);
renderGlobeTexture(wrapped, texture, lookup, TAU);
for (let i = 0; i < target.length; i++) assert.equal(wrapped[i], target[i], 'A full turn should reproduce the same raster');

const seamTexture = new Uint8ClampedArray(texture.length);
for (let y = 0; y < textureHeight; y++) {
  for (let x = 0; x < textureWidth; x++) {
    const pixel = (y * textureWidth + x) * 4;
    seamTexture[pixel] = Math.round(128 + 90 * Math.sin((x / textureWidth) * TAU));
    seamTexture[pixel + 1] = 170;
    seamTexture[pixel + 2] = 120;
    seamTexture[pixel + 3] = 255;
  }
}
const seamLeft = new Uint8ClampedArray(oddTarget.length);
const seamRight = new Uint8ClampedArray(oddTarget.length);
const seamEpsilon = 1e-5;
renderGlobeTexture(seamLeft, seamTexture, oddLookup, Math.PI - seamEpsilon);
renderGlobeTexture(seamRight, seamTexture, oddLookup, -Math.PI + seamEpsilon);
let seamDifference = 0;
for (let i = 0; i < seamLeft.length; i++) seamDifference = Math.max(seamDifference, Math.abs(seamLeft[i] - seamRight[i]));
assert.ok(seamDifference <= 2, 'Raster output should remain continuous across the wrapped texture seam');

console.log(`globe projection verification passed: projection landmarks, wrapped sampling, ${SPACE_STAR_COUNT} layered stars, shading, and antialiased bounds`);
