import type { EcosystemState } from './types';

export type WildlifeKind = 'rabbit' | 'deer' | 'wolf';

export type WildlifeActivity =
  | 'rest'
  | 'roam'
  | 'graze'
  | 'drink'
  | 'alert'
  | 'stalk'
  | 'chase'
  | 'flee'
  | 'pounce'
  | 'feed'
  | 'hide'
  | 'emerge';

export interface WildlifeObservation {
  text: string;
  phase: 'quiet' | 'stalk' | 'chase' | 'caught' | 'escaped';
  predatorId?: string;
  preyId?: string;
}

export interface WildlifeAgent {
  id: string;
  kind: WildlifeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  heading: number;
  targetHeading: number;
  activity: WildlifeActivity;
  activityTime: number;
  phase: number;
  gait: number;
  distance: number;
  opacity: number;
  cover?: number;
  coverId?: string;
  targetId?: string;
  homeX?: number;
  homeY?: number;
  goalX?: number;
  goalY?: number;
  seed?: number;
  hiddenTime?: number;
}

export interface WildlifeWorld {
  agents: WildlifeAgent[];
  time: number;
  observation: WildlifeObservation;
  hunt?: HuntState | null;
  pendingPredation?: PendingPredation | null;
  nextHuntAt?: number;
  lastPredationTick?: number;
  lastCounts?: Record<WildlifeKind, number>;
}

interface HuntState {
  predatorId: string;
  preyId: string;
  preyKind: 'rabbit' | 'deer';
  phase: 'stalk' | 'chase' | 'pounce' | 'feed' | 'recoverCaught' | 'escaped';
  elapsed: number;
  macroBacked: boolean;
  successPlanned: boolean;
  consumedTick?: number;
}

interface PendingPredation {
  preyKind: 'rabbit' | 'deer';
  tick: number;
}

const CAPS: Record<WildlifeKind, number> = { rabbit: 4, deer: 2, wolf: 2 };
const WORLD_BOUNDS = { minX: 0.08, maxX: 0.93, minY: 0.61, maxY: 0.88 } as const;
const MAX_DT = 1 / 60;
const HUGE_DT = 1.2;

const SPECIES_ORDER: WildlifeKind[] = ['rabbit', 'deer', 'wolf'];

const MEADOWS = [
  { minX: 0.14, maxX: 0.88, minY: 0.63, maxY: 0.71 },
  { minX: 0.1, maxX: 0.48, minY: 0.67, maxY: 0.85 },
  { minX: 0.79, maxX: 0.92, minY: 0.67, maxY: 0.8 },
] as const;

const WILLOW = { x: 0.61, y: 0.77, r: 0.065 };
const BOULDER = { x: 0.6, y: 0.88, r: 0.075 };

export const WILDLIFE_COVER_PATCHES = [
  { id: 'left-tall-grass', x: 0.3, y: 0.785, rx: 0.16, ry: 0.065, height: 0.12 },
  { id: 'right-rushes', x: 0.855, y: 0.745, rx: 0.055, ry: 0.045, height: 0.1 },
] as const;

export const WILDLIFE_LABELS: Record<WildlifeKind, string> = {
  rabbit: '野兔',
  deer: '美洲赤鹿',
  wolf: '灰狼',
};

export const WILDLIFE_ACTIVITY_LABELS: Record<WildlifeActivity, string> = {
  rest: '休息',
  roam: '游走',
  graze: '取食',
  drink: '饮水',
  alert: '警觉',
  stalk: '潜行',
  chase: '追逐',
  flee: '逃离',
  pounce: '扑击',
  feed: '进食',
  hide: '隐蔽',
  emerge: '探出',
};

export function isWalkable(x: number, y: number): boolean {
  if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || y < WORLD_BOUNDS.minY || y > WORLD_BOUNDS.maxY) {
    return false;
  }
  if (!MEADOWS.some((m) => x >= m.minX && x <= m.maxX && y >= m.minY && y <= m.maxY)) return false;
  if (distance(x, y, WILLOW.x, WILLOW.y) < WILLOW.r) return false;
  if (distance(x, y, BOULDER.x, BOULDER.y) < BOULDER.r) return false;
  return true;
}

export function createWildlifeWorld(state: EcosystemState): WildlifeWorld {
  const world: WildlifeWorld = {
    agents: [],
    time: 0,
    observation: {
      text: '河谷安静下来，草食动物在上层草甸与两侧林缘之间移动。',
      phase: 'quiet',
    },
    hunt: null,
    pendingPredation: null,
    nextHuntAt: state.fire ? 999 : 5.5,
    lastPredationTick: state.lastPredation ? state.tick : -1,
    lastCounts: { rabbit: 0, deer: 0, wolf: 0 },
  };
  reconcileAgents(world, state);
  return world;
}

export function stepWildlife(world: WildlifeWorld, dt: number, state: EcosystemState): void {
  reconcileAgents(world, state);
  if (state.paused || dt <= 0 || !Number.isFinite(dt)) return;

  const total = Math.min(dt, HUGE_DT);
  let remaining = total;
  while (remaining > 0) {
    const slice = Math.min(MAX_DT, remaining);
    stepSlice(world, slice, state);
    remaining -= slice;
  }
}

