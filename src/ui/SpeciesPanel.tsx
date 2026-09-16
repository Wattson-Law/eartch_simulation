import type { EcosystemState } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';

interface Props {
  state: EcosystemState;
}

export function SpeciesPanel({ state }: Props) {
  const rows = [
    { icon: '🌿', label: '草', value: Math.round(state.grass), color: '#66bb6a' },
    { icon: '🌳', label: '灌木', value: Math.round(state.shrubs), color: '#9ccc65' },
    { icon: '🐇', label: '兔子', value: Math.round(state.rabbits), color: '#ffb74d' },
    { icon: '🦌', label: '麋鹿', value: Math.round(state.elk), color: '#8d6e63' },
    { icon: '🐺', label: '狼', value: Math.round(state.wolves), color: '#78909c' },
  ];

  return (
    <div className="species-panel">
      <div className="panel-title">黄石宏观生态</div>
      <div className="env-row">
        <span>季节：{SEASON_LABELS[state.season]}</span>
        <span>温度：{state.temperature}°C</span>
        <span>降雨：{state.rainfall.toFixed(2)}</span>
        <span>步数：{state.tick}</span>
        {state.fire && <span className="fire-badge">🔥 火灾中 ({state.fireTicksLeft})</span>}
        {state.paused && <span className="pause-badge">⏸ 暂停</span>}
      </div>
      <div className="species-grid">
        {rows.map((r) => (
          <div key={r.label} className="species-card" style={{ borderColor: r.color }}>
            <div className="species-icon">{r.icon}</div>
            <div className="species-label">{r.label}</div>
            <div className="species-value">{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
