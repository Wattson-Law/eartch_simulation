import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../src/sim/wildlife.ts', import.meta.url), 'utf8');
const stripped = source.replace("import type { EcosystemState } from './types';", '');
const { outputText } = ts.transpileModule(stripped, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});

const encoded = Buffer.from(`${outputText}\n//# sourceURL=${pathToFileURL('src/sim/wildlife.ts').href}`).toString('base64');
const wildlife = await import(`data:text/javascript;base64,${encoded}`);
const {
  WILDLIFE_COVER_PATCHES,
  WILDLIFE_ACTIVITY_LABELS,
  WILDLIFE_LABELS,
  createWildlifeWorld,
  isWalkable,
  stepWildlife,
} = wildlife;

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
  return world.agents.map((a) => ({
    id: a.id,
    kind: a.kind,
    x: Number(a.x.toFixed(6)),
    y: Number(a.y.toFixed(6)),
    vx: Number(a.vx.toFixed(6)),
    vy: Number(a.vy.toFixed(6)),
    activity: a.activity,
    activityTime: Number(a.activityTime.toFixed(6)),
    gait: Number(a.gait.toFixed(6)),
    opacity: Number(a.opacity.toFixed(6)),
    cover: Number((a.cover ?? 0).toFixed(6)),
  }));
}

function run(world, seconds, s, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepWildlife(world, Math.min(dt, seconds - t), s);
}

function visualDistance(a, b) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * (9 / 16));
}

function pointCoverDepth(x, y) {
  let depth = 0;
  for (const patch of WILDLIFE_COVER_PATCHES) {
    const d = Math.hypot((x - patch.x) / patch.rx, (y - patch.y) / patch.ry);
    if (d < 1) depth = Math.max(depth, Math.max(0, Math.min(1, (1 - d) / 0.55)));
  }
  return depth;
}

function sampleWalkablePositions() {
  const samples = [
    { x: 0.68, y: 0.64 },
    { x: 0.84, y: 0.73 },
    { x: 0.88, y: 0.76 },
  ];
  for (let y = 0.64; y <= 0.84 + 1e-9; y += 0.04) {
    for (let x = 0.16; x <= 0.9 + 1e-9; x += 0.08) {
      if (isWalkable(x, y)) samples.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
      if (samples.length >= 41) return samples;
    }
  }
  return samples;
}

function forceRecoverCaught(kind, position) {
  const s = state({ rabbits: kind === 'rabbit' ? 220 : 0, elk: kind === 'deer' ? 140 : 0, wolves: 20 });
  const world = createWildlifeWorld(s);
  const prey = world.agents.find((a) => a.kind === kind);
  const predator = world.agents.find((a) => a.kind === 'wolf');
  assert(prey && predator, `forced ${kind} recovery has predator and prey`);
  prey.x = position.x;
  prey.y = position.y;
  prey.vx = 0;
  prey.vy = 0;
  prey.opacity = 0;
  prey.cover = pointCoverDepth(prey.x, prey.y);
  prey.coverId = undefined;
  prey.activity = 'hide';
  prey.activityTime = 0;
  prey.targetId = predator.id;
  predator.targetId = prey.id;
  world.time = 0;
  world.nextHuntAt = 999;
  world.hunt = {
    predatorId: predator.id,
    preyId: prey.id,
    preyKind: kind,
    phase: 'recoverCaught',
    elapsed: 0,
    macroBacked: true,
    consumedTick: 99,
  };
  return { s, world, preyId: prey.id };
}

{
  assert.equal(WILDLIFE_LABELS.wolf, '灰狼', 'species labels remain separate');
  assert.equal(WILDLIFE_ACTIVITY_LABELS.pounce, '扑击', 'activity labels export for renderer');
  assert.equal(WILDLIFE_ACTIVITY_LABELS.emerge, '探出', 'cover emergence label is exported');
  assert.deepEqual(
    WILDLIFE_COVER_PATCHES.map(({ id, x, y, rx, ry }) => ({ id, x, y, rx, ry })),
    [
      { id: 'left-tall-grass', x: 0.3, y: 0.785, rx: 0.16, ry: 0.065 },
      { id: 'right-rushes', x: 0.855, y: 0.745, rx: 0.055, ry: 0.045 },
    ],
    'cover patch geometry stays stable for renderer occlusion',
  );
}