function stepSlice(world: WildlifeWorld, dt: number, state: EcosystemState) {
  world.time += dt;
  const predationEvent = takePredationEvent(world, state);
  // Hold the first unobserved field event until the visual encounter can
  // begin; replacing it every macro tick creates a rapid chain of identical
  // pursuits when the population model is under pressure.
  if (predationEvent && !world.pendingPredation) world.pendingPredation = predationEvent;
  for (const agent of world.agents) agent.activityTime += dt;

  if (state.fire) {
    world.hunt = null;
    world.pendingPredation = null;
    clearTargets(world);
    world.nextHuntAt = world.time + 6;
    for (const agent of world.agents) {
      const hide = agent.kind !== 'wolf' && hash(agent.seed ?? 1, Math.floor(world.time * 0.2)) > 0.55;
      setActivity(agent, hide ? 'hide' : 'flee');
      agent.targetId = undefined;
      steerTo(agent, fireSafePoint(agent), dt, speedFor(agent.kind, 'flee'));
      integrate(agent, dt);
    }
    world.observation = { text: '火线让动物压低身形，沿草甸边缘快速撤离。', phase: 'quiet' };
    return;
  }

  ensureHunt(world, predationEvent);
  updateHunt(world, dt, predationEvent);

  const huntedIds = new Set<string>();
  if (world.hunt) {
    huntedIds.add(world.hunt.predatorId);
    huntedIds.add(world.hunt.preyId);
  }

  for (const agent of world.agents) {
    if (!huntedIds.has(agent.id)) updateAmbientAgent(world, agent, dt);
  }

  applySeparation(world.agents, dt, world.hunt ?? null);
  for (const agent of world.agents) integrate(agent, dt);
  updateObservation(world);
}

function reconcileAgents(world: WildlifeWorld, state: EcosystemState) {
  // The macro counts drive the ecology, while these representatives keep a
  // wide camera view inhabited. A single representative can disappear into
  // the opposite end of the panorama for several seconds, which makes a
  // living valley look empty even though the simulation is healthy.
  const representativeFloor = (population: number) => (population > 0 ? 2 : 0);
  const wanted = {
    rabbit: state.rabbits > 0 ? Math.min(CAPS.rabbit, Math.max(representativeFloor(state.rabbits), Math.ceil(state.rabbits / 50))) : 0,
    deer: state.elk > 0 ? Math.min(CAPS.deer, Math.max(representativeFloor(state.elk), Math.ceil(state.elk / 70))) : 0,
    wolf: state.wolves > 0 ? Math.min(CAPS.wolf, Math.max(representativeFloor(state.wolves), Math.ceil(state.wolves / 8))) : 0,
  };

  const next: WildlifeAgent[] = [];
  for (const kind of SPECIES_ORDER) {
    const existing = world.agents.filter((a) => a.kind === kind).sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < wanted[kind]; i++) {
      next.push(existing[i] ?? createAgent(kind, i));
    }
  }

  const ids = new Set(next.map((a) => a.id));
  if (world.hunt && (!ids.has(world.hunt.predatorId) || !ids.has(world.hunt.preyId))) {
    world.hunt = null;
    clearTargets(world);
    world.nextHuntAt = Math.max(world.nextHuntAt ?? 0, world.time + 8);
  }
  world.agents = next;
  world.lastCounts = wanted;
}

function createAgent(kind: WildlifeKind, index: number): WildlifeAgent {
  const seed = kindSeed(kind) + index * 97;
  const p = startingPoint(kind, index);
  return {
    id: `${kind}-${index + 1}`,
    kind,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    facing: hash(seed, 8) > 0.5 ? 1 : -1,
    heading: hash(seed, 8) > 0.5 ? 0 : Math.PI,
    targetHeading: hash(seed, 8) > 0.5 ? 0 : Math.PI,
    activity: kind === 'rabbit' && index === 0 ? 'hide' : kind === 'wolf' ? 'roam' : index % 2 === 0 ? 'graze' : 'rest',
    activityTime: hash(seed, 11) * 3,
    phase: hash(seed, 12) * 10,
    gait: 0,
    distance: 0,
    opacity: 1,
    cover: coverDepth(p.x, p.y),
    coverId: nearestCoverPatch(p.x, p.y)?.id,
    homeX: p.x,
    homeY: p.y,
    goalX: p.x,
    goalY: p.y,
    seed,
  };
}

function startingPoint(kind: WildlifeKind, index: number) {
  const points: Record<WildlifeKind, { x: number; y: number }[]> = {
    rabbit: [
      { x: 0.19, y: 0.8 },
      { x: 0.84, y: 0.76 },
      { x: 0.4, y: 0.75 },
      { x: 0.22, y: 0.69 },
    ],
    deer: [
      { x: 0.35, y: 0.67 },
      // Keep the second elk in the middle meadow rather than stacking every
      // anchor at the far-right camera stop. It remains visible while the
      // right-hand wolf territory stays open and believable.
      { x: 0.62, y: 0.7 },
    ],
    wolf: [
      { x: 0.25, y: 0.7 },
      { x: 0.9, y: 0.69 },
    ],
  };
  return points[kind][index % points[kind].length]!;
}

function takePredationEvent(world: WildlifeWorld, state: EcosystemState) {
  if (!state.lastPredation || state.tick === world.lastPredationTick) return null;
  world.lastPredationTick = state.tick;
  return { preyKind: state.lastPredation.prey === 'elk' ? ('deer' as const) : ('rabbit' as const), tick: state.tick };
}

