import type {
  CascadeStage,
  CausalCascade,
  EcosystemState,
} from './types';

export type CascadeKind = 'wolf' | 'fire';

const WOLF_STAGES: Omit<CascadeStage, 'status'>[] = [
  {
    id: 'wolf-return',
    title: '狼群回归',
    story:
      '拉马谷再度出现狼踪。灰狼在河岸巡线，麋鹿群开始拉开距离——顶级捕食者回来了。',
    delayTicks: 0,
  },
  {
    id: 'veg-pressure',
    title: '植被 / 河岸压力变化',
    story:
      '啃食压力下移：河岸柳与灌丛少了持续撕咬，嫩枝有机会冒头，岸线不再被反复踏平。',
    delayTicks: 2,
  },
  {
    id: 'beaver-river',
    title: '水狸与河流叙事',
    story:
      '柳丛回暖后，水狸更愿在此筑坝。河道变缓、湿地微扩——经典营养级联的「下游回声」（本玩具仅叙事，不新增水狸种群方程）。',
    delayTicks: 5,
  },
];

const FIRE_STAGES: Omit<CascadeStage, 'status'>[] = [
  {
    id: 'fire-spark',
    title: '雷击起火',
    story: '干雷劈中枯枝，烟柱先于火舌升起。巡护员已标出燃烧面，植被当场受损。',
    delayTicks: 0,
  },
  {
    id: 'fire-ash',
    title: '灰烬与避让',
    story: '草食动物绕开焦土觅食，狼群也改道猎场。黑化地表上，种子库仍在等待降雨。',
    delayTicks: 2,
  },
  {
    id: 'fire-green',
    title: '火后萌发',
    story: '火熄之后，稀疏阳光落到林下。若降雨回升，草与灌丛会缓慢返青——数字仍只由季节与时间步结算。',
    delayTicks: 4,
  },
];

function buildCascade(
  kind: CascadeKind,
  tick: number,
  seq: number,
  triggerLabel: string,
): CausalCascade {
  const templates = kind === 'wolf' ? WOLF_STAGES : FIRE_STAGES;
  const title =
    kind === 'wolf' ? '狼群引入 · 连锁影响' : '野火事件 · 连锁影响';
  const stages: CascadeStage[] = templates.map((t, i) => ({
    ...t,
    status: i === 0 ? 'active' : 'pending',
  }));
  return {
    id: `${kind}-t${tick}-n${seq}`,
    title,
    triggerLabel,
    startedAtTick: tick,
    stages,
  };
}

/** 根据当前 tick 刷新阶段状态 */
export function advanceCascade(cascade: CausalCascade, tick: number): CausalCascade {
  const elapsed = Math.max(0, tick - cascade.startedAtTick);
  let frontier = 0;
  for (let i = 0; i < cascade.stages.length; i++) {
    if (elapsed >= cascade.stages[i]!.delayTicks) frontier = i;
  }
  const stages = cascade.stages.map((stage, index) => {
    if (elapsed < stage.delayTicks) return { ...stage, status: 'pending' as const };
    if (index < frontier) return { ...stage, status: 'done' as const };
    if (index === frontier) {
      const isLast = index === cascade.stages.length - 1;
      return { ...stage, status: isLast ? ('done' as const) : ('active' as const) };
    }
    return { ...stage, status: 'pending' as const };
  });
  return { ...cascade, stages };
}

export function enqueueWolfCascade(
  state: EcosystemState,
  triggerLabel: string,
): EcosystemState {
  const cascade = buildCascade('wolf', state.tick, state.nextLogId, triggerLabel);
  const advanced = advanceCascade(cascade, state.tick);
  return {
    ...state,
    causalQueue: [...state.causalQueue, advanced].slice(-3),
  };
}

export function enqueueFireCascade(
  state: EcosystemState,
  triggerLabel: string,
): EcosystemState {
  const cascade = buildCascade('fire', state.tick, state.nextLogId, triggerLabel);
  const advanced = advanceCascade(cascade, state.tick);
  return {
    ...state,
    causalQueue: [...state.causalQueue, advanced].slice(-3),
  };
}

/** 每 tick 推进队列中所有级联的叙事阶段（不改种群） */
export function tickCascades(state: EcosystemState): EcosystemState {
  if (state.causalQueue.length === 0) return state;
  return {
    ...state,
    causalQueue: state.causalQueue.map((c) => advanceCascade(c, state.tick)),
  };
}

export function latestCascade(state: EcosystemState): CausalCascade | null {
  if (state.causalQueue.length === 0) return null;
  return state.causalQueue[state.causalQueue.length - 1] ?? null;
}
