import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from './sim/state';
import { tick } from './sim/tick';
import { applyCommand } from './sim/commands';
import { latestCascade } from './sim/cascade';
import type { EcosystemState } from './sim/types';
import { parseCommand } from './nlp/parse';
import { GlobeCanvas } from './ui/GlobeCanvas';
import { EcoView } from './ui/EcoView';
import { ChatPanel, initialChatMessages, type ChatMessage } from './ui/ChatPanel';
import { PredationAnimation } from './ui/PredationAnimation';
import { Disclaimer } from './ui/Disclaimer';
import { CausalCascadePanel } from './ui/CausalCascadePanel';
import { AssetGallery } from './ui/AssetGallery';
import './App.css';

type View = 'globe' | 'eco' | 'assets';

function initialView(): View {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'assets') {
    return 'assets';
  }
  return 'globe';
}

export default function App() {
  const [state, setState] = useState<EcosystemState>(() => createInitialState());
  const [view, setView] = useState<View>(() => initialView());
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialChatMessages());
  const [predationAnim, setPredationAnim] = useState(false);
  const [preyKind, setPreyKind] = useState<'rabbits' | 'elk'>('rabbits');
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const stateRef = useRef(state);
  const msgIdRef = useRef(2);
  stateRef.current = state;

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((prev) => {
        if (prev.paused) return prev;
        const next = tick(prev);
        if (next.lastPredation) {
          setPreyKind(next.lastPredation.prey);
          setPredationAnim(true);
        }
        return next;
      });
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  const pushMessages = useCallback((userText: string, adminText: string) => {
    setMessages((prev) => {
      const uid = msgIdRef.current++;
      const aid = msgIdRef.current++;
      return [
        ...prev,
        { id: uid, role: 'user', text: userText },
        { id: aid, role: 'admin', text: adminText },
      ];
    });
  }, []);

  const handleSend = useCallback((text: string) => {
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      pushMessages(text, parsed.reason);
      return;
    }

    const result = applyCommand(stateRef.current, parsed.command);
    setState(result.state);
    if (result.triggerPredationAnim && result.state.lastPredation) {
      setPreyKind(result.state.lastPredation.prey);
      setPredationAnim(true);
    }
    let reply = result.reply;
    if (parsed.matched === '触发捕食观察') {
      reply =
        '我先把观察窗口往前拨两步，看看猎场上自然发生的捕食——我不会直接改数量。\n' + reply;
    }
    pushMessages(text, reply);

    if (result.openCascade) {
      setCascadeOpen(true);
      setView('eco');
    } else if (view === 'globe') {
      setView('eco');
    }
  }, [pushMessages, view]);

  const enterYellowstone = useCallback(() => setView('eco'), []);
  const cascade = latestCascade(state);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">🌍</span>
          <div>
            <h1>我做了一个存活在电脑里的地球</h1>
            <p className="tagline">黄石宏观生态 · 科学玩具 MVP</p>
          </div>
        </div>
        <Disclaimer compact />
      </header>

      <main className="app-main">
        <section className="stage">
          {view === 'globe' ? (
            <GlobeCanvas onEnterYellowstone={enterYellowstone} />
          ) : view === 'assets' ? (
            <AssetGallery onBack={() => setView('eco')} />
          ) : (
            <EcoView
              state={state}
              onBack={() => setView('globe')}
              onOpenCascade={() => setCascadeOpen(true)}
              hasCascade={cascade != null}
            />
          )}
          {view !== 'assets' && (
            <PredationAnimation
              active={predationAnim}
              preyLabel={preyKind}
              onDone={() => setPredationAnim(false)}
            />
          )}
          <CausalCascadePanel
            cascade={cascade}
            open={cascadeOpen}
            onClose={() => setCascadeOpen(false)}
          />
        </section>
        <ChatPanel messages={messages} onSend={handleSend} />
      </main>

      <footer className="app-footer">
        <Disclaimer />
        <span className="footer-note">巡护员只叙述；数值仅由确定性模拟器变更 · 沉浸 MVP</span>
      </footer>
    </div>
  );
}
