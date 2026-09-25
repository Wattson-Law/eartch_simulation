import type { EcosystemState, Season } from './types';
import {
  WILDLIFE_ACTIVITY_LABELS,
  WILDLIFE_LABELS,
  isWalkable,
  type WildlifeActivity,
  type WildlifeAgent,
  type WildlifeKind,
  type WildlifeObservation,
} from './wildlife';

/**
 * The macro simulator owns population numbers. This module is only a small
 * presentation slice: one representative animal per visible species and a
 * deterministic activity script. It deliberately has no collision solver,
 * route graph, or feedback path into EcosystemState.
 */

export type VisualEventStage = 'stalk' | 'chase' | 'caught' | 'escaped';

export interface VisualEvent {
  predatorId: string;
  preyId: string;
  preyKind: 'rabbit' | 'deer';
  stage: VisualEventStage;
  elapsed: number;
  macroTick: number;
}

interface VisualBeat {
  activity: WildlifeActivity;
  duration: number;
  move?: boolean;
}

interface VisualTrack {
  waypoints: readonly { x: number; y: number }[];
  waypointIndex: number;
  phaseOffset: number;
  lastBeat: number;
}

export interface VisualSliceWorld {
  agents: WildlifeAgent[];
  time: number;
  observation: WildlifeObservation;
  event: VisualEvent | null;
  tracks: Record<string, VisualTrack>;
  lastPredationKey: string | null;
  lastCounts: Record<WildlifeKind, number>;
}

const REPRESENTATIVE_CAP = 1;
const VISUAL_MAX_DT = 0.1;
const VISUAL_MAX_CATCHUP = 1.2;

// Each species gets a small, safe stage area. The points are deliberately on
// one side of the river, so a scripted walk can never appear to cross water.
const TRACKS: Record<WildlifeKind, readonly { x: number; y: number }[]> = {
  rabbit: [
    { x: 0.24, y: 0.7 },
    { x: 0.265, y: 0.7 },
    { x: 0.28, y: 0.71 },
    { x: 0.22, y: 0.69 },
  ],
  deer: [
    { x: 0.7, y: 0.8 },
    { x: 0.72, y: 0.81 },
    { x: 0.76, y: 0.82 },
    { x: 0.73, y: 0.8 },
  ],
  wolf: [
    { x: 0.9, y: 0.74 },
    { x: 0.87, y: 0.72 },
    { x: 0.9, y: 0.7 },
    { x: 0.89, y: 0.71 },
  ],
};

const BEATS: Record<WildlifeKind, readonly VisualBeat[]> = {
  rabbit: [
    { activity: 'hide', duration: 6.4 },
    { activity: 'emerge', duration: 4.2, move: true },
    { activity: 'graze', duration: 9.6 },
    { activity: 'sit', duration: 8 },
    { activity: 'roam', duration: 11, move: true },
  ],
  deer: [
    { activity: 'graze', duration: 10 },
    { activity: 'rest', duration: 8 },
    { activity: 'drink', duration: 7, move: true },
    { activity: 'roam', duration: 11, move: true },
    { activity: 'sit', duration: 8 },
  ],
  wolf: [
    { activity: 'rest', duration: 8 },
    { activity: 'roam', duration: 12, move: true },
    { activity: 'alert', duration: 6 },
    { activity: 'sit', duration: 8 },
  ],
};

const SPEEDS: Record<WildlifeKind, number> = { rabbit: 0.009, deer: 0.008, wolf: 0.009 };
const SEASON_SPEED: Record<Season, number> = {
  spring: 1,
  summer: 1.05,
  autumn: 0.92,
  winter: 0.72,
};

export function createVisualSlice(state: EcosystemState): VisualSliceWorld {
  const world: VisualSliceWorld = {
    agents: [],
    time: 0,
    observation: {
      text: '河谷安静下来，三位代表个体沿各自的活动线观察环境。',
      phase: 'quiet',
    },
    event: null,
    tracks: {},
    lastPredationKey: null,
    lastCounts: { rabbit: 0, deer: 0, wolf: 0 },
  };
  reconcile(world, state);
  return world;
}

