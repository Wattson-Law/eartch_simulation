import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../src/assetsPaths.ts', import.meta.url), 'utf8');
const browserPatchedSource = source.replaceAll('import.meta.env.BASE_URL', "'/'");
const { outputText } = ts.transpileModule(browserPatchedSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});

const encoded = Buffer.from(`${outputText}\n//# sourceURL=${pathToFileURL('src/assetsPaths.ts').href}`).toString('base64');
const { drawSheetFrame, drawSheetFrameAnchored } = await import(`data:text/javascript;base64,${encoded}`);

function createContext() {
  const calls = [];
  return {
    calls,
    save() {
      calls.push(['save']);
    },
    restore() {
      calls.push(['restore']);
    },
    translate(x, y) {
      calls.push(['translate', x, y]);
    },
    scale(x, y) {
      calls.push(['scale', x, y]);
    },
    drawImage(...args) {
      calls.push(['drawImage', ...args]);
    },
  };
}

function lastDrawImage(ctx) {
  return ctx.calls.findLast(([name]) => name === 'drawImage');
}

const image = { src: 'sheet.png' };
const meta = {
  src: 'sheet.png',
  frameW: 10,
  frameH: 8,
  frames: 4,
  anchor: { x: 0.25, y: 0.75 },
};

{
  const ctx = createContext();
  drawSheetFrame(ctx, image, meta, 1.9, 3, 4, 2);
  assert.deepEqual(lastDrawImage(ctx).slice(2, 6), [10, 0, 10, 8], 'fractional frame floors before sampling');
}

{
  const ctx = createContext();
  drawSheetFrame(ctx, image, meta, -0.2, 3, 4, 2);
  assert.deepEqual(lastDrawImage(ctx).slice(2, 6), [30, 0, 10, 8], 'negative fractional frame wraps after flooring');
}

{
  const ctx = createContext();
  drawSheetFrame(ctx, image, meta, 4.6, 3, 4, 2);
  assert.deepEqual(lastDrawImage(ctx).slice(2, 6), [0, 0, 10, 8], 'fractional overflow loops to the first frame');
}

{
  const ctx = createContext();
  drawSheetFrameAnchored(ctx, image, meta, 0, 100, 80, 2, false);
  assert.deepEqual(lastDrawImage(ctx).slice(6, 10), [95, 68, 20, 16], 'non-flipped anchor places the anchor point at world coordinates');
}

{
  const ctx = createContext();
  drawSheetFrameAnchored(ctx, image, meta, 0, 100, 80, 2, true);
  assert.deepEqual(
    ctx.calls.slice(1, 4),
    [
      ['translate', 105, 68],
      ['scale', -1, 1],
      ['drawImage', image, 0, 0, 10, 8, 0, 0, 20, 16],
    ],
    'flipped non-center anchor mirrors around the same world anchor',
  );
}

console.log('sprite frame math regression passed');
