import { useEffect, useState, type CSSProperties } from 'react';
import { ANIMAL_SHEETS, loadEcosystemManifest, loadImage, type SheetMeta } from '../assetsPaths';
import type { EcosystemState } from '../sim/types';

interface Props {
  event: EcosystemState['lastPredation'];
  paused: boolean;
}

function spriteStyle(meta: SheetMeta, height: number): CSSProperties {
  const width = height * meta.frameW / meta.frameH;
  return {
    width,
    height,
    backgroundImage: `url(${meta.src})`,
    backgroundSize: `${width * meta.frames}px ${height}px`,
    animationDuration: `${meta.frames / (meta.fps ?? 8)}s`,
    animationTimingFunction: `steps(${meta.frames}, end)`,
    '--sheet-end': `${-width * meta.frames}px`,
  } as CSSProperties;
}

/** A compact observation strip that never covers the landscape or readings. */
export function PredationAnimation({ event, paused }: Props) {
  const [sheets, setSheets] = useState<Partial<Record<'wolf' | 'elk' | 'rabbit', SheetMeta>>>({});

  useEffect(() => {
    let cancelled = false;
    void loadEcosystemManifest().then(async (manifest) => {
      if (!manifest) return;
      const entries = await Promise.all((['wolf', 'elk', 'rabbit'] as const).map(async (animal) => {
        const meta = manifest.animals[animal]?.run;
        if (!meta) return null;
        try {
          await loadImage(meta.src);
          return [animal, meta] as const;
        } catch {
          return null;
        }
      }));
      if (!cancelled) setSheets(Object.fromEntries(entries.filter((entry) => entry !== null)));
    });
    return () => { cancelled = true; };
  }, []);

  const isElk = event?.prey === 'elk';
  const wolf = sheets.wolf ?? ANIMAL_SHEETS.wolfRun;
  const prey = isElk ? sheets.elk ?? ANIMAL_SHEETS.elkRun : sheets.rabbit ?? ANIMAL_SHEETS.rabbitRun;

  return (
    <div className={`field-observation${paused ? ' is-paused' : ''}`}>
      <div className="observation-copy">
        <span className="observation-label"><span className="observation-dot" />野外观察</span>
        <span className="observation-text" role="status">
          {event ? `捕食记录 · ${isElk ? '美洲赤鹿' : '野兔'} × ${event.amount}` : '等待新的野外记录'}
        </span>
      </div>
      {event && (
        <div className="observation-animals" aria-hidden="true">
          <span className="observation-sprite" style={spriteStyle(wolf, 32)} />
          <span className="observation-sprite" style={spriteStyle(prey, isElk ? 32 : 23)} />
        </div>
      )}
    </div>
  );
}