function ensureHunt(world: WildlifeWorld, predationEvent: PendingPredation | null) {
  const wolves = world.agents.filter((a) => a.kind === 'wolf');
  const prey = world.agents.filter((a) => a.kind === 'rabbit' || a.kind === 'deer');
  if (wolves.length === 0 || prey.length === 0) {
    world.hunt = null;
    world.pendingPredation = null;
    clearTargets(world);
    return;
  }

  if (world.hunt) {
    if (predationEvent && world.hunt.phase === 'chase' && world.hunt.consumedTick !== predationEvent.tick && world.hunt.preyKind === predationEvent.preyKind) {
      world.hunt.macroBacked = true;
      world.hunt.successPlanned ||= plannedSuccess(byId(world, world.hunt.preyId), predationEvent.tick);
      world.hunt.consumedTick = predationEvent.tick;
      world.pendingPredation = null;
    }
    return;
  }

  if (world.time < (world.nextHuntAt ?? 5.5)) return;

  if (world.pendingPredation) {
    const preferredExists = world.agents.some((a) => a.kind === world.pendingPredation?.preyKind);
    if (preferredExists) {
      startHunt(world, world.pendingPredation.preyKind, true, world.pendingPredation.tick);
      world.pendingPredation = null;
      return;
    }
    world.pendingPredation = null;
  }

  const preyKind: 'rabbit' | 'deer' = hash(71, Math.floor(world.time / 6)) > 0.35 ? 'rabbit' : 'deer';
  startHunt(world, preyKind, false);
}

function startHunt(world: WildlifeWorld, preferredPrey: 'rabbit' | 'deer', macroBacked: boolean, consumedTick?: number) {
  const wolves = world.agents.filter((a) => a.kind === 'wolf');
  // Keep one representative at the far end of the panorama as a quiet
  // territory anchor. Other individuals can take part in the encounter and
  // return to their home range afterwards, so a long camera pan never loses
  // an entire species from view.
  const huntWolves = wolves.length > 1 ? wolves.filter((wolf) => !isPanoramaAnchor(wolf)) : wolves;
  const prey = world.agents.filter((a) => a.kind === preferredPrey && !isPanoramaAnchor(a));
  if (macroBacked && prey.length === 0) return false;
  const fallbackPrey = prey.length > 0
    ? prey
    : world.agents.filter((a) => (a.kind === 'rabbit' || a.kind === 'deer') && !isPanoramaAnchor(a));
  if (huntWolves.length === 0 || fallbackPrey.length === 0) return false;

  const predator = huntWolves.reduce((best, wolf) => (wolf.x > best.x ? wolf : best), huntWolves[0]!);
  const target = nearest(predator, fallbackPrey);
  world.hunt = {
    predatorId: predator.id,
    preyId: target.id,
    preyKind: target.kind === 'deer' ? 'deer' : 'rabbit',
    phase: 'stalk',
    elapsed: 0,
    macroBacked,
    successPlanned: macroBacked && plannedSuccess(target, consumedTick ?? Math.floor(world.time * 10)),
    consumedTick,
  };
  predator.targetId = target.id;
  target.targetId = predator.id;
  setActivity(predator, 'stalk');
  setActivity(target, 'alert');
  return true;
}

