import type { EcosystemState } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';
import { ANIMAL_SHEETS, PLANT_THUMBS } from '../assetsPaths';

interface Props {
  state: EcosystemState;
}

type Row = {
  label: string;
  value: number;
  color: string;
  emoji?: string;
  /** Full plant PNG thumbnail (not a spritesheet) */
  plantThumb?: string;
  sheet?: { src: string; frameW: number; frameH: number };
};

export function SpeciesPanel({ state }: Props) {
  const rows: Row[] = [
    {
      label: '草',
      value: Math.round(state.grass),
      color: '#66bb6a',
      plantThumb: PLANT_THUMBS.grass,
    },
    {
      label: '灌木',
      value: Math.round(state.shrubs),
      color: '#9ccc65',
      plantThumb: PLANT_THUMBS.shrubs,
    },
    {
      label: '兔子',
      value: Math.round(state.rabbits),
      color: '#ffb74d',
      sheet: {
        src: ANIMAL_SHEETS.rabbitIdle.src,
        frameW: ANIMAL_SHEETS.rabbitIdle.frameW,
        frameH: ANIMAL_SHEETS.rabbitIdle.frameH,
      },
    },
    {
      label: '麋鹿',
      value: Math.round(state.elk),
      color: '#8d6e63',
      sheet: {
        src: ANIMAL_SHEETS.deerIdle.src,
        frameW: ANIMAL_SHEETS.deerIdle.frameW,
        frameH: ANIMAL_SHEETS.deerIdle.frameH,
      },
    },
    {
      label: '狼',
      value: Math.round(state.wolves),
      color: '#78909c',
      sheet: {
        src: ANIMAL_SHEETS.wolfHowl.src,
        frameW: ANIMAL_SHEETS.wolfHowl.frameW,
        frameH: ANIMAL_SHEETS.wolfHowl.frameH,
      },
    },
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
            <div className="species-icon">
              {r.plantThumb ? (
                <img
                  className="species-thumb species-thumb-plant"
                  src={r.plantThumb}
                  alt={r.label}
                  width={36}
                  height={28}
                />
              ) : r.sheet ? (
                <span
                  className="species-thumb"
                  style={{
                    width: Math.min(36, r.sheet.frameW),
                    height: Math.min(28, r.sheet.frameH),
                    backgroundImage: `url(${r.sheet.src})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: 'auto 100%',
                    backgroundPosition: '0 0',
                    imageRendering: 'pixelated',
                    display: 'inline-block',
                  }}
                  role="img"
                  aria-label={r.label}
                />
              ) : (
                r.emoji
              )}
            </div>
            <div className="species-label">{r.label}</div>
            <div className="species-value">{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
