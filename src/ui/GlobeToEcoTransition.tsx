export type GlobeToEcoPhase = 'idle' | 'orbit' | 'arrival';

interface Props {
  phase: GlobeToEcoPhase;
}

/** A short visual handoff from the orbital entrance into the Yellowstone scene. */
export function GlobeToEcoTransition({ phase }: Props) {
  if (phase === 'idle') return null;
  const arriving = phase === 'arrival';
  return (
    <div
      className={`globe-to-eco-transition globe-to-eco-transition--${phase}`}
      data-transition={phase}
      role="status"
      aria-live="polite"
    >
      <div className="globe-to-eco-transition__orbit" aria-hidden="true">
        <span className="globe-to-eco-transition__planet" />
        <span className="globe-to-eco-transition__ring globe-to-eco-transition__ring--one" />
        <span className="globe-to-eco-transition__ring globe-to-eco-transition__ring--two" />
      </div>
      <div className="globe-to-eco-transition__copy">
        <span className="globe-to-eco-transition__eyebrow">{arriving ? 'YELLOWSTONE' : 'ORBITAL VIEW'}</span>
        <strong>{arriving ? '进入黄石生态区' : '正在接近黄石'}</strong>
        <small>{arriving ? '河流、草甸与野生动物正在醒来' : '沿着地球表面的经线下降'}</small>
      </div>
    </div>
  );
}
