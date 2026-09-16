import type { LogEntry } from '../sim/types';

interface Props {
  log: LogEntry[];
}

export function EventLog({ log }: Props) {
  const items = [...log].reverse().slice(0, 40);
  return (
    <div className="event-log">
      <div className="panel-title">自然野外考察简报</div>
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
