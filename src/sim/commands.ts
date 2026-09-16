import type { EcosystemState, SimCommand, SpeciesKey } from './types';
import { SEASON_LABELS, SPECIES_LABELS, SEASON_ORDER } from './types';
import { clampState, BOUNDS } from './bounds';
import { pushLog } from './state';
import { tick, tickMany } from './tick';

export interface ApplyResult {
  state: EcosystemState;
  /** 给聊天框的中文解释（只描述模拟器实际做了什么） */
  reply: string;
  /** 是否触发捕食动画（由后续 tick 产生时也可） */
  triggerPredationAnim: boolean;
}

/**
 * 将结构化命令应用到状态。纯函数，数值只在此与 tick 中变化。
 */
export function applyCommand(state: EcosystemState, command: SimCommand): ApplyResult {
  switch (command.type) {
    case 'set_rain': {
      const weeks = Math.max(1, Math.min(12, command.weeks));
      const boost = Math.min(0.35, weeks * 0.04);
      let s = clampState({
        ...state,
        rainfall: state.rainfall + boost,
      });
      s = pushLog(s, 'user-command', `用户指令：降雨增强约 ${weeks} 周（降雨强度 +${boost.toFixed(2)}）。`);
      return {
        state: s,
        reply: `已执行：模拟器将降雨强度提高了 ${boost.toFixed(2)}（约 ${weeks} 周量级）。当前降雨 ${(s.rainfall).toFixed(2)}。植物生长会在后续 tick 受益。`,
        triggerPredationAnim: false,
      };
    }

    case 'set_temperature': {
      const delta = Math.max(-15, Math.min(15, command.delta));
      let s = clampState({
        ...state,
        temperature: state.temperature + delta,
      });
      const dir = delta >= 0 ? '升高' : '降低';
      s = pushLog(s, 'user-command', `用户指令：温度${dir} ${Math.abs(delta)}°C。`);
      return {
        state: s,
        reply: `已执行：温度${dir} ${Math.abs(delta)}°C，当前 ${s.temperature}°C。这会影响后续植物生长与冬季压力。`,
        triggerPredationAnim: false,
      };
    }

    case 'trigger_fire': {
      if (state.fire) {
        return {
          state,
          reply: '当前已有火灾在燃烧（剩余 ' + state.fireTicksLeft + ' 步）。未重复点火。',
          triggerPredationAnim: false,
        };
      }
      let s: EcosystemState = {
        ...state,
        fire: true,
        fireTicksLeft: 5,
        grass: state.grass * 0.85,
        shrubs: state.shrubs * 0.88,
      };
      s = clampState(s);
      s = pushLog(s, 'user-command', '用户指令：触发森林火灾。植被立即受损，火灾将持续数步。');
      return {
        state: s,
        reply: `已执行：发生火灾。草降至约 ${Math.round(s.grass)}，灌木约 ${Math.round(s.shrubs)}；火灾标记将持续 ${s.fireTicksLeft} 个时间步。`,
        triggerPredationAnim: false,
      };
    }

    case 'add_species': {
      return mutateSpecies(state, command.species, command.amount, 'add');
    }

    case 'remove_species': {
      return mutateSpecies(state, command.species, command.amount, 'remove');
    }

    case 'force_season': {
      const target = command.season;
      const currentIdx = SEASON_ORDER.indexOf(state.season);
      const targetIdx = SEASON_ORDER.indexOf(target);
      // 快进到目标季节起点：每季 8 tick
      let forward = (targetIdx - currentIdx + 4) % 4;
      if (forward === 0) forward = 4; // 完整一圈到下一同名季，或至少推进到「下一段」
      // 更直观：推进到该季节的第 0 步对齐
      const ticksPerSeason = 8;
      const posInSeason = state.tick % ticksPerSeason;
      let steps = forward * ticksPerSeason - posInSeason;
      if (steps <= 0) steps = ticksPerSeason;
      // 若目标就是当前季且刚进入，少推进
      if (target === state.season && posInSeason === 0) {
        return {
          state,
          reply: `当前已经是${SEASON_LABELS[target]}。未推进时间。`,
          triggerPredationAnim: false,
        };
      }

      let s = tickMany({ ...state, paused: false }, steps);
      // 若因对齐误差未落到目标季，再补推进直到进入目标季或达上限
      let guard = 0;
      while (s.season !== target && guard < ticksPerSeason * 4) {
        s = tick({ ...s, paused: false });
        guard += 1;
      }
      s = pushLog(s, 'user-command', `用户指令：快进到${SEASON_LABELS[target]}（推进 ${steps + guard} 步）。`);
      const prey = s.lastPredation;
      return {
        state: s,
        reply: `已执行：时间推进 ${steps + guard} 步，当前季节为${SEASON_LABELS[s.season]}，温度 ${s.temperature}°C，降雨 ${s.rainfall.toFixed(2)}。`,
        triggerPredationAnim: prey != null,
      };
    }

    case 'pause': {
      if (state.paused) {
        return { state, reply: '模拟已处于暂停状态。', triggerPredationAnim: false };
      }
      let s = pushLog({ ...state, paused: true }, 'user-command', '用户指令：暂停模拟。');
      return { state: s, reply: '已暂停。时间步不再自动推进，你仍可下达环境/物种指令。', triggerPredationAnim: false };
    }

    case 'resume': {
      if (!state.paused) {
        return { state, reply: '模拟已在运行中。', triggerPredationAnim: false };
      }
      let s = pushLog({ ...state, paused: false }, 'user-command', '用户指令：继续模拟。');
      return { state: s, reply: '已继续。时间步将恢复自动推进。', triggerPredationAnim: false };
    }

    case 'fast_forward': {
      const n = Math.max(1, Math.min(48, command.ticks));
      let s = tickMany({ ...state, paused: false }, n);
      s = pushLog(s, 'user-command', `用户指令：快进 ${n} 步。`);
      return {
        state: s,
        reply: `已快进 ${n} 个时间步。当前第 ${s.tick} 步，${SEASON_LABELS[s.season]}，草 ${Math.round(s.grass)} / 兔 ${Math.round(s.rabbits)} / 狼 ${Math.round(s.wolves)}。`,
        triggerPredationAnim: s.lastPredation != null,
      };
    }

    case 'query': {
      return handleQuery(state, command.about);
    }

    default: {
      const _exhaustive: never = command;
      return { state, reply: `未知命令：${JSON.stringify(_exhaustive)}`, triggerPredationAnim: false };
    }
  }
}

