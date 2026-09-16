import type { EcosystemState } from './types';

/** 种群与环境上下界（每 tick 强制夹紧） */
export const BOUNDS = {
  grass: { min: 0, max: 10000 },
  shrubs: { min: 0, max: 5000 },
  rabbits: { min: 0, max: 2000 },
  elk: { min: 0, max: 800 },
  wolves: { min: 0, max: 120 },
  temperature: { min: -30, max: 40 },
  rainfall: { min: 0, max: 1 },
  fireTicksLeft: { min: 0, max: 20 },
} as const;

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** 夹紧种群与环境字段；不改日志/历史 */
export function clampState(state: EcosystemState): EcosystemState {
  return {
    ...state,
    grass: clamp(state.grass, BOUNDS.grass.min, BOUNDS.grass.max),
    shrubs: clamp(state.shrubs, BOUNDS.shrubs.min, BOUNDS.shrubs.max),
    rabbits: clamp(state.rabbits, BOUNDS.rabbits.min, BOUNDS.rabbits.max),
    elk: clamp(state.elk, BOUNDS.elk.min, BOUNDS.elk.max),
    wolves: clamp(state.wolves, BOUNDS.wolves.min, BOUNDS.wolves.max),
    temperature: clamp(state.temperature, BOUNDS.temperature.min, BOUNDS.temperature.max),
    rainfall: clamp(state.rainfall, BOUNDS.rainfall.min, BOUNDS.rainfall.max),
    fireTicksLeft: Math.round(
      clamp(state.fireTicksLeft, BOUNDS.fireTicksLeft.min, BOUNDS.fireTicksLeft.max),
    ),
  };
}
