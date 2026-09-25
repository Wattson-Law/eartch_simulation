import { useEffect, useState } from 'react';
import type { CampaignDecision, CampaignOutcome, EcosystemState } from '../sim/types';
import {
  CAMPAIGN_ACT_LABELS,
  CAMPAIGN_DECISION_LABELS,
  CAMPAIGN_OUTCOME_LABELS,
  campaignObjective,
} from '../sim/campaign';

interface Props {
  state: EcosystemState;
  onDecision: (decision: CampaignDecision) => void;
  onRestart: () => void;
}

const DECISIONS: readonly {
  id: CampaignDecision;
  icon: string;
  title: string;
  detail: string;
}[] = [
  {
    id: 'feed_forage',
    icon: '🌾',
    title: '投喂草料',
    detail: '立刻补充草与灌丛，缓解短期饥饿。',
  },
  {
    id: 'introduce_wolves',
    icon: '🐺',
    title: '引入狼群',
    detail: '把捕食压力拉回安全区，启动营养级联。',
  },
  {
    id: 'isolate_fire',
    icon: '🧯',
    title: '人工隔离',
    detail: '提前部署或扑灭火线，留下河岸恢复空间。',
  },
];

const OUTCOME_COPY: Record<CampaignOutcome, string> = {
  green_miracle: '连续的安全压力让赤鹿重新移动，河岸柳树抽芽，营养级联完成了一次可见的回归。',
  balanced_recovery: '拉马谷没有崩溃，也还没有完全复绿。下一季需要更少的急救式干预。',
  desertification: '火与饥饿留下了比数字更长的尾巴。春天到来时，河岸仍然缺少可以抓住水土的植被。',
  wolves_overrun: '狼群超过了安全压力带。一个正确的方向，如果没有边界，也会变成新的失衡。',
};

function eventCopy(state: EcosystemState) {
  if (state.fire || state.campaign.activeEvent === 'wildfire') return '林缘野火正在改变第 60 天之后的每一条恢复路径。';
  if (state.campaign.activeEvent === 'blizzard' || state.campaign.lastEvent === 'blizzard') return '暴风雪提前，食物与掩体同时变得稀缺。';
  return null;
}

export function CampaignPanel({ state, onDecision, onRestart }: Props) {
  const campaign = state.campaign;
  const [typedRadio, setTypedRadio] = useState(() => campaign.lastRadio);

  useEffect(() => {
    let cursor = 0;
    const timer = window.setInterval(() => {
      cursor += 2;
      setTypedRadio(campaign.lastRadio.slice(0, cursor));
      if (cursor >= campaign.lastRadio.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [campaign.lastRadio]);

  const event = eventCopy(state);
  const progress = Math.max(0, Math.min(1, (campaign.day - 1) / (campaign.totalDays - 1)));
  const remaining = Math.max(0, campaign.totalDays - campaign.day);

  return (
    <section className={`campaign-panel campaign-panel--${campaign.act}`} data-campaign-day={campaign.day}>
      <div className="campaign-panel__topline">
        <div>
          <span className="campaign-panel__eyebrow">THE LAMAR VALLEY TAPES</span>
          <h3>拉马谷的最后 100 天</h3>
        </div>
        <div className="campaign-day" aria-label={`第 ${campaign.day} 天，共 ${campaign.totalDays} 天`}>
          <strong>DAY {String(campaign.day).padStart(2, '0')}</strong>
          <span>/ {campaign.totalDays}</span>
        </div>
      </div>

      <div className="campaign-progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
        <i className="campaign-progress__marker campaign-progress__marker--storm" style={{ left: '29%' }} />
        <i className="campaign-progress__marker campaign-progress__marker--fire" style={{ left: '59%' }} />
      </div>

      <div className="campaign-panel__body">
        <div className="campaign-panel__story">
          <div className="campaign-act">{CAMPAIGN_ACT_LABELS[campaign.act]}</div>
          <p className="campaign-objective">{campaignObjective(campaign.act)}</p>
          <div className="campaign-meters">
            <span><b>{remaining}</b> 天后春天评估</span>
            <span><b>{campaign.cascadeSafeDays}</b> 天营养级联</span>
            <span className={`campaign-vegetation campaign-vegetation--${campaign.vegetation}`}>
              {campaign.vegetation === 'lush' ? '河岸复绿' : campaign.vegetation === 'recovering' ? '正在恢复' : campaign.vegetation === 'burned' ? '烧灼阶段' : '植被承压'}
            </span>
          </div>
          {event && <div className="campaign-event-banner">⚠ {event}</div>}
        </div>

        <div className="campaign-radio" aria-live="polite">
          <div className="campaign-radio__head">
            <span className="campaign-radio__dot" />
            <span>LIN / FIELD RADIO 04</span>
            <span className="campaign-radio__day">T{state.tick}</span>
          </div>
          <p>{typedRadio}<span className="campaign-radio__cursor" aria-hidden="true">▌</span></p>
        </div>
      </div>

      {campaign.completed && campaign.outcome ? (
        <div className={`campaign-verdict campaign-verdict--${campaign.outcome}`}>
          <div>
            <span className="campaign-verdict__eyebrow">SPRING ASSESSMENT · DAY 100</span>
            <h4>{CAMPAIGN_OUTCOME_LABELS[campaign.outcome]}</h4>
            <p>{OUTCOME_COPY[campaign.outcome]}</p>
          </div>
          <button type="button" className="campaign-restart" onClick={onRestart}>重新记录一季</button>
        </div>
      ) : (
        <div className="campaign-decisions" aria-label="故事决策">
          <div className="campaign-decisions__head">
            <span>专员决策</span>
            <small>每项只执行一次，后果留在 100 天里</small>
          </div>
          <div className="campaign-decisions__grid">
            {DECISIONS.map((decision) => {
              const used = campaign.decisions[decision.id] > 0;
              return (
                <button
                  type="button"
                  key={decision.id}
                  className={`campaign-decision${used ? ' is-used' : ''}`}
                  disabled={used}
                  onClick={() => onDecision(decision.id)}
                >
                  <span className="campaign-decision__icon" aria-hidden="true">{decision.icon}</span>
                  <span className="campaign-decision__copy">
                    <strong>{CAMPAIGN_DECISION_LABELS[decision.id]}</strong>
                    <small>{used ? '已写入电台日志' : decision.detail}</small>
                  </span>
                  <span className="campaign-decision__mark" aria-hidden="true">{used ? '✓' : '＋'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