{
  const s = state();
  const world = createWildlifeWorld(s);
  assert.deepEqual(
    world.agents.reduce((counts, a) => ({ ...counts, [a.kind]: (counts[a.kind] ?? 0) + 1 }), {}),
    { rabbit: 4, deer: 2, wolf: 2 },
    'fixed representative caps are independent of viewport',
  );
  const macroBefore = { rabbits: s.rabbits, elk: s.elk, wolves: s.wolves };
  run(world, 20, s);
  const maxHomeDisplacement = Math.max(...world.agents.map((a) => Math.hypot(a.x - a.homeX, a.y - a.homeY)));
  assert(maxHomeDisplacement > 0.05, 'agents show real translation across the meadow');
  assert(world.agents.every((a) => isWalkable(a.x, a.y)), 'agents stay on allowed land');
  assert(world.agents.some((a) => a.gait > 0.4), 'gait is driven by actual traveled distance');
  assert.deepEqual({ rabbits: s.rabbits, elk: s.elk, wolves: s.wolves }, macroBefore, 'visual world never mutates macro populations');
}

{
  const s = state({ paused: true });
  const world = createWildlifeWorld(s);
  const before = JSON.stringify({ agents: snapshot(world), time: world.time, observation: world.observation, hunt: world.hunt });
  stepWildlife(world, 5, s);
  const afterPause = JSON.stringify({ agents: snapshot(world), time: world.time, observation: world.observation, hunt: world.hunt });
  assert.equal(afterPause, before, 'paused full visual state stays stable');
  s.paused = false;
  stepWildlife(world, 0, s);
  const afterZero = JSON.stringify({ agents: snapshot(world), time: world.time, observation: world.observation, hunt: world.hunt });
  assert.equal(afterZero, before, 'zero dt is stable');
}

{
  const s = state({ wolves: 0 });
  const world = createWildlifeWorld(s);
  const rabbit = world.agents.find((a) => a.id === 'rabbit-1');
  assert(rabbit, 'seed rabbit exists');
  assert.equal(rabbit.activity, 'hide', 'seed rabbit starts hidden in the grass');
  assert((rabbit.cover ?? 0) > 0.25, 'seed rabbit starts with meaningful grass cover');

  let emerged = false;
  let maxJump = 0;
  let previous = { x: rabbit.x, y: rabbit.y, cover: rabbit.cover ?? 0, opacity: rabbit.opacity };
  for (let frame = 0; frame < 60 * 5; frame++) {
    stepWildlife(world, 1 / 60, s);
    const current = world.agents.find((a) => a.id === 'rabbit-1');
    const jump = Math.hypot(current.x - previous.x, current.y - previous.y);
    maxJump = Math.max(maxJump, jump);
    emerged ||= current.activity === 'emerge' || ((current.cover ?? 0) < previous.cover - 0.04 && current.opacity > 0.99);
    previous = { x: current.x, y: current.y, cover: current.cover ?? 0, opacity: current.opacity };
  }

  const finalRabbit = world.agents.find((a) => a.id === 'rabbit-1');
  assert(emerged, 'rabbit begins an explicit emergence from grass within five seconds');
  assert((finalRabbit.cover ?? 0) < 0.2, 'rabbit physically exits to low grass cover');
  assert(maxJump <= 0.085 / 60 + 0.001, `emergence max frame jump ${maxJump} stays below rabbit emerge speed`);
  assert.equal(finalRabbit.opacity, 1, 'emerging rabbit stays opaque and relies on grass occlusion');
  assert(pointCoverDepth(finalRabbit.x, finalRabbit.y) < 0.2, 'final rabbit position is outside the cover ellipse');
}

{
  const s = state({ rabbits: 0, elk: 0, wolves: 0 });
  const world = createWildlifeWorld(s);
  assert.equal(world.agents.length, 0, 'zero populations create no representatives');
  stepWildlife(world, 1, s);
  assert.equal(world.agents.length, 0, 'zero populations remain empty after step');
  assert.match(world.observation.text, /没有可见动物/, 'quiet copy does not name absent species');
}

