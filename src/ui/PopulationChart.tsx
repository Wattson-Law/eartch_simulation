import type { HistoryPoint } from '../sim/types';

interface Props {
  history: HistoryPoint[];
}

const SERIES: { key: keyof Omit<HistoryPoint, 'tick'>; color: string; label: string; scale: number }[] = [
  { key: 'grass', color: '#66bb6a', label: '草', scale: 0.08 },
  { key: 'shrubs', color: '#9ccc65', label: '灌木', scale: 0.12 },
  { key: 'rabbits', color: '#ffb74d', label: '兔子', scale: 1 },
  { key: 'elk', color: '#8d6e63', label: '美洲赤鹿', scale: 2 },
  { key: 'wolves', color: '#78909c', label: '狼', scale: 8 },
];

/** 轻量 SVG 折线种群曲线（无第三方图表库） */
export function PopulationChart({ history }: Props) {
  const w = 420;
  const h = 160;
  const pad = 28;
  const points = history.length > 0 ? history : [{ tick: 0, grass: 0, shrubs: 0, rabbits: 0, elk: 0, wolves: 0 }];

  const maxY = Math.max(
    10,
    ...points.flatMap((p) => SERIES.map((s) => (p[s.key] as number) * s.scale)),
  );

  const xAt = (i: number) => {
    if (points.length <= 1) return pad;
    return pad + (i / (points.length - 1)) * (w - pad * 2);
  };
  const yAt = (v: number) => h - pad - (v / maxY) * (h - pad * 2);

  return (
    <div className="chart-panel">
      <div className="panel-title">种群曲线</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="pop-chart" role="img" aria-label="种群数量曲线">
        <rect x={0} y={0} width={w} height={h} fill="#f7faf5" rx={8} />
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={pad}
            x2={w - pad}
            y1={yAt(maxY * t)}
            y2={yAt(maxY * t)}
            stroke="#e0e8dc"
            strokeWidth={1}
          />
        ))}
        {SERIES.map((s) => {
          const d = points
            .map((p, i) => {
              const x = xAt(i);
              const y = yAt((p[s.key] as number) * s.scale);
              return `${i === 0 ? 'M' : 'L'}${x},${y}`;
            })
            .join(' ');
          return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />;
        })}
      </svg>
      <ul className="chart-legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
