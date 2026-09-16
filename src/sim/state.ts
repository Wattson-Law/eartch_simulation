import type { EcosystemState, HistoryPoint } from './types';
import { clampState } from './bounds';

export function createInitialState(): EcosystemState {
  const base: EcosystemState = {
    grass: 4200,
    shrubs: 1800,
    rabbits: 320,
    elk: 180,
    wolves: 24,
    season: 'spring',
    temperature: 12,
    rainfall: 0.45,
    fire: false,
    fireTicksLeft: 0,
    tick: 0,
    paused: false,
    log: [],
    history: [],
    lastPredation: null,
    nextLogId: 1,
  };

  const withLog = pushLog(base, 'system', '黄石宏观生态模拟已启动。四季与食物链开始运转。');
  const withHistory = appendHistory(withLog);
  return clampState(withHistory);
}

export function pushLog(
  state: EcosystemState,
  source: EcosystemState['log'][0]['source'],
  message: string,
): EcosystemState {
  const entry = {
    id: state.nextLogId,
    tick: state.tick,
    source,
    message,
    timestamp: Date.now(),
  };
  return {
    ...state,
    nextLogId: state.nextLogId + 1,
    log: [...state.log.slice(-199), entry],
  };
}

export function appendHistory(state: EcosystemState): EcosystemState {
  const point: HistoryPoint = {
    tick: state.tick,
    grass: Math.round(state.grass),
    shrubs: Math.round(state.shrubs),
    rabbits: Math.round(state.rabbits),
    elk: Math.round(state.elk),
    wolves: Math.round(state.wolves),
  };
  return {
    ...state,
    history: [...state.history.slice(-119), point],
  };
}
