import type { EcosystemState, Season } from './types';
import { SEASON_ORDER, SEASON_LABELS } from './types';
import { clampState } from './bounds';
import { appendHistory, pushLog } from './state';

const TICKS_PER_SEASON = 8;

/** 季节基准温度与降雨 */
const SEASON_CLIMATE: Record<Season, { temp: number; rain: number }> = {
  spring: { temp: 10, rain: 0.55 },
  summer: { temp: 22, rain: 0.35 },
  autumn: { temp: 8, rain: 0.4 },
  winter: { temp: -8, rain: 0.25 },
};

/**
 * 纯确定性一步推进。
 * 顺序：季节/气候 → 火灾衰减 → 植物 → 草食 → 捕食 → 夹紧 → 历史 → 日志。
 */
export function tick(state: EcosystemState): EcosystemState {
  if (state.paused) return state;

  let s: EcosystemState = {
    ...state,
    tick: state.tick + 1,
    lastPredation: null,
  };

  // —— 季节推进 ——
  const seasonIndex = Math.floor(s.tick / TICKS_PER_SEASON) % 4;
  const nextSeason = SEASON_ORDER[seasonIndex];
  const seasonChanged = nextSeason !== s.season;
  s = { ...s, season: nextSeason };

  const climate = SEASON_CLIMATE[nextSeason];
  // 降雨向季节基准缓慢回归；温度同理（用户命令可临时拉偏）
  s = {
    ...s,
    rainfall: s.rainfall * 0.7 + climate.rain * 0.3,
    temperature: s.temperature * 0.6 + climate.temp * 0.4,
  };

  if (seasonChanged) {
    s = pushLog(s, 'system', `季节切换：进入${SEASON_LABELS[nextSeason]}。`);
  }

  // —— 火灾 ——
  if (s.fire && s.fireTicksLeft > 0) {
    const fireTicksLeft = s.fireTicksLeft - 1;
    const grassLoss = s.grass * 0.12;
    const shrubLoss = s.shrubs * 0.1;
    s = {
      ...s,
      grass: s.grass - grassLoss,
      shrubs: s.shrubs - shrubLoss,
      fireTicksLeft,
      fire: fireTicksLeft > 0,
    };
    if (fireTicksLeft === 0) {
      s = pushLog(s, 'system', '火灾已熄灭，植被开始缓慢恢复。');
    }
  }

  // —— 植物生长（受降雨、温度、季节影响）——
  const plantFactor = plantGrowthFactor(s);
  const grassGrowth = s.grass * 0.04 * plantFactor + 15 * plantFactor;
  const shrubGrowth = s.shrubs * 0.025 * plantFactor + 8 * plantFactor;
  // 冬季植物几乎不长
  const winterMul = s.season === 'winter' ? 0.15 : 1;
  s = {
    ...s,
    grass: s.grass + grassGrowth * winterMul,
    shrubs: s.shrubs + shrubGrowth * winterMul,
  };

  // —— 草食动物：消耗植物并繁殖 ——
  const rabbitEat = Math.min(s.grass * 0.02, s.rabbits * 1.2);
  const elkEatGrass = Math.min(s.grass * 0.015, s.elk * 2.5);
  const elkEatShrub = Math.min(s.shrubs * 0.02, s.elk * 1.8);

  const rabbitFood = rabbitEat / Math.max(1, s.rabbits * 1.2);
  const elkFood =
    (elkEatGrass + elkEatShrub) / Math.max(1, s.elk * 4.3);

  const rabbitBirth = s.rabbits * 0.08 * Math.min(1.5, rabbitFood);
  const elkBirth = s.elk * 0.035 * Math.min(1.3, elkFood);
  // 食物不足时自然死亡
  const rabbitStarve = s.rabbits * 0.04 * Math.max(0, 1 - rabbitFood);
  const elkStarve = s.elk * 0.03 * Math.max(0, 1 - elkFood);
  // 冬季额外压力
  const winterStress = s.season === 'winter' ? 0.025 : 0;

  s = {
    ...s,
    grass: s.grass - rabbitEat - elkEatGrass,
    shrubs: s.shrubs - elkEatShrub,
    rabbits: s.rabbits + rabbitBirth - rabbitStarve - s.rabbits * winterStress,
    elk: s.elk + elkBirth - elkStarve - s.elk * winterStress * 0.8,
  };

  // —— 狼捕食草食动物 ——
  const wolfPressure = s.wolves * 0.35;
  const rabbitPreyPool = s.rabbits * 0.08;
  const elkPreyPool = s.elk * 0.04;
  const totalPreyPool = rabbitPreyPool + elkPreyPool + 0.001;
  const desiredKill = Math.min(wolfPressure, totalPreyPool);

  const rabbitKilled = desiredKill * (rabbitPreyPool / totalPreyPool);
  const elkKilled = desiredKill * (elkPreyPool / totalPreyPool);

  const wolfFood = (rabbitKilled * 0.4 + elkKilled * 1.2) / Math.max(1, s.wolves * 0.5);
  const wolfBirth = s.wolves * 0.02 * Math.min(1.2, wolfFood);
  const wolfStarve = s.wolves * 0.03 * Math.max(0, 1 - wolfFood);

  const predationHappened = rabbitKilled >= 1 || elkKilled >= 0.5;
  let lastPredation: EcosystemState['lastPredation'] = null;
  if (predationHappened) {
    if (rabbitKilled >= elkKilled) {
      lastPredation = { prey: 'rabbits', amount: Math.max(1, Math.round(rabbitKilled)) };
    } else {
      lastPredation = { prey: 'elk', amount: Math.max(1, Math.round(elkKilled)) };
    }
  }

  s = {
    ...s,
    rabbits: s.rabbits - rabbitKilled,
    elk: s.elk - elkKilled,
    wolves: s.wolves + wolfBirth - wolfStarve,
    lastPredation,
  };

  if (predationHappened && lastPredation) {
    const preyLabel = lastPredation.prey === 'rabbits' ? '兔子' : '麋鹿';
    s = pushLog(
      s,
      'predation',
      `狼群捕猎：约 ${lastPredation.amount} 只${preyLabel}被捕食。`,
    );
  }

  s = clampState(s);
  // 取整展示友好（内部仍可有小数，展示层再 round）
  s = {
    ...s,
    grass: Math.round(s.grass * 10) / 10,
    shrubs: Math.round(s.shrubs * 10) / 10,
    rabbits: Math.round(s.rabbits * 10) / 10,
    elk: Math.round(s.elk * 10) / 10,
    wolves: Math.round(s.wolves * 10) / 10,
    temperature: Math.round(s.temperature * 10) / 10,
    rainfall: Math.round(s.rainfall * 1000) / 1000,
  };

  s = appendHistory(s);
  return s;
}

function plantGrowthFactor(s: EcosystemState): number {
  // 降雨最佳约 0.5；过干过湿都减产
  const rainScore = 1 - Math.abs(s.rainfall - 0.5) * 1.2;
  // 温度最佳约 15°C
  const tempScore = 1 - Math.abs(s.temperature - 15) / 40;
  const firePenalty = s.fire ? 0.35 : 1;
  return Math.max(0.05, rainScore * 0.6 + tempScore * 0.4) * firePenalty;
}

/** 连续推进 n 步（快进） */
export function tickMany(state: EcosystemState, n: number): EcosystemState {
  let s = state;
  const steps = Math.max(0, Math.min(200, Math.floor(n)));
  for (let i = 0; i < steps; i++) {
    s = tick({ ...s, paused: false });
  }
  return s;
}
