import type {
  CampaignAct,
  CampaignDecision,
  CampaignEvent,
  CampaignOutcome,
  CampaignState,
  VegetationTier,
} from './types';

export const CAMPAIGN_TOTAL_DAYS = 100;
export const CASCADE_RECOVERY_DAYS = 20;

export interface CampaignMetrics {
  grass: number;
  shrubs: number;
  rabbits: number;
  elk: number;
  wolves: number;
  fire: boolean;
}

export interface CampaignStepResult {
  campaign: CampaignState;
  event: CampaignEvent | null;
  completedNow: boolean;
}

export interface CampaignDecisionResult {
  campaign: CampaignState;
  accepted: boolean;
  reason: string;
}

export const CAMPAIGN_DECISION_LABELS: Record<CampaignDecision, string> = {
  feed_forage: '投喂草料',
  introduce_wolves: '引入狼群',
  isolate_fire: '人工隔离',
};

export const CAMPAIGN_ACT_LABELS: Record<CampaignAct, string> = {
  alarm: '第一幕 · 失衡的警报',
  storm: '第二幕 · 天灾与波折',
  verdict: '第三幕 · 春天的裁决',
};

export const CAMPAIGN_OUTCOME_LABELS: Record<CampaignOutcome, string> = {
  green_miracle: '绿色奇迹',
  balanced_recovery: '谨慎的复苏',
  desertification: '荒漠化的代价',
  wolves_overrun: '狼群过量的回声',
};

export function createCampaignState(): CampaignState {
  return {
    day: 1,
    totalDays: CAMPAIGN_TOTAL_DAYS,
    act: 'alarm',
    activeEvent: null,
    lastEvent: null,
    eventDays: { blizzard: null, wildfire: null },
    decisions: { feed_forage: 0, introduce_wolves: 0, isolate_fire: 0 },
    firebreakPrepared: false,
    cascadeSafeDays: 0,
    vegetation: 'stressed',
    outcome: null,
    completed: false,
    lastRadio: '专员，拉马谷的河岸灌木已经被马鹿啃得太低。还有 100 天，我们要让春天看见一条活着的河。',
    lastDecision: null,
  };
}

export function campaignAct(day: number): CampaignAct {
  if (day <= 30) return 'alarm';
  if (day <= 70) return 'storm';
  return 'verdict';
}

export function campaignObjective(act: CampaignAct): string {
  if (act === 'alarm') return '让狼群回到安全区间，给河岸灌木争取恢复时间。';
  if (act === 'storm') return '在暴风雪与野火之间保住食物链，不让干预变成新的失衡。';
  return '等春天裁决：连续的营养级联能否把拉马谷带回绿色状态。';
}

export function campaignEventLabel(event: CampaignEvent): string {
  return event === 'blizzard' ? '暴风雪提前' : '雷击野火';
}

/**
 * Advance exactly one story day. This function only changes campaign data;
 * the caller applies the returned fixed-event effect to EcosystemState.
 */
export function advanceCampaign(campaign: CampaignState, metrics: CampaignMetrics): CampaignStepResult {
  if (campaign.completed) return { campaign, event: null, completedNow: false };

  const day = Math.min(CAMPAIGN_TOTAL_DAYS, campaign.day + 1);
  const act = campaignAct(day);
  let next: CampaignState = {
    ...campaign,
    day,
    act,
    activeEvent: metrics.fire ? 'wildfire' : null,
    lastEvent: campaign.lastEvent,
    eventDays: { ...campaign.eventDays },
    decisions: { ...campaign.decisions },
    completed: false,
  };
  let event: CampaignEvent | null = null;

  if (day === 30 && next.eventDays.blizzard == null) {
    event = 'blizzard';
    next = {
      ...next,
      activeEvent: event,
      lastEvent: event,
      eventDays: { ...next.eventDays, blizzard: day },
      lastRadio: 'Lin 呼叫专员：暴风雪提前了。请先保住河岸的食物，再决定要不要把手伸进自然。',
    };
  }
  if (day === 60 && next.eventDays.wildfire == null) {
    event = 'wildfire';
    next = {
      ...next,
      activeEvent: event,
      lastEvent: event,
      eventDays: { ...next.eventDays, wildfire: day },
      lastRadio: next.firebreakPrepared
        ? 'Lin 呼叫专员：雷击点燃了林缘，但你提前做的隔离带还在。火线会短一些，河岸有机会留下。'
        : 'Lin 呼叫专员：雷击野火从林缘起来了。现在决定，是隔离火线，还是让谷地自己恢复。',
    };
  }

  const cascadeReady = isCascadeSafe(metrics);
  const cascadeSafeDays = cascadeReady
    ? Math.min(CAMPAIGN_TOTAL_DAYS, next.cascadeSafeDays + 1)
    : 0;
  const vegetation = vegetationTier(next, metrics, cascadeSafeDays);
  next = { ...next, cascadeSafeDays, vegetation };

  let completedNow = false;
  if (day >= CAMPAIGN_TOTAL_DAYS && !next.completed) {
    const outcome = classifyCampaignOutcome({ ...metrics, fire: metrics.fire }, next);
    completedNow = true;
    next = {
      ...next,
      day: CAMPAIGN_TOTAL_DAYS,
      act: 'verdict',
      activeEvent: null,
      completed: true,
      outcome,
      lastRadio: outcomeRadio(outcome, next),
    };
  }

  return { campaign: next, event, completedNow };
}

