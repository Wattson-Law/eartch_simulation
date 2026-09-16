/** 季节 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 事件来源：便于评审追因果 */
export type EventSource = 'system' | 'user-command' | 'predation';

/** 物种键 */
export type SpeciesKey = 'grass' | 'shrubs' | 'rabbits' | 'elk' | 'wolves';

/** 结构化用户/系统命令 */
export type SimCommand =
  | { type: 'set_rain'; weeks: number }
  | { type: 'set_temperature'; delta: number }
  | { type: 'trigger_fire' }
  | { type: 'add_species'; species: SpeciesKey; amount: number }
  | { type: 'remove_species'; species: SpeciesKey; amount: number }
  | { type: 'force_season'; season: Season }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'fast_forward'; ticks: number }
  | { type: 'query'; about: 'most' | 'status' | 'why_rabbits' };

/** 事件日志条目 */
export interface LogEntry {
  id: number;
  tick: number;
  source: EventSource;
  message: string;
  timestamp: number;
}

/** 种群历史点（用于曲线） */
export interface HistoryPoint {
  tick: number;
  grass: number;
  shrubs: number;
  rabbits: number;
  elk: number;
  wolves: number;
}

/** 核心生态状态 */
export interface EcosystemState {
  grass: number;
  shrubs: number;
  rabbits: number;
  elk: number;
  wolves: number;
  season: Season;
  temperature: number; // °C
  rainfall: number; // 0–1 相对湿度/降雨强度
  fire: boolean;
  fireTicksLeft: number;
  tick: number;
  paused: boolean;
  log: LogEntry[];
  history: HistoryPoint[];
  /** 最近一次捕食，用于触发动画 */
  lastPredation: { prey: 'rabbits' | 'elk'; amount: number } | null;
  nextLogId: number;
}

export const SEASON_LABELS: Record<Season, string> = {
  spring: '春天',
  summer: '夏天',
  autumn: '秋天',
  winter: '冬天',
};

export const SPECIES_LABELS: Record<SpeciesKey, string> = {
  grass: '草',
  shrubs: '灌木',
  rabbits: '兔子',
  elk: '麋鹿',
  wolves: '狼',
};

export const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];
