import { useState } from 'react';
import type { EcosystemState } from '../sim/types';
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

interface Props {
  state: EcosystemState;
  onBack: () => void;
  onOpenCascade?: () => void;
  hasCascade?: boolean;
  onTogglePause: () => void;
  entryTransition?: boolean;
}

const STATUS_ORDER: WildlifeKind[] = ['wolf', 'deer', 'rabbit'];

export function EcoView({ state, onBack, onOpenCascade, hasCascade, onTogglePause, entryTransition = false }: Props) {
  const [observation, setObservation] = useState<WildlifeObservation>({ phase: 'quiet', text: '河谷安静下来，三位代表个体各自在草甸与林缘之间移动。' });
  const [statuses, setStatuses] = useState<WildlifeStatus[]>([]);
  const [dayPhase, setDayPhase] = useState<SceneDayPhase>('noon');
  return (
    <div className={`eco-view${entryTransition ? ' eco-view--entering' : ''}`} data-entry-transition={entryTransition ? 'arrival' : 'idle'}>
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
        {hasCascade && onOpenCascade && (
          <button type="button" className="cascade-open-btn" onClick={onOpenCascade}>
            连锁影响
          </button>
        )}
      </div>
      <EcoSceneCanvas
        state={state}
        onObservation={setObservation}
        onStatus={setStatuses}
        onDayPhase={setDayPhase}
      />
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
      <p className="scene-caption">拖动画面探索拉马谷 · 点选动物查看当前行为。故事线只组织观察顺序，不改动种群数字。</p>
      <SpeciesPanel state={state} />
      <div className="eco-bottom">
        <PopulationChart history={state.history} />
        <EventLog log={state.log} />
      </div>
    </div>
  );
}
