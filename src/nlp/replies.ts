import type { EcosystemState } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';

/** 巡护员欢迎语（第一人称野外简报语气） */
export const WELCOME_MESSAGE =
  '你好，我是黄石巡护员 · Ranger Lin。拉马谷只剩 100 天，春天会替我们检查这次营养级联是否成功。每一个决定都会写进电台日志，数字只来自现场仪表。\n你可以按下「投喂草料」「引入狼群」「人工隔离」，也可以试试：「现在谁最多」。';

export const RANGER_NAME = '黄石巡护员 · Ranger Lin';
export const RANGER_SHORT = '巡护员';

export function formatStateBrief(state: EcosystemState): string {
  return `${SEASON_LABELS[state.season]} · T${state.tick} · 草${Math.round(state.grass)} 兔${Math.round(state.rabbits)} 狼${Math.round(state.wolves)}`;
}