export function applyCampaignDecision(
  campaign: CampaignState,
  decision: CampaignDecision,
): CampaignDecisionResult {
  if (campaign.completed) {
    return { campaign, accepted: false, reason: '100 天已经走完，电台正在保存春天的裁决。' };
  }
  if (campaign.decisions[decision] > 0) {
    return {
      campaign,
      accepted: false,
      reason: `「${CAMPAIGN_DECISION_LABELS[decision]}」这一项已经执行过，先观察它留下的后果。`,
    };
  }
  const next: CampaignState = {
    ...campaign,
    decisions: { ...campaign.decisions, [decision]: 1 },
    firebreakPrepared: campaign.firebreakPrepared || decision === 'isolate_fire',
    lastDecision: decision,
  };
  return { campaign: next, accepted: true, reason: '' };
}

export function isCascadeSafe(metrics: CampaignMetrics): boolean {
  return !metrics.fire
    // The opening valley has too few wolves by design. The first decision is
    // meaningful because the 20-day recovery streak cannot begin until the
    // pack reaches this safe pressure band.
    && metrics.wolves >= 28
    && metrics.wolves <= 42
    && metrics.elk <= 215
    && metrics.grass >= 900
    && metrics.shrubs >= 420;
}

export function classifyCampaignOutcome(metrics: CampaignMetrics, campaign: CampaignState): CampaignOutcome {
  if (metrics.wolves > 58 || (campaign.decisions.introduce_wolves > 0 && metrics.wolves > 48)) {
    return 'wolves_overrun';
  }
  if (
    metrics.grass < 650
    || metrics.shrubs < 260
    || campaign.vegetation === 'burned'
    || (campaign.eventDays.wildfire != null
      && campaign.decisions.isolate_fire === 0
      && campaign.decisions.feed_forage === 0)
  ) {
    return 'desertification';
  }
  if (
    campaign.vegetation === 'lush'
    && campaign.cascadeSafeDays >= CASCADE_RECOVERY_DAYS
    && campaign.decisions.introduce_wolves > 0
    && campaign.decisions.isolate_fire > 0
  ) {
    return 'green_miracle';
  }
  return 'balanced_recovery';
}

function vegetationTier(
  campaign: CampaignState,
  metrics: CampaignMetrics,
  cascadeSafeDays: number,
): VegetationTier {
  if (metrics.fire) return 'burned';
  if (cascadeSafeDays >= CASCADE_RECOVERY_DAYS) return 'lush';
  if (cascadeSafeDays >= 8) return 'recovering';
  return campaign.vegetation === 'burned' && cascadeSafeDays < 4 ? 'burned' : 'stressed';
}

function outcomeRadio(outcome: CampaignOutcome, campaign: CampaignState): string {
  if (outcome === 'green_miracle') return 'Lin：专员，河岸柳树重新抽芽了。不是某一个按钮救了拉马谷，是连续 20 天没有打断的营养级联。';
  if (outcome === 'desertification') return 'Lin：春天到了，但河岸没有回来。我们把每一次延误都写进了最后一页。';
  if (outcome === 'wolves_overrun') return 'Lin：狼群的影子已经盖过了整个食物链。恢复平衡，比增加一个数字更难。';
  return campaign.cascadeSafeDays >= 10
    ? 'Lin：春天给了我们一条窄路。河岸还不茂密，但已经开始把水留在谷里。'
    : 'Lin：春天到了，拉马谷暂时稳定。下一季还需要更少的急着干预。';
}
