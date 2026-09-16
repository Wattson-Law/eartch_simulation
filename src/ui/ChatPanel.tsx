import { useEffect, useRef, useState, type FormEvent } from 'react';
import { WELCOME_MESSAGE, RANGER_NAME, RANGER_SHORT } from '../nlp';

export interface ChatMessage {
  id: number;
  role: 'user' | 'admin';
  text: string;
}

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

const SCENARIO_CHIPS = [
  { label: '暴风雪提前', text: '暴风雪提前', tone: 'winter' as const },
  { label: '雷击野火', text: '雷击野火', tone: 'fire' as const },
  { label: '游客投喂冲突', text: '游客投喂冲突', tone: 'tourist' as const },
];

const QUICK_CHIPS = ['增加十只狼', '下雨', '现在谁最多'];

export function ChatPanel({ messages, onSend, disabled }: Props) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t || disabled) return;
    onSend(t);
    setInput('');
  };

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <div className="chat-avatar" title={RANGER_NAME}>
          🧭
        </div>
        <div>
          <div className="chat-title">{RANGER_NAME}</div>
          <div className="chat-sub">{RANGER_SHORT}电台 · 野外简报 · 不伪造数值</div>
        </div>
      </header>
      <div className="chat-messages" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-${m.role}`}>
            {m.text.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="对巡护员说：暴风雪提前、增加十只狼…"
          disabled={disabled}
          aria-label="指令输入"
        />
        <button type="submit" disabled={disabled || !input.trim()}>
          发送
        </button>
      </form>
      <div className="scenario-chips">
        <div className="scenario-label">情景注入</div>
        <div className="scenario-row">
          {SCENARIO_CHIPS.map((s) => (
            <button
              key={s.label}
              type="button"
              className={`scenario-chip scenario-chip--${s.tone}`}
              onClick={() => onSend(s.text)}
              disabled={disabled}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chat-suggestions">
        {QUICK_CHIPS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => onSend(s)} disabled={disabled}>
            {s}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function initialChatMessages(): ChatMessage[] {
  return [{ id: 1, role: 'admin', text: WELCOME_MESSAGE }];
}
