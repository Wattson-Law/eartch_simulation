import type { EcosystemState } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';

/** 巡护员欢迎语（第一人称野外简报语气） */
export const WELCOME_MESSAGE =
  '你好，我是黄石巡护员 · Ranger Lin。我会把你的话记进巡护日志，再按谷里真实发生的天气、种群与猎场变化向你汇报——数字只来自现场仪表，我不会口头编造。\n试试：「暴风雪提前」「增加十只狼」「雷击野火」「现在谁最多」。';

export const RANGER_NAME = '黄石巡护员 · Ranger Lin';
export const RANGER_SHORT = '巡护员';

export function formatStateBrief(state: EcosystemState): string {
  return `${SEASON_LABELS[state.season]} · T${state.tick} · 草${Math.round(state.grass)} 兔${Math.round(state.rabbits)} 狼${Math.round(state.wolves)}`;
}