function mutateSpecies(
  state: EcosystemState,
  species: SpeciesKey,
  amount: number,
  mode: 'add' | 'remove',
): ApplyResult {
  const n = Math.max(1, Math.min(500, Math.floor(amount)));
  const label = SPECIES_LABELS[species];
  const bound = BOUNDS[species];
  const before = state[species];
  let after = mode === 'add' ? before + n : before - n;
  after = Math.max(bound.min, Math.min(bound.max, after));
  const actual = Math.abs(after - before);

  if (actual === 0) {
    return {
      state,
      reply: mode === 'add'
        ? `${label}已达上限 ${bound.max}，未能增加。`
        : `${label}已为 ${Math.round(before)}，无法再减少。`,
      triggerPredationAnim: false,
    };
  }

  let s: EcosystemState = { ...state, [species]: after };
  s = clampState(s);
  const verb = mode === 'add' ? '增加' : '减少';
  s = pushLog(s, 'user-command', `用户指令：${verb} ${actual} ${unitOf(species)}${label}。`);
  return {
    state: s,
    reply: `已执行：${label}${verb} ${actual}，当前约 ${Math.round(s[species])}。后续 tick 会通过食物链传导影响。`,
    triggerPredationAnim: false,
  };
}

function unitOf(species: SpeciesKey): string {
  if (species === 'grass' || species === 'shrubs') return '单位';
  return '只';
}

function handleQuery(state: EcosystemState, about: 'most' | 'status' | 'why_rabbits'): ApplyResult {
  if (about === 'most') {
    const entries: [string, number][] = [
      ['草', state.grass],
      ['灌木', state.shrubs],
      ['兔子', state.rabbits],
      ['麋鹿', state.elk],
      ['狼', state.wolves],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    const [name, val] = entries[0];
    return {
      state,
      reply: `当前数量最多的是「${name}」（约 ${Math.round(val)}）。完整排序：${entries.map(([n, v]) => `${n} ${Math.round(v)}`).join('、')}。以上数值均来自模拟器状态，非 AI 编造。`,
      triggerPredationAnim: false,
    };
  }

  if (about === 'why_rabbits') {
    const recent = state.log.filter((e) => e.message.includes('兔')).slice(-3);
    const tips = recent.length
      ? recent.map((e) => `· [${e.source}] ${e.message}`).join('\n')
      : '· 近期日志中暂无直接提到兔子的条目；可能是植物不足导致的缓慢下降，或狼群持续捕食。';
    return {
      state,
      reply: `兔子当前约 ${Math.round(state.rabbits)}。可能原因（基于模拟器机制与日志）：\n${tips}\n草量 ${Math.round(state.grass)}，狼 ${Math.round(state.wolves)}。`,
      triggerPredationAnim: false,
    };
  }

  // status
  return {
    state,
    reply: [
      `第 ${state.tick} 步 · ${SEASON_LABELS[state.season]} · ${state.paused ? '已暂停' : '运行中'}`,
      `温度 ${state.temperature}°C · 降雨 ${state.rainfall.toFixed(2)}${state.fire ? ` · 火灾中(剩${state.fireTicksLeft}步)` : ''}`,
      `草 ${Math.round(state.grass)} · 灌木 ${Math.round(state.shrubs)} · 兔 ${Math.round(state.rabbits)} · 麋鹿 ${Math.round(state.elk)} · 狼 ${Math.round(state.wolves)}`,
    ].join('\n'),
    triggerPredationAnim: false,
  };
}

/** 导出供测试：单步 tick 再应用 */
export { tick };
