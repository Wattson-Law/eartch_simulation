import type { LogEntry } from '../sim/types';

interface Props {
  log: LogEntry[];
}

export function EventLog({ log }: Props) {
  const reversed = [...log].reverse();
  const seenPredation = new Set<string>();
  const items = reversed
    .filter((entry) => {
      // The simulator may record the same sampled food-chain consequence many
      // times. Keep the latest example of each kind in the visitor-facing
      // journal so the log reads as a sequence of turns instead of a ticker.
      if (entry.source !== 'predation') return true;
      const key = entry.message.replace(/约 \d+ 只/, '约 # 只');
      if (seenPredation.has(key)) return false;
      seenPredation.add(key);
      return true;
    })
    .slice(0, 14);
  return (
    <div className="event-log">
      <div className="panel-title">自然野外考察简报 <span className="panel-title-note">最近的转折</span></div>
      <ul className="event-log-list">
        {items.length === 0 && <li className="muted">暂无简报</li>}
        {items.map((e) => (
          <li key={e.id} className={`log-item log-${e.source}`}>
            <span className="log-meta">T{e.tick}</span>
            <span className="log-msg">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
