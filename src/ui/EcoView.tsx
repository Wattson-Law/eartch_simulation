import type { EcosystemState } from '../sim/types';
import { SpeciesPanel } from './SpeciesPanel';
import { PopulationChart } from './PopulationChart';
import { EventLog } from './EventLog';
import { EcoSceneCanvas } from './EcoSceneCanvas';

interface Props {
  state: EcosystemState;
  onBack: () => void;
}

export function EcoView({ state, onBack }: Props) {
  return (
    <div className="eco-view">
      <div className="eco-toolbar">
        <button type="button" className="back-btn" onClick={onBack}>
          ← 返回小地球
        </button>
        <h2>黄石生态区</h2>
      </div>
      <EcoSceneCanvas state={state} />
      <SpeciesPanel state={state} />
      <div className="eco-bottom">
        <PopulationChart history={state.history} />
        <EventLog log={state.log} />
      </div>
    </div>
  );
}
