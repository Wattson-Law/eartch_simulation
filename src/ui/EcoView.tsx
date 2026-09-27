import { useState } from 'react';
import type { CampaignDecision, EcosystemState } from '../sim/types';
import type { WildlifeObservation } from '../sim/wildlife';
import { SpeciesPanel } from './SpeciesPanel';
import { PopulationChart } from './PopulationChart';
import { EventLog } from './EventLog';
import { EcoSceneCanvas } from './EcoSceneCanvas';
import { type WildlifeStatus } from './EcoSceneCanvas';
import { PredationAnimation } from './PredationAnimation';
import { WILDLIFE_ACTIVITY_LABELS, WILDLIFE_LABELS, type WildlifeKind } from '../sim/wildlife';
import { FieldNarrative } from './FieldNarrative';
import { type SceneDayPhase } from './sceneEnvironment';
import { CampaignPanel } from './CampaignPanel';

interface Props {
  state: EcosystemState;
  onBack: () => void;
  onTogglePause: () => void;
  onCampaignDecision: (decision: CampaignDecision) => void;
  onRestartCampaign: () => void;
  entryTransition?: boolean;
}

const STATUS_ORDER: WildlifeKind[] = ['wolf', 'deer', 'rabbit'];

export function EcoView({
  state,
  onBack,
  onTogglePause,
  onCampaignDecision,
  onRestartCampaign,
  entryTransition = false,
}: Props) {
  const [observation, setObservation] = useState<WildlifeObservation>({ phase: 'quiet', text: '河谷安静下来，三位代表个体各自在草甸与林缘之间移动。' });
  const [statuses, setStatuses] = useState<WildlifeStatus[]>([]);
  const [dayPhase, setDayPhase] = useState<SceneDayPhase>('noon');
  return (
    <div
      className={`eco-view${entryTransition ? ' eco-view--entering' : ''} eco-view--${state.campaign.act}`}
      data-entry-transition={entryTransition ? 'arrival' : 'idle'}
      data-campaign-event={state.campaign.activeEvent ?? 'quiet'}
      data-vegetation={state.campaign.vegetation}
    >
      <div className="eco-toolbar">
        <button type="button" className="back-btn" onClick={onBack}>
          ← 返回小地球
        </button>
        <div className="eco-heading">
          <span className="eco-eyebrow">YELLOWSTONE</span>
          <h2>黄石生态区 · 拉马谷</h2>
        </div>
        <button type="button" className="pause-btn" onClick={onTogglePause} aria-pressed={state.paused}>
          {state.paused ? '继续观察' : '暂停观察'}
        </button>
      </div>

      <section className="scene-stage" aria-label="拉马谷现场观察">
        <EcoSceneCanvas
          state={state}
          onObservation={setObservation}
          onStatus={setStatuses}
          onDayPhase={setDayPhase}
        />
        <div className="scene-titleplate">
          <span className="scene-titleplate__eyebrow">FIELD OBSERVATION 04</span>
          <strong>拉马谷 · Yellowstone</strong>
          <span>{state.season === 'winter' ? '冬末' : state.season === 'spring' ? '春初' : state.season === 'summer' ? '盛夏' : '秋季'} · {dayPhase === 'dawn' ? '清晨' : dayPhase === 'morning' ? '上午' : dayPhase === 'noon' ? '中午' : dayPhase === 'evening' ? '傍晚' : '夜间'}</span>
        </div>
        <div className="scene-state-chip" aria-live="polite">
          <span className="scene-state-chip__dot" />
          {state.paused ? '观察已暂停' : state.campaign.activeEvent === 'wildfire' ? '林缘火情' : state.campaign.activeEvent === 'blizzard' ? '暴风雪观测' : '现场记录中'}
        </div>
      </section>

      <div className="wildlife-status-strip" aria-label="动物当前行为">
        {STATUS_ORDER.map((kind) => {
          const status = statuses.find((item) => item.kind === kind);
          const currentActivity = status?.activity ?? 'rest';
          const activity = status?.moving && currentActivity === 'roam'
            ? '行走'
            : WILDLIFE_ACTIVITY_LABELS[currentActivity];
          return (
            <div className={`wildlife-status wildlife-status--${status?.activity ?? 'rest'}`} key={kind}>
              <span className="wildlife-status__dot" aria-hidden="true" />
              <span className="wildlife-status__name">{WILDLIFE_LABELS[kind]}</span>
              <span className="wildlife-status__activity">{activity}</span>
            </div>
          );
        })}
      </div>
      <PredationAnimation observation={observation} paused={state.paused} />
      <FieldNarrative
        season={state.season}
        dayPhase={dayPhase}
        observation={observation}
        statuses={statuses}
        tick={state.tick}
        paused={state.paused}
      />
      <CampaignPanel state={state} onDecision={onCampaignDecision} onRestart={onRestartCampaign} />
      <p className="scene-caption">三位代表个体只负责让现场可见；下方证据记录整个拉马谷的数值变化。</p>
      <details className="evidence-drawer">
        <summary>
          <span>观测证据</span>
          <small>全谷地种群 · 事件简报</small>
        </summary>
        <div className="evidence-drawer__body">
          <SpeciesPanel state={state} />
          <div className="eco-bottom">
            <PopulationChart history={state.history} />
            <EventLog log={state.log} />
          </div>
        </div>
      </details>
    </div>
  );
}