function updateHunt(world: WildlifeWorld, dt: number, predationEvent: PendingPredation | null) {
  const hunt = world.hunt;
  if (!hunt) return;
  const predator = byId(world, hunt.predatorId);
  const prey = byId(world, hunt.preyId);
  if (!predator || !prey) {
    world.hunt = null;
    world.nextHuntAt = world.time + 8;
    return;
  }

  hunt.elapsed += dt;
  if (predationEvent && hunt.phase === 'chase' && hunt.consumedTick !== predationEvent.tick && hunt.preyKind === predationEvent.preyKind) {
    hunt.macroBacked = true;
    hunt.successPlanned ||= plannedSuccess(prey, predationEvent.tick);
    hunt.consumedTick = predationEvent.tick;
    world.pendingPredation = null;
  }

  const dist = distance(predator.x, predator.y, prey.x, prey.y);
  if (hunt.phase === 'stalk') {
    setActivity(predator, 'stalk');
    setActivity(prey, hunt.elapsed > 1.2 ? 'alert' : prey.kind === 'deer' ? 'graze' : 'roam');
    stalkPredator(predator, prey, dt);
    if (hunt.elapsed > 1.8 || dist < 0.14) {
      setHuntPhase(hunt, 'chase', predator, prey);
    }
  } else if (hunt.phase === 'chase') {
    setActivity(predator, 'chase');
    setActivity(prey, 'flee');
    chasePredator(predator, prey, dt);
    fleeFrom(prey, predator, dt);
    if (hunt.successPlanned && dist < catchDistance(prey.kind)) {
      setHuntPhase(hunt, 'pounce', predator, prey);
    } else if (
      (!hunt.successPlanned && hunt.elapsed > 3.6) ||
      (hunt.successPlanned && hunt.elapsed > 6.8) ||
      (!hunt.successPlanned && dist > 0.34 && hunt.elapsed > 2.2)
    ) {
      setHuntPhase(hunt, 'escaped', predator, prey);
    }
  } else if (hunt.phase === 'pounce') {
    setActivity(predator, 'pounce');
    setActivity(prey, 'hide');
    predator.vx *= 0.72;
    predator.vy *= 0.72;
    steerTo(prey, coverEntryPoint(prey), dt, recoveryCoverSpeed(prey) * 1.15);
    if (hunt.elapsed > 0.3) {
      setHuntPhase(hunt, 'feed', predator, prey);
    }
  } else if (hunt.phase === 'feed') {
    setActivity(predator, 'feed');
    setActivity(prey, 'hide');
    predator.vx *= 0.82;
    predator.vy *= 0.82;
    // The visible end of a successful hunt is the prey disappearing into
    // cover, not a slapstick collision in open ground. Give it enough speed
    // to reach the grass and fade only after its body is actually sheltered.
    steerTo(prey, coverEntryPoint(prey), dt, recoveryCoverSpeed(prey) * 1.8);
    prey.hiddenTime = hunt.elapsed;
    if ((prey.cover ?? 0) > 0.36) {
      prey.opacity = approach(prey.opacity, 0.01, dt * 18);
    }
    if (hunt.elapsed > 3.6) {
      setHuntPhase(hunt, 'recoverCaught', predator, prey);
    }
  } else if (hunt.phase === 'escaped') {
    setActivity(predator, 'rest');
    setActivity(prey, 'hide');
    predator.vx *= 0.75;
    predator.vy *= 0.75;
    steerTo(prey, coverEntryPoint(prey), dt, recoveryCoverSpeed(prey));
    if ((prey.cover ?? 0) > 0.65 && hunt.elapsed > 1.1) {
      const exit = coverExitPoint(prey);
      prey.goalX = exit.x;
      prey.goalY = exit.y;
    }
    if (hunt.elapsed > 1.8) {
      predator.targetId = undefined;
      prey.targetId = undefined;
      predator.goalX = predator.homeX ?? predator.x;
      predator.goalY = predator.homeY ?? predator.y;
      setActivity(predator, 'roam');
      world.hunt = null;
      world.nextHuntAt = world.time + 10.5;
    }
  } else {
    setActivity(predator, 'rest');
    setActivity(prey, 'hide');
    predator.vx *= 0.75;
    predator.vy *= 0.75;
    steerTo(prey, coverEntryPoint(prey), dt, recoveryCoverSpeed(prey));
    if ((prey.cover ?? 0) > 0.65 && hunt.elapsed > 1.1) {
      prey.opacity = approach(prey.opacity, 1, dt * 0.65);
      const exit = coverExitPoint(prey);
      prey.goalX = exit.x;
      prey.goalY = exit.y;
    }
    if (hunt.elapsed > 4.2 && prey.opacity > 0.92) {
      prey.hiddenTime = 0;
      predator.targetId = undefined;
      prey.targetId = undefined;
      predator.goalX = predator.homeX ?? predator.x;
      predator.goalY = predator.homeY ?? predator.y;
      setActivity(predator, 'roam');
      world.hunt = null;
      world.nextHuntAt = world.time + 12;
    }
  }
}

function updateAmbientAgent(world: WildlifeWorld, agent: WildlifeAgent, dt: number) {
  agent.targetId = undefined;
  if (agent.opacity >= 0.98 || (agent.cover ?? 0) > 0.55) {
    agent.opacity = approach(agent.opacity, 1, dt * 2);
  }

  if (agent.kind === 'rabbit' && agent.activity === 'hide' && agent.activityTime > 0.85) {
    const exit = coverExitPoint(agent, agent.coverId === 'right-rushes' ? 'right-rushes' : 'left-tall-grass');
    setActivity(agent, 'emerge');
    agent.goalX = exit.x;
    agent.goalY = exit.y;
  }

  const danger = nearbyDanger(world, agent);
  if (danger) {
    setActivity(agent, danger.distance < danger.radius * 0.55 ? 'flee' : 'alert');
    if (agent.activity === 'flee') fleeFrom(agent, danger.wolf, dt);
    else {
      agent.vx *= Math.max(0, 1 - dt * 2.2);
      agent.vy *= Math.max(0, 1 - dt * 2.2);
    }
    return;
  }

  const needGoal = agent.activityTime > ambientDuration(agent) || !isWalkable(agent.goalX ?? agent.x, agent.goalY ?? agent.y);
  if (needGoal) {
    const next = chooseAmbientActivity(world, agent);
    setActivity(agent, next.activity);
    agent.activityTime = 0;
    agent.goalX = next.x;
    agent.goalY = next.y;
  }

  // The second representative is a quiet territory marker for the far end
  // of the draggable panorama. Keep its random walk inside a compact home
  // range so a long-running session cannot pull both members of a species
  // into the same camera segment.
  if (isPanoramaAnchor(agent) && agent.homeX !== undefined && agent.homeY !== undefined) {
    const homeDistance = distance(agent.x, agent.y, agent.homeX, agent.homeY);
    if (homeDistance > 0.075) {
      agent.goalX = agent.homeX;
      agent.goalY = agent.homeY;
      // Do not teleport an anchor back into its range; a slow return keeps
      // the same frame-to-frame movement bound as every other representative.
      if (homeDistance > 0.11) {
        agent.vx *= 0.25;
        agent.vy *= 0.25;
      }
    }
  }

  if (agent.activity === 'rest' || agent.activity === 'graze' || agent.activity === 'alert') {
    agent.vx *= Math.max(0, 1 - dt * 3.5);
    agent.vy *= Math.max(0, 1 - dt * 3.5);
    if (agent.activity === 'graze' && agent.activityTime > 1.1) {
      steerTo(agent, { x: agent.goalX ?? agent.x, y: agent.goalY ?? agent.y }, dt, speedFor(agent.kind, 'graze') * 0.35);
    }
    return;
  }

  if (agent.activity === 'emerge') {
    const exit = { x: agent.goalX ?? agent.x, y: agent.goalY ?? agent.y };
    steerTo(agent, exit, dt, speedFor(agent.kind, 'emerge'));
    if (distance(agent.x, agent.y, exit.x, exit.y) < 0.018 || agent.activityTime > 2.4) {
      setActivity(agent, agent.kind === 'rabbit' ? 'graze' : 'roam');
      agent.goalX = agent.x;
      agent.goalY = agent.y;
    }
    return;
  }

  const speed = speedFor(agent.kind, agent.activity);
  steerTo(agent, { x: agent.goalX ?? agent.x, y: agent.goalY ?? agent.y }, dt, speed);
}

