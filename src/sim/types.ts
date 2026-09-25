/** 季节 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 事件来源：便于评审追因果（内部字段，UI 可弱化展示） */
export type EventSource = 'system' | 'user-command' | 'predation';

/** 物种键 */
export type SpeciesKey = 'grass' | 'shrubs' | 'rabbits' | 'elk' | 'wolves';

/**
 * A short, deterministic field story layered on top of the macro simulator.
 * The story owns pacing and presentation state; it never replaces the
 * population variables below.
 */
export type CampaignAct = 'alarm' | 'storm' | 'verdict';
export type CampaignEvent = 'blizzard' | 'wildfire';
export type CampaignDecision = 'feed_forage' | 'introduce_wolves' | 'isolate_fire';
export type VegetationTier = 'stressed' | 'recovering' | 'lush' | 'burned';
export type CampaignOutcome =
  | 'green_miracle'
  | 'balanced_recovery'
  | 'desertification'
  | 'wolves_overrun';

export interface CampaignState {
  /** One-based story day. The opening radio call is Day 1. */
  day: number;
  totalDays: 100;
  act: CampaignAct;
  activeEvent: CampaignEvent | null;
  lastEvent: CampaignEvent | null;
  eventDays: { blizzard: number | null; wildfire: number | null };
  decisions: Record<CampaignDecision, number>;
  firebreakPrepared: boolean;
  /** Consecutive days that satisfy the safe trophic-cascade conditions. */
  cascadeSafeDays: number;
  vegetation: VegetationTier;
  outcome: CampaignOutcome | null;
  completed: boolean;
  lastRadio: string;
  lastDecision: CampaignDecision | null;
}

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
  | { type: 'query'; about: 'most' | 'status' | 'why_rabbits' }
  | { type: 'tourist_conflict' }
  | { type: 'campaign_decision'; decision: CampaignDecision };

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

/** 叙事级联阶段（不改种群数字） */
export type CascadeStageStatus = 'pending' | 'active' | 'done';

export interface CascadeStage {
  id: string;
  title: string;
  story: string;
  status: CascadeStageStatus;
  delayTicks: number;
}

export interface CausalCascade {
  id: string;
  title: string;
  triggerLabel: string;
  startedAtTick: number;
  stages: CascadeStage[];
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
  /** 叙事级联队列（不改种群数字） */
  causalQueue: CausalCascade[];
  /** 固定 100 天故事层；数值引擎仍由 tick/applyCommand 独占写入。 */
  campaign: CampaignState;
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