{
  const s = state({ fire: true, fireTicksLeft: 3 });
  const world = createWildlifeWorld(s);
  run(world, 2, s);
  assert(world.agents.every((a) => ['flee', 'hide'].includes(a.activity)), 'fire shifts animals into escape states');
  assert(world.agents.every((a) => isWalkable(a.x, a.y)), 'fire escape remains bounded');
  assert(world.agents.every((a) => a.activityTime > 0), 'fire activities advance their timers');
}

{
  const s = state({ rabbits: 0, elk: 140, wolves: 20, tick: 1, lastPredation: { prey: 'rabbits', amount: 1 } });
  const world = createWildlifeWorld(s);
  let caught = false;
  for (let i = 0; i < 60 * 12; i++) {
    stepWildlife(world, 1 / 60, s);
    caught ||= world.observation.phase === 'caught';
    assert.notEqual(world.hunt?.consumedTick, 1, 'unavailable rabbit event is never attributed to deer');
  }
  assert.equal(world.pendingPredation, null, 'unavailable preferred prey clears pending predation');
  assert.equal(caught, false, 'wrong-species macro event cannot create a successful catch');
}

{
  const s = state({ fire: true, fireTicksLeft: 3, tick: 1, lastPredation: { prey: 'rabbits', amount: 1 } });
  const world = createWildlifeWorld(s);
  stepWildlife(world, 1 / 60, s);
  assert.equal(world.pendingPredation, null, 'fire clears pending predation immediately');
  assert(world.agents.every((a) => a.targetId == null), 'fire clears stale predator/prey targets');
  s.fire = false;
  s.fireTicksLeft = 0;
  run(world, 8, s);
  assert.notEqual(world.hunt?.consumedTick, 1, 'fire-time predation event does not replay after fire');
}

{
  const s = state({ wolves: 0, tick: 1, lastPredation: { prey: 'rabbits', amount: 1 } });
  const world = createWildlifeWorld(s);
  stepWildlife(world, 1 / 60, s);
  assert.equal(world.pendingPredation, null, 'missing wolves clear pending predation');
  s.wolves = 20;
  run(world, 4, s);
  assert.notEqual(world.hunt?.consumedTick, 1, 'predation event seen while wolves were absent does not replay later');
}

{
  const peaceful = ['rest', 'roam', 'graze', 'drink', 'alert'];
  let foundSameActivityDecision = false;
  for (const activity of peaceful) {
    for (let advance = 0; advance < 12 && !foundSameActivityDecision; advance++) {
      const s = state({ wolves: 0 });
      const world = createWildlifeWorld(s);
      run(world, advance * 0.31, s);
      const agent = world.agents.find((a) => a.kind === 'rabbit');
      agent.activity = activity;
      agent.activityTime = 99;
      agent.goalX = -1;
      agent.goalY = -1;
      stepWildlife(world, 1 / 60, s);
      if (agent.activity === activity) {
        foundSameActivityDecision = true;
        assert(agent.activityTime <= 1 / 60 + 1e-9, 'same-activity ambient reroll still resets activityTime');
      }
    }
  }
  assert(foundSameActivityDecision, 'test found a deterministic same-activity ambient reroll');
}

{
  const s = state();
  const world = createWildlifeWorld(s);
  let escapedSeen = false;
  let quietAfterEscape = false;
  for (let i = 0; i < 60 * 14; i++) {
    stepWildlife(world, 1 / 60, s);
    escapedSeen ||= world.observation.phase === 'escaped';
    quietAfterEscape ||= escapedSeen && world.observation.phase === 'quiet';
  }
  assert(escapedSeen, 'unbacked hunt visibly escapes before quiet');
  assert(quietAfterEscape, 'unbacked ambient hunt returns to quiet before the next natural cycle');
}

