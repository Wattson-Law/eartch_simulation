import { useEffect, useState } from 'react';
import type { EcosystemState } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';
import { CAMPAIGN_ACT_LABELS, CAMPAIGN_OUTCOME_LABELS } from '../sim/campaign';
import { ANIMAL_SHEETS, PLANT_THUMBS, loadEcosystemManifest, loadImage, type ScenePropMeta, type SheetMeta } from '../assetsPaths';

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
  sheet?: SheetMeta;
};

interface PanelArt {
  grass?: ScenePropMeta;
  shrubs?: ScenePropMeta;
  rabbit?: SheetMeta;
  elk?: SheetMeta;
  wolf?: SheetMeta;
}

export function SpeciesPanel({ state }: Props) {
  const [art, setArt] = useState<PanelArt>({});
  useEffect(() => {
    let cancelled = false;
    async function available<T extends { src: string }>(meta: T | undefined): Promise<T | undefined> {
      if (!meta) return undefined;
      try { await loadImage(meta.src); return meta; }
      catch { return undefined; }
    }
    void loadEcosystemManifest().then(async (manifest) => {
      if (!manifest) return;
      const [grass, shrubs, rabbit, elk, wolf] = await Promise.all([
        available(manifest.props?.['grass-daisies']),
        available(manifest.props?.['golden-shrub']),
        available(manifest.animals.rabbit?.idle),
        available(manifest.animals.elk?.idle),
        available(manifest.animals.wolf?.idle),
      ]);
      if (!cancelled) setArt({ grass, shrubs, rabbit, elk, wolf });
    });
    return () => { cancelled = true; };
  }, []);

  const rows: Row[] = [
    {
      label: '草',
      value: Math.round(state.grass),
      color: '#66bb6a',
      plantThumb: art.grass?.src ?? PLANT_THUMBS.grass,
    },
    {
      label: '灌木',
      value: Math.round(state.shrubs),
      color: '#9ccc65',
      plantThumb: art.shrubs?.src ?? PLANT_THUMBS.shrubs,
    },
    {
      label: '野兔',
      value: Math.round(state.rabbits),
      color: '#ffb74d',
      sheet: art.rabbit ?? ANIMAL_SHEETS.rabbitIdle,
    },
    {
      label: '美洲赤鹿',
      value: Math.round(state.elk),
      color: '#8d6e63',
      sheet: art.elk ?? ANIMAL_SHEETS.elkIdle,
    },
    {
      label: '灰狼',
      value: Math.round(state.wolves),
      color: '#78909c',
      sheet: art.wolf ?? ANIMAL_SHEETS.wolfIdle,
    },
  ];

  return (
    <div className="species-panel">
      <div className="panel-title">黄石宏观生态 <span className="panel-title-note">三位代表个体 · 全谷地数量</span></div>
      <div className="env-row">
        <span>季节：{SEASON_LABELS[state.season]}</span>
        <span>温度：{state.temperature}°C</span>
        <span>降雨：{state.rainfall.toFixed(2)}</span>
        <span>故事：Day {state.campaign.day}/{state.campaign.totalDays}</span>
        <span>{CAMPAIGN_ACT_LABELS[state.campaign.act]}</span>
        {state.fire && <span className="fire-badge">🔥 火灾中 ({state.fireTicksLeft})</span>}
        {state.paused && <span className="pause-badge">⏸ 暂停</span>}
        {state.campaign.outcome && <span className="outcome-badge">{CAMPAIGN_OUTCOME_LABELS[state.campaign.outcome]}</span>}
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
                    width: 48,
                    aspectRatio: r.sheet.frameW / r.sheet.frameH,
                    backgroundImage: `url(${r.sheet.src})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${r.sheet.frames * 100}% 100%`,
                    backgroundPosition: '0 0',
                    imageRendering: r.sheet.anchor ? 'auto' : 'pixelated',
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