function nearbyDanger(world: WildlifeWorld, agent: WildlifeAgent) {
  if (agent.kind === 'wolf' || isPanoramaAnchor(agent) || !world.hunt) return null;
  if (world.hunt.preyId === agent.id) return null;
  if (!['chase', 'pounce', 'feed', 'recoverCaught', 'escaped'].includes(world.hunt.phase)) return null;
  const wolf = byId(world, world.hunt.predatorId);
  if (!wolf) return null;
  const radius = agent.kind === 'deer' ? 0.18 : 0.13;
  const d = visualDistance(agent, wolf);
  return d < radius ? { wolf, distance: d, radius } : null;
}

function chooseAmbientActivity(world: WildlifeWorld, agent: WildlifeAgent) {
  const roll = hash(agent.seed ?? 1, Math.floor(world.time * 1.7) + Math.floor(agent.phase * 10));
  const anchor = isPanoramaAnchor(agent);
  if (agent.kind === 'wolf') {
    const activity: WildlifeActivity = roll > 0.72 ? 'rest' : roll > 0.5 ? 'alert' : 'roam';
    // Lamar wolves patrol an established territory around the forest edge;
    // keeping ambient goals near their home range prevents the whole pack
    // from drifting out of a wide panorama after a hunt.
    return { activity, ...randomWalkable(agent.seed ?? 1, world.time, agent.homeX ?? agent.x, agent.homeY ?? agent.y, anchor ? 0.075 : 0.14) };
  }
  if (!anchor && roll > 0.82) return { activity: 'drink' as const, ...riverEdgePoint(agent.seed ?? 1, world.time) };
  if (roll > 0.58) return { activity: 'graze' as const, ...randomWalkable(agent.seed ?? 1, world.time, agent.homeX ?? agent.x, agent.homeY ?? agent.y, anchor ? 0.08 : 0.16) };
  if (roll > 0.24) return { activity: 'roam' as const, ...randomWalkable(agent.seed ?? 1, world.time, agent.homeX ?? agent.x, agent.homeY ?? agent.y, anchor ? 0.09 : 0.18) };
  return { activity: roll > 0.12 ? ('rest' as const) : ('alert' as const), x: agent.x, y: agent.y };
}

function isPanoramaAnchor(agent: WildlifeAgent) {
  return agent.id.endsWith('-2');
}

function setActivity(agent: WildlifeAgent, activity: WildlifeActivity) {
  if (agent.activity === activity) return;
  agent.activity = activity;
  agent.activityTime = 0;
}

function setHuntPhase(
  hunt: HuntState,
  phase: HuntState['phase'],
  predator: WildlifeAgent,
  prey: WildlifeAgent,
) {
  if (hunt.phase === phase) return;
  hunt.phase = phase;
  hunt.elapsed = 0;
  if (phase === 'stalk') {
    setActivity(predator, 'stalk');
    setActivity(prey, 'alert');
  } else if (phase === 'chase') {
    setActivity(predator, 'chase');
    setActivity(prey, 'flee');
  } else if (phase === 'pounce') {
    setActivity(predator, 'pounce');
    setActivity(prey, 'hide');
  } else if (phase === 'feed') {
    setActivity(predator, 'feed');
    setActivity(prey, 'hide');
  } else if (phase === 'recoverCaught') {
    setActivity(predator, 'rest');
    setActivity(prey, 'hide');
  } else {
    setActivity(predator, 'rest');
    setActivity(prey, 'hide');
  }
}

function stalkPredator(predator: WildlifeAgent, prey: WildlifeAgent, dt: number) {
  const dx = prey.x - predator.x;
  const dy = prey.y - predator.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const goal = projectToWalkable(prey.x - (dx / len) * 0.12, prey.y - (dy / len) * 0.08);
  steerTo(predator, goal, dt, speedFor('wolf', 'stalk'));
}

function chasePredator(predator: WildlifeAgent, prey: WildlifeAgent, dt: number) {
  steerTo(predator, { x: prey.x, y: prey.y }, dt, speedFor('wolf', 'chase'));
}

function fleeFrom(prey: WildlifeAgent, predator: WildlifeAgent, dt: number) {
  const dx = prey.x - predator.x;
  const dy = prey.y - predator.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const far = projectToWalkable(prey.x + (dx / len) * 0.24, prey.y + (dy / len) * 0.18);
  steerTo(prey, far, dt, speedFor(prey.kind, 'flee'));
}

