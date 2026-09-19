import type { EcosystemState } from '../sim/types';
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
      <EcoSceneCanvas state={state} />
      <PredationAnimation event={state.lastPredation} paused={state.paused} />
      <p className="scene-caption">画面展示代表个体，完整种群数量见下方。</p>
      <SpeciesPanel state={state} />
      <div className="eco-bottom">
        <PopulationChart history={state.history} />
        <EventLog log={state.log} />
      </div>
    </div>
  );
}
