import type { EcosystemState, Season } from './types';
import { SEASON_ORDER, SEASON_LABELS } from './types';
import { clampState } from './bounds';
import { appendHistory, pushLog } from './state';
import { tickCascades } from './cascade';
import {
  advanceCampaign,
  type CampaignMetrics,
} from './campaign';

// The UI advances one macro tick every 1.8 seconds. Keeping a season on the
// screen for roughly a minute and a half lets a camera pan read as one place
// with one light state; explicit fast-forward commands can still move the
// calendar quickly when the user asks for it.
export const TICKS_PER_SEASON = 48;
const PREDATION_REPORT_INTERVAL = 8;

// Rates are tuned for a several-minute field observation. They keep the
// simplified food chain visibly responsive while avoiding a demo that empties
// the valley before a visitor can inspect all three panorama segments.
const ECOLOGY = {
  rabbitGrassRate: 0.017,
  rabbitFoodDemand: 0.95,
  elkGrassRate: 0.014,
  elkGrassDemand: 2.2,
  elkShrubRate: 0.018,
  elkShrubDemand: 1.6,
  elkFoodDemand: 3.9,
  rabbitBirthRate: 0.055,
  elkBirthRate: 0.026,
  rabbitStarveRate: 0.016,
  elkStarveRate: 0.012,
  winterStress: 0.008,
  winterPlantMultiplier: 0.25,
  wolfPressure: 0.14,
  rabbitPreyRate: 0.035,
  elkPreyRate: 0.018,
  wolfFoodDemand: 0.3,
  wolfBirthRate: 0.02,
  wolfStarveRate: 0.01,
} as const;

/** 季节基准温度与降雨 */
const SEASON_CLIMATE: Record<Season, { temp: number; rain: number }> = {
  spring: { temp: 10, rain: 0.55 },
  summer: { temp: 22, rain: 0.35 },
  autumn: { temp: 8, rain: 0.4 },
  winter: { temp: -8, rain: 0.25 },
};

/**
 * 纯确定性一步推进。
 * 顺序：季节/气候 → 火灾衰减 → 植物 → 草食 → 捕食 → 夹紧 → 历史 → 日志 → 叙事级联。
 */