function steerTo(agent: WildlifeAgent, goal: { x: number; y: number }, dt: number, speed: number) {
  const clipped = routeGoal(agent, projectToWalkable(goal.x, goal.y));
  const dx = clipped.x - agent.x;
  const dy = clipped.y - agent.y;
  const len = Math.hypot(dx, dy);
  if (len <= 0.006) {
    agent.vx = approach(agent.vx, 0, dt * 0.9);
    agent.vy = approach(agent.vy, 0, dt * 0.9);
    return;
  }

  const desiredHeading = Math.atan2(dy, dx);
  agent.targetHeading = desiredHeading;
  const currentSpeed = Math.hypot(agent.vx, agent.vy);
  const headingError = Math.abs(angleDelta(agent.heading, desiredHeading));
  const movingBackwards = currentSpeed > 0.018 && headingError > Math.PI * 0.62;
  const turnRate = speed > 0.14 ? 3.4 : speed > 0.05 ? 2.45 : 1.8;
  agent.heading = rotateTowards(agent.heading, desiredHeading, turnRate * dt);

  // Animals shed speed before turning through a tight angle, then rebuild it
  // along the new heading. This avoids instant sideways flips and jitter.
  const alignment = clamp(Math.cos(angleDelta(agent.heading, desiredHeading)), 0, 1);
  const targetSpeed = speed * (movingBackwards ? 0.2 : 0.35 + alignment * 0.65);
  const accel = speed > 0.14 ? 5.5 : 3.2;
  const targetVx = Math.cos(agent.heading) * targetSpeed;
  const targetVy = Math.sin(agent.heading) * targetSpeed;
  agent.vx = approach(agent.vx, targetVx, accel * dt * speed);
  agent.vy = approach(agent.vy, targetVy, accel * dt * speed);
}

function integrate(agent: WildlifeAgent, dt: number) {
  const oldX = agent.x;
  const oldY = agent.y;
  const proposedX = agent.x + agent.vx * dt;
  const proposedY = agent.y + agent.vy * dt;
  let nextX = oldX;
  let nextY = oldY;

  if (hasLineOfSight(oldX, oldY, proposedX, proposedY)) {
    nextX = proposedX;
    nextY = proposedY;
  } else if (hasLineOfSight(oldX, oldY, proposedX, oldY)) {
    nextX = proposedX;
    agent.vy = 0;
  } else if (hasLineOfSight(oldX, oldY, oldX, proposedY)) {
    nextY = proposedY;
    agent.vx = 0;
  } else {
    agent.vx = 0;
    agent.vy = 0;
  }

  agent.x = nextX;
  agent.y = nextY;
  const moved = distance(oldX, oldY, nextX, nextY);
  agent.distance += moved;
  agent.gait += moved * gaitScale(agent.kind, agent.activity);
  agent.phase += dt;
  const movedSpeed = Math.hypot(agent.vx, agent.vy);
  if (movedSpeed > 0.002) {
    const velocityHeading = Math.atan2(agent.vy, agent.vx);
    agent.heading = rotateTowards(agent.heading, velocityHeading, 4.5 * dt);
  }
  const facingBoundary = Math.PI * 0.5 + 0.14;
  if (agent.facing === 1 && Math.abs(angleDelta(agent.heading, 0)) > facingBoundary) agent.facing = -1;
  if (agent.facing === -1 && Math.abs(angleDelta(agent.heading, Math.PI)) > facingBoundary) agent.facing = 1;
  agent.cover = approach(agent.cover ?? 0, coverDepth(agent.x, agent.y), dt * 3.5);
  agent.coverId = nearestCoverPatch(agent.x, agent.y)?.id;
}

function routeGoal(agent: WildlifeAgent, goal: { x: number; y: number }) {
  if (hasLineOfSight(agent.x, agent.y, goal.x, goal.y)) return goal;
  const bridges = [
    projectToWalkable(0.46, 0.665),
    projectToWalkable(0.66, 0.665),
    projectToWalkable(0.8, 0.68),
  ];
  const visibleBridge = bridges.find((bridge) => hasLineOfSight(agent.x, agent.y, bridge.x, bridge.y));
  if (visibleBridge && !hasLineOfSight(visibleBridge.x, visibleBridge.y, goal.x, goal.y)) return visibleBridge;
  if (visibleBridge && distance(agent.x, agent.y, visibleBridge.x, visibleBridge.y) > 0.035) return visibleBridge;
  return goal;
}

function applySeparation(agents: WildlifeAgent[], dt: number, hunt: HuntState | null) {
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i]!;
      const b = agents[j]!;
      if (hunt && isHuntPair(a, b, hunt)) continue;
      const wanted = separationRadius(a.kind) + separationRadius(b.kind);
      const dx = a.x - b.x;
      const dy = (a.y - b.y) * (9 / 16);
      const d = Math.max(0.001, Math.hypot(dx, dy));
      if (d >= wanted) continue;
      const push = ((wanted - d) / wanted) * dt * 0.42;
      a.vx += (dx / d) * push;
      a.vy += ((dy / d) * push) / (9 / 16);
      b.vx -= (dx / d) * push;
      b.vy -= ((dy / d) * push) / (9 / 16);
      limitVelocity(a, speedFor(a.kind, a.activity) + 0.05);
      limitVelocity(b, speedFor(b.kind, b.activity) + 0.05);
    }
  }
}

function isHuntPair(a: WildlifeAgent, b: WildlifeAgent, hunt: HuntState) {
  return (
    (a.id === hunt.predatorId && b.id === hunt.preyId) ||
    (a.id === hunt.preyId && b.id === hunt.predatorId)
  );
}

function separationRadius(kind: WildlifeKind) {
  return kind === 'deer' ? 0.045 : kind === 'wolf' ? 0.035 : 0.014;
}

function visualDistance(a: WildlifeAgent, b: WildlifeAgent) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * (9 / 16));
}