{
  const samples = sampleWalkablePositions();
  assert.equal(samples.length, 41, 'forced recovery samples cover forty-one walkable points');
  const recoveries = [];
  for (const kind of ['rabbit', 'deer']) {
    for (const position of samples) {
      const { s, world, preyId } = forceRecoverCaught(kind, position);
      let maxJump = 0;
      let openGroundFade = false;
      let reachedCoverAt = null;
      let finishedAt = null;
      let previous = world.agents.find((a) => a.id === preyId);
      let previousOpacity = previous.opacity;

      for (let frame = 0; frame < 60 * 30; frame++) {
        const t = frame / 60;
        stepWildlife(world, 1 / 60, s);
        const current = world.agents.find((a) => a.id === preyId);
        maxJump = Math.max(maxJump, Math.hypot(current.x - previous.x, current.y - previous.y));
        if (current.opacity > previousOpacity + 1e-6 && previousOpacity < 0.98 && (current.cover ?? 0) <= 0.55) {
          openGroundFade = true;
        }
        if (reachedCoverAt == null && (current.cover ?? 0) > 0.65) reachedCoverAt = t;
        if (!world.hunt) {
          finishedAt = t;
          break;
        }
        previous = current;
        previousOpacity = current.opacity;
      }

      assert.equal(openGroundFade, false, `${kind} at ${position.x},${position.y} does not regain opacity outside cover`);
      assert(reachedCoverAt != null, `${kind} at ${position.x},${position.y} reaches grass cover during recovery`);
      assert(finishedAt != null, `${kind} at ${position.x},${position.y} clears recoverCaught within thirty seconds`);
      assert(maxJump <= 0.32 / 60 + 0.001, `${kind} at ${position.x},${position.y} recovery has no teleport`);
      recoveries.push(finishedAt);
    }
  }
  console.log(
    `forced recovery evidence: ${recoveries.length} samples cleared, slowest ${Math.max(...recoveries).toFixed(2)}s, median ${recoveries
      .sort((a, b) => a - b)
      [Math.floor(recoveries.length / 2)].toFixed(2)}s`,
  );
}

{
  const s = state();
  const world = createWildlifeWorld(s);
  const phases = new Set();
  const consumedTicks = new Set();
  const caughtStarts = [];
  const huntStarts = [];
  const quietIntervals = [];
  const startById = new Map(world.agents.map((a) => [a.id, { x: a.x, y: a.y }]));
  const minOpacityByPrey = new Map();
  let previousById = new Map(world.agents.map((a) => [a.id, { x: a.x, y: a.y }]));
  let previousOpacityById = new Map(world.agents.map((a) => [a.id, a.opacity]));
  let maxJump = 0;
  let firstSuccessfulHuntAt = null;
  let nextEventAt = 1.8;
  let previousHuntId = null;
  let quietStart = 0;
  let maxActiveHunts = 0;

  for (let frame = 0; frame < 60 * 150; frame++) {
    const t = frame / 60;
    if (t + 1e-9 >= nextEventAt) {
      s.tick += 1;
      s.lastPredation = { prey: s.tick % 2 === 1 ? 'rabbits' : 'elk', amount: 1 };
      nextEventAt += 1.8;
    }

    stepWildlife(world, 1 / 60, s);
    const huntId = world.hunt ? `${world.hunt.predatorId}->${world.hunt.preyId}:${world.hunt.consumedTick ?? 'ambient'}` : null;
    if (huntId && huntId !== previousHuntId) {
      huntStarts.push(t);
      if (quietStart != null) quietIntervals.push(t - quietStart);
      quietStart = null;
    }
    if (!huntId && previousHuntId) quietStart = t;
    previousHuntId = huntId;

    if (world.hunt) {
      maxActiveHunts = Math.max(maxActiveHunts, 1);
      phases.add(world.hunt.phase);
      if (world.hunt.consumedTick != null) consumedTicks.add(world.hunt.consumedTick);
      const prey = world.agents.find((a) => a.id === world.hunt.preyId);
      if (prey) minOpacityByPrey.set(prey.id, Math.min(minOpacityByPrey.get(prey.id) ?? 1, prey.opacity));
      if (world.hunt.phase === 'pounce' && firstSuccessfulHuntAt == null) firstSuccessfulHuntAt = t;
    }
    if (world.observation.phase === 'caught' && caughtStarts.at(-1) !== huntId) caughtStarts.push(huntId);

    for (const a of world.agents) {
      const prev = previousById.get(a.id);
      if (prev) maxJump = Math.max(maxJump, Math.hypot(a.x - prev.x, a.y - prev.y));
      previousById.set(a.id, { x: a.x, y: a.y });
      const previousOpacity = previousOpacityById.get(a.id) ?? a.opacity;
      if (a.opacity > previousOpacity + 1e-6 && previousOpacity < 0.98) {
        assert((a.cover ?? 0) > 0.55, `${a.id} only regains opacity inside cover at ${t.toFixed(2)}s`);
      }
      previousOpacityById.set(a.id, a.opacity);
      assert(isWalkable(a.x, a.y), `${a.id} stayed on walkable land at ${t.toFixed(2)}s`);
    }
    assert(world.hunt == null || world.agents.filter((a) => a.targetId).length <= 2, 'only one active predator/prey pair is targeted');
  }

  const maxDisplacement = Math.max(
    ...world.agents.map((a) => {
      const start = startById.get(a.id);
      return start ? Math.hypot(a.x - start.x, a.y - start.y) : 0;
    }),
  );
  const caughtCount = caughtStarts.filter(Boolean).length;
  assert(huntStarts.length >= 2, 'long run has repeated but separated hunts');
  assert(phases.has('stalk'), 'long run observes stalk');
  assert(phases.has('chase'), 'long run observes chase');
  assert(phases.has('pounce'), 'long run observes pounce');
  assert(phases.has('feed'), 'long run observes feed');
  assert(caughtCount >= 1, 'long run records a real caught sequence');
  assert([...minOpacityByPrey.values()].some((v) => v <= 0.02), 'caught prey becomes visually hidden');
  assert(maxDisplacement > 0.05, 'long run has meaningful position displacement');
  assert(maxJump <= 0.32 / 60 + 0.001, `per-frame jump ${maxJump} stays below speed bound`);
  assert(quietIntervals.some((seconds) => seconds >= 4), 'cooldown preserves at least four seconds of quiet between hunts');
  assert.equal(maxActiveHunts, 1, 'simulation never creates overlapping hunts');
  assert(consumedTicks.size >= caughtCount, 'successful catches consume distinct macro ticks');
  assert(firstSuccessfulHuntAt != null && firstSuccessfulHuntAt <= 20, `first successful hunt occurs within a reasonable window, got ${firstSuccessfulHuntAt}`);

  console.log(
    `wildlife timeline evidence: first successful pounce ${firstSuccessfulHuntAt.toFixed(2)}s, max frame jump ${maxJump.toFixed(5)}, quiet intervals ${quietIntervals
      .filter((seconds) => seconds >= 1)
      .slice(0, 4)
      .map((seconds) => seconds.toFixed(2))
      .join(', ')}s`,
  );
}

