import type { CampaignDecision, EcosystemState, SimCommand, SpeciesKey } from './types';
import { SEASON_LABELS, SPECIES_LABELS, SEASON_ORDER } from './types';
import { clampState, BOUNDS } from './bounds';
import { pushLog } from './state';
import { TICKS_PER_SEASON, tick, tickMany } from './tick';
import { enqueueFireCascade, enqueueWolfCascade } from './cascade';
import { applyCampaignDecision, CAMPAIGN_DECISION_LABELS } from './campaign';

export interface ApplyResult {
  state: EcosystemState;
  /** 巡护员第一人称简报 */
  reply: string;
  triggerPredationAnim: boolean;
  /** 是否应打开级联故事面板 */
  openCascade?: boolean;
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
      s = pushLog(
        s,
        'user-command',
        `气象简报：降雨增强约 ${weeks} 周量级，河谷湿度上升。`,
      );
      return {
        state: s,
        reply: `收到。我在河谷雨量筒旁复核过——降雨强度抬升了约 ${boost.toFixed(2)}（约 ${weeks} 周量级），当前 ${(s.rainfall).toFixed(2)}。接下来几个时间步，草与灌丛会喝得更饱。`,
        triggerPredationAnim: false,
      };
    }

    case 'set_temperature': {
      const delta = Math.max(-15, Math.min(15, command.delta));
      let s = clampState({
        ...state,
        temperature: state.temperature + delta,
      });
      const dir = delta >= 0 ? '回暖' : '变冷';
      s = pushLog(
        s,
        'user-command',
        `气象简报：气温${dir} ${Math.abs(delta)}°C，现 ${s.temperature}°C。`,
      );
      return {
        state: s,
        reply: `气温确实在${dir}。我手套上的霜意${delta < 0 ? '更重了' : '松了些'}——当前 ${s.temperature}°C。这会牵动植物生长与冬季压力，我会继续盯着曲线。`,
        triggerPredationAnim: false,
      };
    }

    case 'trigger_fire': {
      if (state.fire) {
        return {
          state,
          reply: `火线还在烧（大约还剩 ${state.fireTicksLeft} 步）。我先不重复点火，专心盯着蔓延边界。`,
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
      s = enqueueFireCascade(s, '雷击野火');
      s = pushLog(
        s,
        'user-command',
        '野外考察：雷击野火起势，植被当场受损，火情将持续数步。',
      );
      return {
        state: s,
        reply: `烟柱先看见的。雷击点燃枯枝后，草大约落到 ${Math.round(s.grass)}、灌木 ${Math.round(s.shrubs)}；火标记还会挂 ${s.fireTicksLeft} 步。我已展开连锁影响简报——数字仍只随时间步走。`,
        triggerPredationAnim: false,
        openCascade: true,
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
      let forward = (targetIdx - currentIdx + 4) % 4;
      if (forward === 0) forward = 4;
      const ticksPerSeason = TICKS_PER_SEASON;
      const posInSeason = state.tick % ticksPerSeason;
      let steps = forward * ticksPerSeason - posInSeason;
      if (steps <= 0) steps = ticksPerSeason;
      if (target === state.season && posInSeason === 0) {
        return {
          state,
          reply: `站在瞭望台上看，现在已经是${SEASON_LABELS[target]}了，我没有再拨时钟。`,
          triggerPredationAnim: false,
        };
      }

      let s = tickMany({ ...state, paused: false }, steps);
      let guard = 0;
      while (s.season !== target && guard < ticksPerSeason * 4) {
        s = tick({ ...s, paused: false });
        guard += 1;
      }
      s = pushLog(
        s,
        'user-command',
        `时间考察：快进至${SEASON_LABELS[target]}（推进 ${steps + guard} 步）。`,
      );
      const prey = s.lastPredation;
      return {
        state: s,
        reply: `我把观察窗口推到了${SEASON_LABELS[s.season]}——一共走了 ${steps + guard} 步。此刻 ${s.temperature}°C，降雨 ${s.rainfall.toFixed(2)}。谷地的气味都不一样了。`,
        triggerPredationAnim: prey != null,
      };
    }

    case 'pause': {
      if (state.paused) {
        return { state, reply: '观察已经暂停。你可以慢慢看河岸，或再下一条指令。', triggerPredationAnim: false };
      }
      let s = pushLog({ ...state, paused: true }, 'user-command', '巡护记录：暂停时间推进，便于细看现场。');
      return {
        state: s,
        reply: '好，我按下暂停。时间步不再自动走，环境与物种指令仍可下达。',
        triggerPredationAnim: false,
      };
    }

    case 'resume': {
      if (!state.paused) {
        return { state, reply: '时钟本来就在走，我继续沿河巡线。', triggerPredationAnim: false };
      }
      let s = pushLog({ ...state, paused: false }, 'user-command', '巡护记录：恢复时间推进。');
      return { state: s, reply: '继续。风又开始推着云走了。', triggerPredationAnim: false };
    }

    case 'fast_forward': {
      const n = Math.max(1, Math.min(48, command.ticks));
      let s = tickMany({ ...state, paused: false }, n);
      s = pushLog(s, 'user-command', `时间考察：快进 ${n} 步，复核种群与天气。`);
      return {
        state: s,
        reply: `快进了 ${n} 步。此刻第 ${s.tick} 步，${SEASON_LABELS[s.season]}；草约 ${Math.round(s.grass)}、兔 ${Math.round(s.rabbits)}、狼 ${Math.round(s.wolves)}。都是现场仪表上的数。`,
        triggerPredationAnim: s.lastPredation != null,
      };
    }

    case 'tourist_conflict': {
      // 轻度状态：麋鹿略增（投喂吸引）+ 狼略减（惊扰）——仍走确定性数值路径
      const elkBefore = state.elk;
      const wolfBefore = state.wolves;
      let s: EcosystemState = {
        ...state,
        elk: Math.min(BOUNDS.elk.max, state.elk + 8),
        wolves: Math.max(BOUNDS.wolves.min, state.wolves - 2),
      };
      s = clampState(s);
      const elkGain = Math.round(s.elk - elkBefore);
      const wolfLoss = Math.round(wolfBefore - s.wolves);
      s = pushLog(
        s,
        'user-command',
        `人为干扰：游客投喂冲突——麋鹿被吸引（+${elkGain}），狼群短暂退避（-${wolfLoss}）。`,
      );
      return {
        state: s,
        reply: `啧，又有人在路边摊开零食。麋鹿凑近了约 ${elkGain} 头，狼群被喇叭声惊退约 ${wolfLoss} 只。我会记进人为干扰简报——请别学他们。`,
        triggerPredationAnim: false,
      };
    }

    case 'campaign_decision': {
      return applyCampaignDecisionCommand(state, command.decision);
    }

    case 'query': {
      return handleQuery(state, command.about);
    }

    default: {
      const _exhaustive: never = command;
      return { state, reply: `这条指令我还不认识：${JSON.stringify(_exhaustive)}`, triggerPredationAnim: false };
    }
  }
}

function applyCampaignDecisionCommand(state: EcosystemState, decision: CampaignDecision): ApplyResult {
  const registration = applyCampaignDecision(state.campaign, decision);
  if (!registration.accepted) {
    return {
      state,
      reply: registration.reason,
      triggerPredationAnim: false,
    };
  }

  let s: EcosystemState = { ...state, campaign: registration.campaign };
  let reply = '';
  if (decision === 'feed_forage') {
    s = clampState({
      ...s,
      grass: s.grass + 360,
      shrubs: s.shrubs + 140,
      rabbits: s.rabbits + 8,
      elk: s.elk + 4,
    });
    s = {
      ...s,
      campaign: {
        ...s.campaign,
        lastRadio: 'Lin：草料车已经到河岸了。先把饥饿的冬天撑过去，但别把投喂误当成生态恢复。',
      },
    };
    reply = '投喂草料已记录：草场和灌丛获得一次小幅补给，食物链会继续按天自行演化。';
  } else if (decision === 'introduce_wolves') {
    const before = s.wolves;
    s = clampState({ ...s, wolves: s.wolves + 8 });
    const added = Math.round(s.wolves - before);
    s = enqueueWolfCascade(s, `故事决策：引入 ${added} 只狼`);
    s = {
      ...s,
      campaign: {
        ...s.campaign,
        lastRadio: 'Lin：运输笼打开了。狼群不会立刻修好河岸，但它们会改变赤鹿敢不敢停留的地方。',
      },
    };
    reply = `引入狼群已记录：增加 ${added} 只灰狼。接下来观察啃食压力是否回到安全区间。`;
  } else {
    const wasBurning = s.fire;
    s = clampState({
      ...s,
      fire: false,
      fireTicksLeft: 0,
      grass: wasBurning ? s.grass + 80 : s.grass,
      shrubs: wasBurning ? s.shrubs + 40 : s.shrubs,
    });
    s = {
      ...s,
      campaign: {
        ...s.campaign,
        lastRadio: wasBurning
          ? 'Lin：隔离带接上了，主火线熄下去。焦土还在，但河岸没有被整段吞掉。'
          : 'Lin：隔离带先留在林缘。真正的火还没来，但你已经为第 60 天留下了选择。',
      },
    };
    reply = wasBurning
      ? '人工隔离已生效：火线停止，烧灼后的草和灌丛保留一小段恢复余地。'
      : '人工隔离已部署：第 60 天野火到来时，火势会被削弱。';
  }

  s = pushLog(s, 'user-command', `第 ${s.campaign.day} 天 · 故事决策：${CAMPAIGN_DECISION_LABELS[decision]}。`);
  return {
    state: s,
    reply,
    triggerPredationAnim: false,
  };
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
        ? `${label}已经顶到观察上限 ${bound.max}，我没法再往谷里添了。`
        : `${label}现在大约 ${Math.round(before)}，再减就会穿底，我收手了。`,
      triggerPredationAnim: false,
    };
  }

  let s: EcosystemState = { ...state, [species]: after };
  s = clampState(s);
  const verb = mode === 'add' ? '增补' : '下调';
  const unit = unitOf(species);
  s = pushLog(
    s,
    'user-command',
    `物种简报：${verb} ${actual} ${unit}${label}，现场计数约 ${Math.round(s[species])}。`,
  );

  let openCascade = false;
  if (mode === 'add' && species === 'wolves' && actual > 0) {
    s = enqueueWolfCascade(s, `增补 ${actual} 只狼`);
    openCascade = true;
  }

  const cascadeHint = openCascade
    ? '\n连锁故事面板已打开：狼 → 啃食压力 → 河岸与水狸叙事。数字仍只随时间步与食物链走。'
    : '';

  return {
    state: s,
    reply:
      mode === 'add'
        ? `好——我刚在计数牌上写下：${label}增加 ${actual}${unit === '只' ? ' 只' : ' 单位'}，现在大约 ${Math.round(s[species])}。食物链会慢慢传下去。${cascadeHint}`
        : `记下了：${label}减少 ${actual}，现约 ${Math.round(s[species])}。下游影响会在后续观察里显现。`,
    triggerPredationAnim: false,
    openCascade,
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
      reply: `按仪表盘，眼下最多的是「${name}」（约 ${Math.round(val)}）。完整排序：${entries.map(([n, v]) => `${n} ${Math.round(v)}`).join('、')}。这些都是模拟器状态，不是我口头估的。`,
      triggerPredationAnim: false,
    };
  }

  if (about === 'why_rabbits') {
    const recent = state.log.filter((e) => e.message.includes('兔')).slice(-3);
    const tips = recent.length
      ? recent.map((e) => `· T${e.tick} ${e.message}`).join('\n')
      : '· 近期简报很少直接点名兔子；可能是草量偏紧，或狼群持续施压。';
    return {
      state,
      reply: `兔子现在大约 ${Math.round(state.rabbits)}。我翻了最近的野外简报：\n${tips}\n对照：草 ${Math.round(state.grass)}，狼 ${Math.round(state.wolves)}。`,
      triggerPredationAnim: false,
    };
  }

  return {
    state,
    reply: [
      `第 ${state.tick} 步 · ${SEASON_LABELS[state.season]} · ${state.paused ? '观察暂停' : '巡线中'}`,
      `气温 ${state.temperature}°C · 降雨 ${state.rainfall.toFixed(2)}${state.fire ? ` · 火情(剩${state.fireTicksLeft}步)` : ''}`,
      `草 ${Math.round(state.grass)} · 灌木 ${Math.round(state.shrubs)} · 兔 ${Math.round(state.rabbits)} · 麋鹿 ${Math.round(state.elk)} · 狼 ${Math.round(state.wolves)}`,
    ].join('\n'),
    triggerPredationAnim: false,
  };
}

export { tick };
