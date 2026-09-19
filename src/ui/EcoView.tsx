import { useState } from 'react';
import type { EcosystemState } from '../sim/types';
import type { WildlifeObservation } from '../sim/wildlife';
import { SpeciesPanel } from './SpeciesPanel';
import { PopulationChart } from './PopulationChart';
import { EventLog } from './EventLog';
import { EcoSceneCanvas } from './EcoSceneCanvas';
import { PredationAnimation } from './PredationAnimation';

interface Props {
  state: EcosystemState;
  onBack: () => void;
  onOpenCascade?: () => void;
  hasCascade?: boolean;
  onTogglePause: () => void;
}

export function EcoView({ state, onBack, onOpenCascade, hasCascade, onTogglePause }: Props) {
  const [observation, setObservation] = useState<WildlifeObservation>({ phase: 'quiet', text: '野兔穿行草丛，鹿群在河谷觅食。' });
  return (
    <div className="eco-view">
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
      <EcoSceneCanvas state={state} onObservation={setObservation} />
      <PredationAnimation observation={observation} paused={state.paused} />
      <p className="scene-caption">观察它们觅食、追逐与休息 · 点选动物查看当前行为。画面展示代表个体。</p>
      <SpeciesPanel state={state} />
      <div className="eco-bottom">
        <PopulationChart history={state.history} />
        <EventLog log={state.log} />
      </div>
    </div>
  );
}
