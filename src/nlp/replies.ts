import type { EcosystemState } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';

/** 系统欢迎语 */
export const WELCOME_MESSAGE =
  '你好，我是生态系统管理员。我会把你的中文指令解析成结构化事件，交由确定性模拟器执行，然后只解释模拟器实际改变了什么——我不会私自改数字。\n试试：「下雨三周」「增加十只狼」「快进到冬天」「现在谁最多」。';

export function formatStateBrief(state: EcosystemState): string {
  return `${SEASON_LABELS[state.season]} · T${state.tick} · 草${Math.round(state.grass)} 兔${Math.round(state.rabbits)} 狼${Math.round(state.wolves)}`;
}