/** Advance only the visual state slice. It never mutates the macro state. */
export function stepVisualSlice(world: VisualSliceWorld, dt: number, state: EcosystemState): void {
  reconcile(world, state);
  if (state.paused || !Number.isFinite(dt) || dt <= 0) {
    return;
  }

  syncPredationEvent(world, state);
  let remaining = Math.min(dt, VISUAL_MAX_CATCHUP);
  while (remaining > 0) {
    const delta = Math.min(VISUAL_MAX_DT, remaining);
    world.time += delta;

    if (state.fire) {
      // An environmental event owns the stage. Cancel a pending hunt rather
      // than letting a predator continue a scripted encounter through smoke.
      world.event = null;
      applyFirePosture(world, delta);
    } else if (world.event) {
      advanceEvent(world, delta);
    } else {
      for (const agent of world.agents) advanceRoutineAgent(world, agent, state.season, delta);
    }
    remaining -= delta;
  }

  updateObservation(world);
}

function reconcile(world: VisualSliceWorld, state: EcosystemState) {
  const wanted: Record<WildlifeKind, number> = {
    rabbit: state.rabbits > 0 ? REPRESENTATIVE_CAP : 0,
    deer: state.elk > 0 ? REPRESENTATIVE_CAP : 0,
    wolf: state.wolves > 0 ? REPRESENTATIVE_CAP : 0,
  };
  const next: WildlifeAgent[] = [];
  for (const kind of ['rabbit', 'deer', 'wolf'] as const) {
    if (wanted[kind] === 0) continue;
    const existing = world.agents.find((agent) => agent.kind === kind);
    if (existing) {
      next.push(existing);
      continue;
    }
    const agent = createAgent(kind);
    next.push(agent);
    world.tracks[agent.id] = createTrack(kind);
  }
  world.agents = next;
  world.lastCounts = wanted;
  if (world.event && (!findAgent(world, world.event.predatorId) || !findAgent(world, world.event.preyId))) {
    world.event = null;
  }
}

function createAgent(kind: WildlifeKind): WildlifeAgent {
  const point = TRACKS[kind][0]!;
  const activity = BEATS[kind][0]!.activity;
  return {
    id: `${kind}-1`,
    kind,
    x: point.x,
    y: point.y,
    vx: 0,
    vy: 0,
    facing: kind === 'wolf' ? -1 : 1,
    heading: kind === 'wolf' ? Math.PI : 0,
    targetHeading: kind === 'wolf' ? Math.PI : 0,
    activity,
    activityTime: 0,
    phase: kind === 'rabbit' ? 0.15 : kind === 'deer' ? 0.42 : 0.76,
    gait: 0,
    distance: 0,
    opacity: activity === 'hide' ? 0.55 : 1,
    cover: activity === 'hide' ? 0.85 : 0,
    coverId: kind === 'rabbit' ? 'left-tall-grass' : undefined,
    homeX: point.x,
    homeY: point.y,
    goalX: point.x,
    goalY: point.y,
    seed: kind === 'rabbit' ? 11 : kind === 'deer' ? 23 : 37,
  };
}

function createTrack(kind: WildlifeKind): VisualTrack {
  return {
    waypoints: TRACKS[kind],
    waypointIndex: 0,
    phaseOffset: kind === 'rabbit' ? 0 : kind === 'deer' ? 3.6 : 7.2,
    lastBeat: -1,
  };
}

