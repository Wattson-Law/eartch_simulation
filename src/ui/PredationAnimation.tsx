import type { WildlifeObservation } from '../sim/wildlife';

interface Props {
  observation: WildlifeObservation;
  paused: boolean;
}

const PHASES = { quiet: '河谷日常', stalk: '发现踪迹', chase: '追逐中', caught: '捕食结束', escaped: '成功脱险' };

/** Describes the encounter actually unfolding in the landscape above. */
export function PredationAnimation({ observation, paused }: Props) {
  const phase = observation.phase;
  return (
    <div className={`field-observation phase-${phase}${paused ? ' is-paused' : ''}`}>
      <div className="observation-copy">
        <span className="observation-label"><span className="observation-dot" />{paused ? '观察已暂停' : PHASES[phase]}</span>
        <span className="observation-text" role="status">{observation.text}</span>
      </div>
      <div className="observation-rhythm" aria-hidden="true">
        {['stalk', 'chase', 'caught'].map((step, index) => (
          <span key={step} className={phase === step || (phase === 'escaped' && index === 2) ? 'is-current' : ''} />
        ))}
      </div>
    </div>
  );
}
