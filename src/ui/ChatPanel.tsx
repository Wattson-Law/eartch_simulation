import { useEffect, useRef, useState, type FormEvent } from 'react';
import { WELCOME_MESSAGE } from '../nlp';

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
        <div className="chat-avatar">🌱</div>
        <div>
          <div className="chat-title">生态系统管理员</div>
          <div className="chat-sub">规则解析 · 解释模拟结果 · 不伪造数值</div>
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
          placeholder="例如：下雨、增加十只狼、快进到冬天…"
          disabled={disabled}
          aria-label="指令输入"
        />
        <button type="submit" disabled={disabled || !input.trim()}>
          发送
        </button>
      </form>
      <div className="chat-suggestions">
        {['下雨', '发生火灾', '增加十只狼', '快进到冬天', '暂停', '现在谁最多'].map((s) => (
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