function advanceRoutineAgent(world: VisualSliceWorld, agent: WildlifeAgent, season: Season, dt: number) {
  const track = world.tracks[agent.id] ?? createTrack(agent.kind);
  world.tracks[agent.id] = track;
  const beats = BEATS[agent.kind];
  const cycle = beats.reduce((sum, beat) => sum + beat.duration, 0);
  const localTime = positiveModulo(world.time + track.phaseOffset, cycle);
  let cursor = 0;
  let beatIndex = 0;
  for (let index = 0; index < beats.length; index++) {
    const beat = beats[index]!;
    if (localTime < cursor + beat.duration) {
      beatIndex = index;
      break;
    }
    cursor += beat.duration;
    beatIndex = index;
  }
  const beat = beats[beatIndex]!;
  const beatProgress = Math.max(0, Math.min(1, (localTime - cursor) / beat.duration));
  if (track.lastBeat !== beatIndex) {
    track.lastBeat = beatIndex;
    if (beat.move) track.waypointIndex = (track.waypointIndex + 1) % track.waypoints.length;
  }
  setActivity(agent, beat.activity);
  agent.activityTime = beatProgress * beat.duration;
  const goal = track.waypoints[track.waypointIndex]!;
  agent.goalX = goal.x;
  agent.goalY = goal.y;

  const previousX = agent.x;
  const previousY = agent.y;
  if (beat.move) {
    const speed = SPEEDS[agent.kind] * (SEASON_SPEED[season] ?? 1) * (beat.activity === 'emerge' ? 0.65 : 1);
    moveToward(agent, goal, speed, dt);
  } else {
    agent.vx = approach(agent.vx, 0, dt * 5);
    agent.vy = approach(agent.vy, 0, dt * 5);
    agent.x = approach(agent.x, previousX, 1);
    agent.y = approach(agent.y, previousY, 1);
  }
  const moved = Math.hypot(agent.x - previousX, agent.y - previousY);
  agent.distance += moved;
  agent.gait += moved * (agent.kind === 'rabbit' ? 18 : agent.kind === 'wolf' ? 11 : 8);
  agent.cover = coverForRoutine(beat.activity, beatProgress);
  agent.opacity = opacityForRoutine(beat.activity, beatProgress);
}

function applyFirePosture(world: VisualSliceWorld, dt: number) {
  for (const agent of world.agents) {
    const previousX = agent.x;
    const previousY = agent.y;
    if (agent.kind === 'wolf') {
      setActivity(agent, 'alert');
    } else {
      setActivity(agent, 'hide');
      agent.cover = approach(agent.cover ?? 0, 0.92, dt * 2.5);
      agent.opacity = approach(agent.opacity, 0.4, dt * 2.5);
    }
    agent.activityTime += dt;
    agent.vx = (agent.x - previousX) / Math.max(dt, 1e-6);
    agent.vy = (agent.y - previousY) / Math.max(dt, 1e-6);
  }
}

function syncPredationEvent(world: VisualSliceWorld, state: EcosystemState) {
  const report = state.lastPredation;
  if (!report) return;
  const key = `${state.tick}:${report.prey}`;
  if (world.lastPredationKey === key || world.event) return;
  const predator = world.agents.find((agent) => agent.kind === 'wolf');
  const preyKind = report.prey === 'elk' ? 'deer' : 'rabbit';
  const prey = world.agents.find((agent) => agent.kind === preyKind);
  world.lastPredationKey = key;
  if (!predator || !prey) return;
  world.event = {
    predatorId: predator.id,
    preyId: prey.id,
    preyKind,
    stage: 'stalk',
    elapsed: 0,
    macroTick: state.tick,
  };
}

function advanceEvent(world: VisualSliceWorld, dt: number) {
  const event = world.event;
  if (!event) return;
  event.elapsed += dt;
  const predator = findAgent(world, event.predatorId);
  const prey = findAgent(world, event.preyId);
  if (!predator || !prey) {
    world.event = null;
    return;
  }

  // A field note can communicate a hunt without simulating a collision. The
  // two sprites hold their stage marks while the FSM changes the pose and
  // narration, which removes the sliding/teleporting failure mode entirely.
  if (event.elapsed < 1.1) {
    event.stage = 'stalk';
    setActivity(predator, 'stalk');
    setActivity(prey, 'alert');
  } else if (event.elapsed < 2.1) {
    event.stage = 'chase';
    setActivity(predator, 'stalk');
    setActivity(prey, 'alert');
  } else if (event.elapsed < 4.4) {
    event.stage = 'caught';
    setActivity(predator, 'feed');
    setActivity(prey, 'caught');
    prey.vx = 0;
    prey.vy = 0;
    prey.opacity = event.elapsed < 3.2 ? 1 : approach(prey.opacity, 0.45, dt * 2.2);
  } else if (event.elapsed < 6.2) {
    event.stage = 'escaped';
    setActivity(predator, 'rest');
    setActivity(prey, 'hide');
    prey.vx = 0;
    prey.vy = 0;
    prey.cover = approach(prey.cover ?? 0, 0.9, dt * 2.4);
    prey.opacity = approach(prey.opacity, 0.2, dt * 2.4);
  } else {
    prey.opacity = approach(prey.opacity, 1, dt * 2.5);
    prey.cover = approach(prey.cover ?? 0, 0, dt * 2.5);
    setActivity(predator, 'rest');
    setActivity(prey, 'rest');
    world.event = null;
  }
}