{
  const s = state();
  const world = createWildlifeWorld(s);
  run(world, 1.5, s);
  const keep = new Map(world.agents.map((a) => [a.id, { x: a.x, y: a.y }]));
  s.rabbits = 10;
  s.elk = 10;
  stepWildlife(world, 1 / 60, s);
  const rabbit = world.agents.find((a) => a.id === 'rabbit-1');
  const old = keep.get('rabbit-1');
  assert(rabbit && old, 'stable ids are preserved through count changes');
  assert(Math.hypot(rabbit.x - old.x, rabbit.y - old.y) < 0.02, 'count changes do not teleport existing agents');
}

{
  const s = state();
  const one = createWildlifeWorld(s);
  const many = createWildlifeWorld(s);
  for (let i = 0; i < 30 * 10; i++) stepWildlife(one, 1 / 30, s);
  for (let i = 0; i < 60 * 10; i++) stepWildlife(many, 1 / 60, s);
  for (const a of one.agents) {
    const b = many.agents.find((agent) => agent.id === a.id);
    assert(b, `missing ${a.id}`);
    assert(Math.hypot(a.x - b.x, a.y - b.y) < 0.04, `30fps and 60fps partition stays close for ${a.id}`);
  }
}

{
  const s = state();
  const world = createWildlifeWorld(s);
  run(world, 5, s);
  const deer = world.agents.filter((a) => a.kind === 'deer');
  if (deer.length >= 2) assert(visualDistance(deer[0], deer[1]) > 0.055, 'deer keep meaningful screen-space separation');
}

{
  assert.equal(isWalkable(0.61, 0.77), false, 'central willow is excluded');
  assert.equal(isWalkable(0.6, 0.88), false, 'foreground boulder is excluded');
  assert.equal(isWalkable(0.3, 0.69), true, 'upper meadow is walkable');
  assert.equal(isWalkable(0.86, 0.74), true, 'right meadow is walkable');
}

console.log('wildlife behavior regression passed');
