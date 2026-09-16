import type { LogEntry } from '../sim/types';

interface Props {
  log: LogEntry[];
}

const SOURCE_LABEL: Record<LogEntry['source'], string> = {
  system: '系统',
  'user-command': '指令',
  predation: '捕食',
};

export function EventLog({ log }: Props) {
  const items = [...log].reverse().slice(0, 40);
  return (
    <div className="event-log">
      <div className="panel-title">事件日志</div>
      <ul className="event-log-list">
        {items.length === 0 && <li className="muted">暂无事件</li>}
        {items.map((e) => (
          <li key={e.id} className={`log-item log-${e.source}`}>
            <span className="log-meta">
              T{e.tick} · {SOURCE_LABEL[e.source]}
            </span>
            <span className="log-msg">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