function limitVelocity(agent: WildlifeAgent, max: number) {
  const speed = Math.hypot(agent.vx, agent.vy);
  if (speed <= max || speed <= 0) return;
  agent.vx = (agent.vx / speed) * max;
  agent.vy = (agent.vy / speed) * max;
}

function updateObservation(world: WildlifeWorld) {
  if (!world.hunt) {
    const species = activeSpeciesText(world.agents);
    world.observation = {
      text: species.length > 0 ? `${species}在草甸间恢复平静移动。` : '草甸暂时没有可见动物活动。',
      phase: 'quiet',
    };
    return;
  }

  const predator = byId(world, world.hunt.predatorId);
  const prey = byId(world, world.hunt.preyId);
  const names = predator && prey ? { predator: WILDLIFE_LABELS[predator.kind], prey: WILDLIFE_LABELS[prey.kind] } : null;
  if (world.hunt.phase === 'stalk') {
    world.observation = {
      text: names ? `${names.predator}压低身体接近${names.prey}，草食动物开始抬头。` : '灰狼在林缘压低身体接近猎物。',
      phase: 'stalk',
      predatorId: world.hunt.predatorId,
      preyId: world.hunt.preyId,
    };
  } else if (world.hunt.phase === 'chase') {
    world.observation = {
      text: names ? `${names.prey}突然加速横穿草甸，${names.predator}转入追逐。` : '猎物突然加速，灰狼转入追逐。',
      phase: 'chase',
      predatorId: world.hunt.predatorId,
      preyId: world.hunt.preyId,
    };
  } else if (world.hunt.phase === 'pounce' || world.hunt.phase === 'feed') {
    world.observation = {
      text: '追逐在高草边缘短暂交错，猎物被草丛遮住，灰狼停在林缘观察。',
      phase: 'caught',
      predatorId: world.hunt.predatorId,
      preyId: world.hunt.preyId,
    };
  } else if (world.hunt.phase === 'recoverCaught') {
    world.observation = {
      text: '草丛遮住了追逐的后半段，灰狼放慢脚步，河谷重新安静。',
      phase: 'caught',
      predatorId: world.hunt.predatorId,
      preyId: world.hunt.preyId,
    };
  } else {
    world.observation = {
      text: '猎物钻入草丛脱离视线，灰狼放慢脚步恢复体力。',
      phase: 'escaped',
      predatorId: world.hunt.predatorId,
      preyId: world.hunt.preyId,
    };
  }
}

function activeSpeciesText(agents: WildlifeAgent[]) {
  const active = SPECIES_ORDER.filter((kind) => agents.some((agent) => agent.kind === kind));
  return active.map((kind) => WILDLIFE_LABELS[kind]).join('、');
}

function clearTargets(world: WildlifeWorld) {
  for (const agent of world.agents) agent.targetId = undefined;
}

function hasLineOfSight(ax: number, ay: number, bx: number, by: number) {
  const d = distance(ax, ay, bx, by);
  const steps = Math.max(1, Math.ceil(d / 0.01));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function projectToWalkable(x: number, y: number) {
  let best = { x: 0.3, y: 0.68 };
  let bestD = Number.POSITIVE_INFINITY;
  for (const meadow of MEADOWS) {
    const cx = clamp(x, meadow.minX + 0.01, meadow.maxX - 0.01);
    const cy = clamp(y, meadow.minY + 0.01, meadow.maxY - 0.01);
    const candidate = avoidObstacles(cx, cy);
    if (!isWalkable(candidate.x, candidate.y)) continue;
    const d = distance(x, y, candidate.x, candidate.y);
    if (d < bestD) {
      best = candidate;
      bestD = d;
    }
  }
  return best;
}

function avoidObstacles(x: number, y: number) {
  let nx = x;
  let ny = y;
  for (const obstacle of [WILLOW, BOULDER]) {
    const d = distance(nx, ny, obstacle.x, obstacle.y);
    if (d >= obstacle.r + 0.008) continue;
    const angle = Math.atan2(ny - obstacle.y, nx - obstacle.x || 0.001);
    nx = obstacle.x + Math.cos(angle) * (obstacle.r + 0.012);
    ny = obstacle.y + Math.sin(angle) * (obstacle.r + 0.012);
  }
  return { x: clamp(nx, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX), y: clamp(ny, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY) };
}

function randomWalkable(seed: number, time: number, centerX: number, centerY: number, radius: number) {
  const step = Math.floor(time * 0.8) + 1;
  const angle = hash(seed, step) * Math.PI * 2;
  const r = radius * (0.35 + hash(seed + 5, step) * 0.65);
  return projectToWalkable(centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r);
}

function riverEdgePoint(seed: number, time: number) {
  const t = hash(seed + 9, Math.floor(time) + 1);
  return projectToWalkable(0.38 + t * 0.22, 0.7 + hash(seed + 13, Math.floor(time)) * 0.02);
}

function fireSafePoint(agent: WildlifeAgent) {
  return projectToWalkable(agent.kind === 'wolf' ? 0.86 : 0.14, agent.kind === 'wolf' ? 0.7 : 0.82);
}

function speedFor(kind: WildlifeKind, activity: WildlifeActivity) {
  if (activity === 'chase' || activity === 'flee') return kind === 'wolf' ? 0.24 : kind === 'deer' ? 0.22 : 0.18;
  if (activity === 'hide') return kind === 'deer' ? 0.12 : 0.1;
  if (activity === 'emerge') return kind === 'rabbit' ? 0.085 : 0.07;
  if (activity === 'stalk') return 0.055;
  if (activity === 'drink' || activity === 'roam') return kind === 'wolf' ? 0.08 : 0.06;
  if (activity === 'graze') return 0.035;
  return 0;
}

function recoveryCoverSpeed(agent: WildlifeAgent) {
  return speedFor(agent.kind, 'flee') * (agent.kind === 'deer' ? 0.68 : 0.62);
}

function gaitScale(kind: WildlifeKind, activity: WildlifeActivity) {
  const base = kind === 'rabbit' ? 18 : kind === 'wolf' ? 11 : 8;
  if (activity === 'chase' || activity === 'flee') {
    const runFactor = kind === 'rabbit' ? 0.95 : kind === 'wolf' ? 0.75 : 0.85;
    return base * runFactor;
  }
  return base;
}

function ambientDuration(agent: WildlifeAgent) {
  const roll = hash(agent.seed ?? 1, Math.floor(agent.phase * 0.3));
  if (agent.activity === 'rest' || agent.activity === 'graze') return 2.1 + roll * 3.2;
  if (agent.activity === 'alert') return 1 + roll * 1.8;
  return 2.4 + roll * 2.6;
}

function catchDistance(kind: WildlifeKind) {
  return kind === 'deer' ? 0.045 : 0.038;
}

function plannedSuccess(prey: WildlifeAgent | undefined, tick: number) {
  if (!prey) return false;
  // Keep the first observed macro event legible, then make successful hunts
  // uncommon so most encounters resolve with a retreat into cover.
  return tick <= 1 || hash(prey.seed ?? 1, tick) > 0.96;
}

function angleDelta(from: number, to: number) {
  let delta = (to - from + Math.PI) % (Math.PI * 2);
  if (delta < 0) delta += Math.PI * 2;
  return delta - Math.PI;
}

function rotateTowards(from: number, to: number, amount: number) {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= amount) return to;
  return from + Math.sign(delta) * amount;
}

