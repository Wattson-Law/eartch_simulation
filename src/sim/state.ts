import type { EcosystemState, HistoryPoint } from './types';
import { clampState } from './bounds';
import { createCampaignState } from './campaign';

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
    causalQueue: [],
    campaign: createCampaignState(),
  };

  const withLog = pushLog(
    base,
    'system',
    '巡护站开台：拉马谷监测开始，四季与食物链进入记录。',
  );
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
