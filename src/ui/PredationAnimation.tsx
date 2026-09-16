import { useEffect, useState } from 'react';

interface Props {
  active: boolean;
  preyLabel: string;
  onDone: () => void;
}

/** CSS 狼捕兔动画 stub */
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

  return (
    <div className="predation-overlay" aria-live="polite">
      <div className="predation-stage">
        <span className="predation-wolf">🐺</span>
        <span className="predation-prey">{preyLabel === 'elk' ? '🦌' : '🐇'}</span>
        <p className="predation-caption">捕食发生！</p>
      </div>
    </div>
  );
}