function coverEntryPoint(agent: WildlifeAgent) {
  return WILDLIFE_COVER_PATCHES.map((patch) => coverEntryForPatch(patch))
    .sort((a, b) => routeDistance(agent.x, agent.y, a.x, a.y) - routeDistance(agent.x, agent.y, b.x, b.y))[0]!;
}

function coverExitPoint(agent: WildlifeAgent, preferredId?: (typeof WILDLIFE_COVER_PATCHES)[number]['id']) {
  const patch = (preferredId ? WILDLIFE_COVER_PATCHES.find((p) => p.id === preferredId) : nearestCoverPatch(agent.x, agent.y)) ?? WILDLIFE_COVER_PATCHES[0]!;
  const side = agent.x < patch.x ? -1 : 1;
  return projectToWalkable(patch.x + patch.rx * (0.9 * side), patch.y - patch.ry * 0.78);
}

function coverEntryForPatch(patch: (typeof WILDLIFE_COVER_PATCHES)[number]) {
  return projectToWalkable(patch.x - patch.rx * 0.24, patch.y + patch.ry * 0.12);
}

function nearestCoverPatch(x: number, y: number) {
  return WILDLIFE_COVER_PATCHES.reduce((best, patch) => {
    const bestDistance = best ? normalizedCoverDistance(x, y, best) : Number.POSITIVE_INFINITY;
    const patchDistance = normalizedCoverDistance(x, y, patch);
    return patchDistance < bestDistance ? patch : best;
  }, null as (typeof WILDLIFE_COVER_PATCHES)[number] | null);
}

function coverDepth(x: number, y: number) {
  let depth = 0;
  for (const patch of WILDLIFE_COVER_PATCHES) {
    const d = normalizedCoverDistance(x, y, patch);
    if (d >= 1) continue;
    depth = Math.max(depth, clamp((1 - d) / 0.55, 0, 1));
  }
  return depth;
}

function normalizedCoverDistance(x: number, y: number, patch: (typeof WILDLIFE_COVER_PATCHES)[number]) {
  return Math.hypot((x - patch.x) / patch.rx, (y - patch.y) / patch.ry);
}

function routeDistance(ax: number, ay: number, bx: number, by: number) {
  if (hasLineOfSight(ax, ay, bx, by)) return distance(ax, ay, bx, by);
  const bridges = [
    projectToWalkable(0.46, 0.665),
    projectToWalkable(0.66, 0.665),
    projectToWalkable(0.8, 0.68),
  ];
  let best = Number.POSITIVE_INFINITY;
  for (const bridge of bridges) {
    if (!hasLineOfSight(ax, ay, bridge.x, bridge.y) || !hasLineOfSight(bridge.x, bridge.y, bx, by)) continue;
    best = Math.min(best, distance(ax, ay, bridge.x, bridge.y) + distance(bridge.x, bridge.y, bx, by));
  }
  return best;
}

function byId(world: WildlifeWorld, id: string) {
  return world.agents.find((a) => a.id === id);
}

function nearest(from: WildlifeAgent, agents: WildlifeAgent[]) {
  return agents.reduce((best, agent) => (distance(from.x, from.y, agent.x, agent.y) < distance(from.x, from.y, best.x, best.y) ? agent : best), agents[0]!);
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function approach(value: number, target: number, amount: number) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function kindSeed(kind: WildlifeKind) {
  return kind === 'rabbit' ? 101 : kind === 'deer' ? 307 : 701;
}

function hash(seed: number, salt: number) {
  const t = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return t - Math.floor(t);
}
