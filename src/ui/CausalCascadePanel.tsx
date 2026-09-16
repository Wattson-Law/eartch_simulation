import type { CausalCascade, CascadeStageStatus } from '../sim/types';

interface Props {
  cascade: CausalCascade | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<CascadeStageStatus, string> = {
  pending: '未开始',
  active: '进行中',
  done: '已发生',
};

export function CausalCascadePanel({ cascade, open, onClose }: Props) {
  if (!open || !cascade) return null;

  return (
    <div className="cascade-overlay" role="dialog" aria-modal="true" aria-label={cascade.title}>
      <div className="cascade-card">
        <header className="cascade-header">
          <div>
            <div className="cascade-kicker">WOLF INTRODUCTION · Chain Impact</div>
            <h3>{cascade.title}</h3>
            <p className="cascade-trigger">触发：{cascade.triggerLabel} · 自 T{cascade.startedAtTick}</p>
          </div>
          <button type="button" className="cascade-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="cascade-flow">
          {cascade.stages.map((stage, i) => (
            <div key={stage.id} className="cascade-flow-item">
              {i > 0 && <div className="cascade-arrow" aria-hidden>→</div>}
              <div className={`cascade-node cascade-node--${stage.status}`}>
                <div className="cascade-node-title">{stage.title}</div>
                <span className={`cascade-badge cascade-badge--${stage.status}`}>
                  {STATUS_LABEL[stage.status]}
                </span>
              </div>
            </div>
          ))}
        </div>

        <ol className="cascade-stages">
          {cascade.stages.map((stage, i) => (
            <li key={stage.id} className={`cascade-stage cascade-stage--${stage.status}`}>
              <div className="cascade-stage-head">
                <span className="cascade-stage-idx">{i + 1}</span>
                <strong>{stage.title}</strong>
                <span className={`cascade-badge cascade-badge--${stage.status}`}>
                  {STATUS_LABEL[stage.status]}
                </span>
              </div>
              <p>{stage.story}</p>
            </li>
          ))}
        </ol>

        <p className="cascade-footnote">
          叙事级联只讲故事与阶段解锁；种群与环境数字仍只由确定性时间步 / 指令结算。
        </p>
      </div>
    </div>
  );
}