export function tick(state: EcosystemState): EcosystemState {
  if (state.paused || state.campaign.completed) return state;

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
  s = {
    ...s,
    rainfall: s.rainfall * 0.7 + climate.rain * 0.3,
    temperature: s.temperature * 0.6 + climate.temp * 0.4,
  };

  if (seasonChanged) {
    s = pushLog(
      s,
      'system',
      `季节更迭：拉马谷进入${SEASON_LABELS[nextSeason]}，气候基线随之偏移。`,
    );
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
      s = pushLog(s, 'system', '野火观测：火线熄灭，焦土上植被开始缓慢返青。');
    }
  }

  // —— 植物生长（受降雨、温度、季节影响）——
  const plantFactor = plantGrowthFactor(s);
  const grassGrowth = s.grass * 0.04 * plantFactor + 15 * plantFactor;
  const shrubGrowth = s.shrubs * 0.025 * plantFactor + 8 * plantFactor;
  const winterPlantMultiplier = s.season === 'winter' ? ECOLOGY.winterPlantMultiplier : 1;
  s = {
    ...s,
    grass: s.grass + grassGrowth * winterPlantMultiplier,
    shrubs: s.shrubs + shrubGrowth * winterPlantMultiplier,
  };

  // —— 草食动物：消耗植物并繁殖 ——
  const rabbitEat = Math.min(s.grass * ECOLOGY.rabbitGrassRate, s.rabbits * ECOLOGY.rabbitFoodDemand);
  const elkEatGrass = Math.min(s.grass * ECOLOGY.elkGrassRate, s.elk * ECOLOGY.elkGrassDemand);
  const elkEatShrub = Math.min(s.shrubs * ECOLOGY.elkShrubRate, s.elk * ECOLOGY.elkShrubDemand);

  const rabbitFood = rabbitEat / Math.max(1, s.rabbits * ECOLOGY.rabbitFoodDemand);
  const elkFood =
    (elkEatGrass + elkEatShrub) / Math.max(1, s.elk * ECOLOGY.elkFoodDemand);

  const rabbitBirth = s.rabbits * ECOLOGY.rabbitBirthRate * Math.min(1.5, rabbitFood);
  const elkBirth = s.elk * ECOLOGY.elkBirthRate * Math.min(1.3, elkFood);
  const rabbitStarve = s.rabbits * ECOLOGY.rabbitStarveRate * Math.max(0, 1 - rabbitFood);
  const elkStarve = s.elk * ECOLOGY.elkStarveRate * Math.max(0, 1 - elkFood);
  const winterStress = s.season === 'winter' ? ECOLOGY.winterStress : 0;

  s = {
    ...s,
    grass: s.grass - rabbitEat - elkEatGrass,
    shrubs: s.shrubs - elkEatShrub,
    rabbits: s.rabbits + rabbitBirth - rabbitStarve - s.rabbits * winterStress,
    elk: s.elk + elkBirth - elkStarve - s.elk * winterStress * 0.8,
  };

  // —— 狼捕食草食动物 ——
  const wolfPressure = s.wolves * ECOLOGY.wolfPressure;
  const rabbitPreyPool = s.rabbits * ECOLOGY.rabbitPreyRate;
  const elkPreyPool = s.elk * ECOLOGY.elkPreyRate;
  const totalPreyPool = rabbitPreyPool + elkPreyPool + 0.001;
  const desiredKill = Math.min(wolfPressure, totalPreyPool);

  const rabbitKilled = desiredKill * (rabbitPreyPool / totalPreyPool);
  const elkKilled = desiredKill * (elkPreyPool / totalPreyPool);

  const wolfFood = (rabbitKilled * 0.4 + elkKilled * 1.2) / Math.max(1, s.wolves * ECOLOGY.wolfFoodDemand);
  const wolfBirth = s.wolves * ECOLOGY.wolfBirthRate * Math.min(1.2, wolfFood);
  const wolfStarve = s.wolves * ECOLOGY.wolfStarveRate * Math.max(0, 1 - wolfFood);

  // Population pressure is continuous, but a visible field observation is a
  // sampled event. Reporting every background consumption step made the log
  // and animation look like an endless slapstick chase.
  const predationHappened = (rabbitKilled >= 1 || elkKilled >= 0.5)
    && s.tick % PREDATION_REPORT_INTERVAL === 0;
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
      `河岸猎场：远处记录到一次狼群捕食；约 ${lastPredation.amount} 只${preyLabel}计入食物链消耗，近旁草食动物随即拉开距离。`,
    );
  }

  // The story clock is deliberately downstream from the ecology calculation.
  // It can announce a fixed event and return a visual/numeric effect, but it
  // never becomes a second population engine.
  const campaignMetrics: CampaignMetrics = {
    grass: s.grass,
    shrubs: s.shrubs,
    rabbits: s.rabbits,
    elk: s.elk,
    wolves: s.wolves,
    fire: s.fire,
  };
  const campaignStep = advanceCampaign(s.campaign, campaignMetrics);
  s = { ...s, campaign: campaignStep.campaign };
  if (campaignStep.event === 'blizzard') {
    s = applyBlizzardEffect(s);
    s = pushLog(
      s,
      'system',
      '第 30 天 · 暴风雪提前：积雪压低草场，赤鹿被迫靠近林缘，巡护站进入应急观察。',
    );
  } else if (campaignStep.event === 'wildfire') {
    s = applyWildfireEffect(s, campaignStep.campaign.firebreakPrepared);
    s = pushLog(
      s,
      'system',
      campaignStep.campaign.firebreakPrepared
        ? '第 60 天 · 雷击野火：隔离带截住了主火线，火情仍在，但河岸保住了一部分。'
        : '第 60 天 · 雷击野火：林缘起火，河岸植被进入烧灼与恢复阶段。',
    );
  }
  if (campaignStep.completedNow) {
    s = {
      ...s,
      paused: true,
    };
    s = pushLog(
      s,
      'system',
      `第 100 天 · 春天裁决：${s.campaign.outcome ?? 'balanced_recovery'}。拉马谷的观测窗口结束。`,
    );
  }

  s = clampState(s);
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
  s = tickCascades(s);
  return s;
}

function applyBlizzardEffect(state: EcosystemState): EcosystemState {
  return clampState({
    ...state,
    temperature: state.temperature - 8,
    rainfall: state.rainfall + 0.16,
    grass: state.grass * 0.88,
    shrubs: state.shrubs * 0.92,
    rabbits: state.rabbits * 0.93,
    elk: state.elk * 0.96,
  });
}

function applyWildfireEffect(state: EcosystemState, hasFirebreak: boolean): EcosystemState {
  const grassLoss = hasFirebreak ? 0.1 : 0.2;
  const shrubLoss = hasFirebreak ? 0.08 : 0.16;
  return clampState({
    ...state,
    fire: true,
    fireTicksLeft: hasFirebreak ? 3 : 5,
    grass: state.grass * (1 - grassLoss),
    shrubs: state.shrubs * (1 - shrubLoss),
  });
}

function plantGrowthFactor(s: EcosystemState): number {
  const rainScore = 1 - Math.abs(s.rainfall - 0.5) * 1.2;
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
