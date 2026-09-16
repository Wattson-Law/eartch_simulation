import { useEffect, useState, type CSSProperties } from 'react';
import { ANIMAL_SHEETS } from '../assetsPaths';

interface Props {
  active: boolean;
  preyLabel: string;
  onDone: () => void;
}

/** CSS 狼捕兔动画 stub（CC0 精灵） */
export function PredationAnimation({ active, preyLabel, onDone }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    setShow(true);
    const t = window.setTimeout(() => {
      setShow(false);
      onDone();
    }, 1600);
    return () => window.clearTimeout(t);
  }, [active, onDone]);

  if (!show) return null;

  const isElk = preyLabel === 'elk' || preyLabel === 'deer';
  const wolfMeta = ANIMAL_SHEETS.wolfRun;
  const preyMeta = isElk ? ANIMAL_SHEETS.deerRun : ANIMAL_SHEETS.rabbitHop;

  const wolfStyle: CSSProperties = {
    width: wolfMeta.frameW * 1.6,
    height: wolfMeta.frameH * 1.6,
    backgroundImage: `url(${wolfMeta.src})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${wolfMeta.frames * 100}% 100%`,
    backgroundPosition: '0% 0%',
    imageRendering: 'pixelated',
  };

  const preyStyle: CSSProperties = {
    width: preyMeta.frameW * (isElk ? 1.2 : 1.5),
    height: preyMeta.frameH * (isElk ? 1.2 : 1.5),
    backgroundImage: `url(${preyMeta.src})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${preyMeta.frames * 100}% 100%`,
    backgroundPosition: '0% 0%',
    imageRendering: 'pixelated',
  };

  return (
    <div className="predation-overlay" aria-live="polite">
      <div className="predation-stage">
        <span className="predation-wolf predation-sprite" style={wolfStyle} role="img" aria-label="狼" />
        <span className="predation-prey predation-sprite" style={preyStyle} role="img" aria-label="猎物" />
        <p className="predation-caption">捕食发生！</p>
      </div>
    </div>
  );
}
