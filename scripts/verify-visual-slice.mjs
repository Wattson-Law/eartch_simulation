import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// The browser build resolves TypeScript imports for us. The verification
// script keeps the repository dependency-free by compiling the two simulation
// modules into a short-lived pair of ES modules in the system temp folder.
const wildlifeSource = await readFile(new URL('../src/sim/wildlife.ts', import.meta.url), 'utf8');
const visualSource = await readFile(new URL('../src/sim/visualSlice.ts', import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
}).outputText;
const tempModuleDir = await mkdtemp(join(tmpdir(), 'eartch-visual-slice-'));
const wildlifeModule = join(tempModuleDir, 'wildlife.mjs');
const visualModule = join(tempModuleDir, 'visualSlice.mjs');
await writeFile(wildlifeModule, transpile(wildlifeSource), 'utf8');
await writeFile(visualModule, transpile(visualSource.replace("from './wildlife'", "from './wildlife.mjs'")), 'utf8');
const visualSlice = await import(pathToFileURL(visualModule).href);
const wildlife = await import(pathToFileURL(wildlifeModule).href);
await rm(tempModuleDir, { recursive: true, force: true });
const {
  WILDLIFE_LABELS,
  createVisualSlice,
  stepVisualSlice,
} = visualSlice;
const { isRiverWater, isWalkable } = wildlife;

function state(overrides = {}) {
  return {
    grass: 5000,
    shrubs: 1500,
    rabbits: 220,
    elk: 140,
    wolves: 20,
    season: 'summer',
    temperature: 20,
    rainfall: 0.35,
    fire: false,
    fireTicksLeft: 0,
    tick: 0,
    paused: false,
    log: [],
    history: [],
    lastPredation: null,
    nextLogId: 1,
    causalQueue: [],
    ...overrides,
  };
}

function snapshot(world) {
  return world.agents.map((agent) => ({
    id: agent.id,
    kind: agent.kind,
    x: Number(agent.x.toFixed(6)),
    y: Number(agent.y.toFixed(6)),
    vx: Number(agent.vx.toFixed(6)),
    vy: Number(agent.vy.toFixed(6)),
    activity: agent.activity,
    activityTime: Number(agent.activityTime.toFixed(6)),
    opacity: Number(agent.opacity.toFixed(6)),
    cover: Number((agent.cover ?? 0).toFixed(6)),
  }));
}

function run(world, seconds, simulationState, dt = 1 / 60, onFrame = () => {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-9;) {
    const step = Math.min(dt, seconds - elapsed);
    stepVisualSlice(world, step, simulationState);
    elapsed += step;
    onFrame(elapsed);
  }
}

{
  assert.equal(WILDLIFE_LABELS.wolf, '灰狼', 'visual slice keeps the approved species label');
  const simulationState = state();
  const world = createVisualSlice(simulationState);
  assert.deepEqual(
    world.agents.map(({ id, kind }) => ({ id, kind })),
    [
      { id: 'rabbit-1', kind: 'rabbit' },
      { id: 'deer-1', kind: 'deer' },
      { id: 'wolf-1', kind: 'wolf' },
    ],
    'the scene starts with one deterministic representative per species',
  );
  assert(world.agents.every((agent) => isWalkable(agent.x, agent.y)), 'seed tracks are on land');
  const macroBefore = JSON.stringify(simulationState);
  const activities = new Set();
  const initialPositions = new Map(world.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]));
  const maxDisplacementByKind = new Map();
  let maxFrameJump = 0;
  let previous = new Map(world.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]));
  run(world, 34, simulationState, 1 / 60, () => {
    for (const agent of world.agents) {
      activities.add(agent.activity);
      const before = previous.get(agent.id);
      if (before) maxFrameJump = Math.max(maxFrameJump, Math.hypot(agent.x - before.x, agent.y - before.y));
      previous.set(agent.id, { x: agent.x, y: agent.y });
      const initial = initialPositions.get(agent.id);
      if (initial) {
        const displacement = Math.hypot(agent.x - initial.x, agent.y - initial.y);
        maxDisplacementByKind.set(agent.kind, Math.max(maxDisplacementByKind.get(agent.kind) ?? 0, displacement));
      }
      assert.equal(isRiverWater(agent.x, agent.y), false, `${agent.id} remains outside the river`);
    }
    assert.equal(new Set(world.agents.map((agent) => agent.kind)).size, world.agents.length, 'no duplicate representatives');
  });
  assert(activities.has('hide') && activities.has('emerge'), 'the rabbit has a visible cover transition');
  assert(activities.has('sit'), 'the stage includes a stationary seated beat');
  assert(activities.has('roam') || activities.has('drink'), 'the stage includes slow translation');
  for (const kind of ['rabbit', 'deer', 'wolf']) {
    assert((maxDisplacementByKind.get(kind) ?? 0) > 0.003, `${kind} has a visible but bounded observation line`);
  }
  assert(maxFrameJump < 0.001, `ambient frame jump stays slow (${maxFrameJump.toFixed(6)})`);
  assert.equal(JSON.stringify(simulationState), macroBefore, 'visual stepping never mutates the macro JSON state');
}