function updateObservation(world: VisualSliceWorld) {
  const event = world.event;
  if (event) {
    const predator = findAgent(world, event.predatorId);
    const prey = findAgent(world, event.preyId);
    const predatorName = predator ? WILDLIFE_LABELS[predator.kind] : '灰狼';
    const preyName = prey ? WILDLIFE_LABELS[prey.kind] : WILDLIFE_LABELS[event.preyKind];
    const text = event.stage === 'stalk'
      ? `${predatorName}在草甸边缘压低身体，${preyName}还没有离开自己的活动线。`
      : event.stage === 'chase'
        ? `远处出现短暂追逐，镜头只记录姿态变化，不追踪每一步碰撞。`
        : event.stage === 'caught'
          ? `${preyName}短暂倒地，${predatorName}停在草边，现场保持安静。`
          : `${preyName}退入高草，${predatorName}重新回到自己的观察线。`;
    world.observation = {
      text,
      phase: event.stage,
      predatorId: event.predatorId,
      preyId: event.preyId,
    };
    return;
  }

  const active = world.agents
    .filter((agent) => agent.activity !== 'rest' && agent.activity !== 'sit')
    .map((agent) => `${WILDLIFE_LABELS[agent.kind]}${WILDLIFE_ACTIVITY_LABELS[agent.activity]}`);
  world.observation = {
    text: active.length > 0
      ? `${active.join('、')}沿固定观察线缓慢活动，画面只展示三位代表个体。`
      : '河谷安静下来，三位代表个体在自己的活动线附近停留。',
    phase: 'quiet',
  };
}

function moveToward(agent: WildlifeAgent, goal: { x: number; y: number }, speed: number, dt: number) {
  const dx = goal.x - agent.x;
  const dy = goal.y - agent.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) {
    agent.vx = 0;
    agent.vy = 0;
    return;
  }
  const amount = Math.min(distance, speed * dt);
  const previousX = agent.x;
  const previousY = agent.y;
  const nextX = agent.x + (dx / distance) * amount;
  const nextY = agent.y + (dy / distance) * amount;
  // The authored tracks are land-only. Keep this guard so future art edits
  // fail safe instead of putting a representative in the river.
  if (isWalkable(nextX, nextY)) {
    agent.x = nextX;
    agent.y = nextY;
  }
  agent.vx = (agent.x - previousX) / Math.max(dt, 1e-6);
  agent.vy = (agent.y - previousY) / Math.max(dt, 1e-6);
  agent.targetHeading = Math.atan2(dy, dx);
  agent.heading = approach(agent.heading, agent.targetHeading, Math.min(1, dt * 4));
  if (Math.abs(Math.cos(agent.heading)) > 0.12) agent.facing = Math.cos(agent.heading) >= 0 ? 1 : -1;
}

function coverForRoutine(activity: WildlifeActivity, progress: number) {
  if (activity === 'hide') return 0.84;
  if (activity === 'emerge') return Math.max(0, 0.84 * (1 - progress));
  return 0;
}

function opacityForRoutine(activity: WildlifeActivity, progress: number) {
  if (activity === 'hide') return 0.48;
  if (activity === 'emerge') return 0.48 + progress * 0.52;
  return 1;
}

function setActivity(agent: WildlifeAgent, activity: WildlifeActivity) {
  if (agent.activity === activity) return;
  agent.activity = activity;
  agent.activityTime = 0;
  if (activity === 'sit' || activity === 'caught' || activity === 'feed' || activity === 'rest') {
    agent.vx = 0;
    agent.vy = 0;
  }
}

function findAgent(world: VisualSliceWorld, id: string) {
  return world.agents.find((agent) => agent.id === id);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function approach(current: number, target: number, amount: number) {
  const clamped = Math.max(0, Math.min(1, amount));
  return current + (target - current) * clamped;
}

export {
  WILDLIFE_ACTIVITY_LABELS,
  WILDLIFE_LABELS,
  type WildlifeActivity,
  type WildlifeAgent,
  type WildlifeKind,
  type WildlifeObservation,
};