{
  const simulationState = state({ paused: true });
  const world = createVisualSlice(simulationState);
  const before = JSON.stringify({ agents: snapshot(world), time: world.time, observation: world.observation, event: world.event });
  stepVisualSlice(world, 5, simulationState);
  assert.equal(JSON.stringify({ agents: snapshot(world), time: world.time, observation: world.observation, event: world.event }), before, 'paused visual state stays stable');
}

{
  const simulationState = state();
  const thirty = createVisualSlice(simulationState);
  const sixty = createVisualSlice(simulationState);
  run(thirty, 12, simulationState, 1 / 30);
  run(sixty, 12, simulationState, 1 / 60);
  for (const agent of thirty.agents) {
    const matching = sixty.agents.find((candidate) => candidate.id === agent.id);
    assert(matching, `partition test keeps ${agent.id}`);
    assert(Math.hypot(agent.x - matching.x, agent.y - matching.y) < 0.003, `30/60 fps partition remains close for ${agent.id}`);
  }
}

{
  const simulationState = state({ tick: 4, lastPredation: { prey: 'rabbits', amount: 1 } });
  const world = createVisualSlice(simulationState);
  const stages = new Set();
  let maxEventJump = 0;
  let previous = new Map(world.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]));
  run(world, 8, simulationState, 1 / 60, () => {
    if (world.event) stages.add(world.event.stage);
    for (const agent of world.agents) {
      const before = previous.get(agent.id);
      if (before) maxEventJump = Math.max(maxEventJump, Math.hypot(agent.x - before.x, agent.y - before.y));
      previous.set(agent.id, { x: agent.x, y: agent.y });
    }
  });
  assert(stages.has('stalk') && stages.has('chase') && stages.has('caught') && stages.has('escaped'), 'predation is a readable staged event');
  assert(maxEventJump < 0.001, `predation never teleports a sprite (${maxEventJump.toFixed(6)})`);
  assert.equal(world.event, null, 'predation stage returns control to the routine FSM');
  assert.equal(simulationState.rabbits, 220, 'predation animation does not decrement the macro population');
}

{
  const simulationState = state({ tick: 5, lastPredation: { prey: 'rabbits', amount: 1 } });
  const world = createVisualSlice(simulationState);
  stepVisualSlice(world, 1 / 60, simulationState);
  assert(world.event, 'a reported encounter enters the visual event FSM');
  simulationState.fire = true;
  stepVisualSlice(world, 1 / 60, simulationState);
  assert.equal(world.event, null, 'a fire event takes ownership of the visual stage');
  assert(world.agents.every((agent) => agent.kind === 'wolf' ? agent.activity === 'alert' : agent.activity === 'hide'), 'fire applies a quiet hide/alert posture');
  simulationState.fire = false;
  run(world, 8, simulationState);
  assert.equal(world.event, null, 'a canceled encounter is not replayed after the fire clears');
}

{
  const simulationState = state({ rabbits: 0, elk: 0, wolves: 0 });
  const world = createVisualSlice(simulationState);
  stepVisualSlice(world, 1, simulationState);
  assert.equal(world.agents.length, 0, 'empty macro populations produce no visual representatives');
  simulationState.rabbits = 10;
  stepVisualSlice(world, 1 / 60, simulationState);
  assert.deepEqual(world.agents.map(({ id }) => id), ['rabbit-1'], 'representatives reconcile when a species becomes visible');
}

console.log('visual slice verification passed: deterministic cast, bounded motion, staged predation, and macro isolation');
