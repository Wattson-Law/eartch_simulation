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
import { Disclaimer } from './ui/Disclaimer';
import { CausalCascadePanel } from './ui/CausalCascadePanel';
import { AssetGallery } from './ui/AssetGallery';
import { GlobeToEcoTransition, type GlobeToEcoPhase } from './ui/GlobeToEcoTransition';
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
  const [transitionPhase, setTransitionPhase] = useState<GlobeToEcoPhase>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialChatMessages());
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const stateRef = useRef(state);
  const viewRef = useRef(view);
  const transitionRef = useRef<GlobeToEcoPhase>('idle');
  const transitionTimersRef = useRef<number[]>([]);
  const msgIdRef = useRef(2);

  useEffect(() => {
    stateRef.current = state;
    viewRef.current = view;
    transitionRef.current = transitionPhase;
  }, [state, transitionPhase, view]);

  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((prev) => {
        if (prev.paused) return prev;
        return tick(prev);
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

  const beginEcoTransition = useCallback(() => {
    if (viewRef.current !== 'globe' || transitionRef.current !== 'idle') return;
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    transitionRef.current = 'orbit';
    setTransitionPhase('orbit');
    const arrival = window.setTimeout(() => {
      viewRef.current = 'eco';
      transitionRef.current = 'arrival';
      setView('eco');
      setTransitionPhase('arrival');
    }, 380);
    const finish = window.setTimeout(() => {
      transitionRef.current = 'idle';
      setTransitionPhase('idle');
      transitionTimersRef.current = [];
    }, 1180);
    transitionTimersRef.current.push(arrival, finish);
  }, []);

  const handleSend = useCallback((text: string) => {
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      pushMessages(text, parsed.reason);
      return;
    }

    const result = applyCommand(stateRef.current, parsed.command);
    setState(result.state);
    let reply = result.reply;
    if (parsed.matched === '触发捕食观察') {
      reply =
        '我先把观察窗口往前拨两步，看看猎场上自然发生的捕食——我不会直接改数量。\n' + reply;
    }
    pushMessages(text, reply);

    if (result.openCascade) {
      setCascadeOpen(true);
      viewRef.current = 'eco';
      transitionRef.current = 'idle';
      setTransitionPhase('idle');
      setView('eco');
    } else if (viewRef.current === 'globe') {
      beginEcoTransition();
    }
  }, [beginEcoTransition, pushMessages]);

  const returnToGlobe = useCallback(() => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    transitionRef.current = 'idle';
    setTransitionPhase('idle');
    viewRef.current = 'globe';
    setView('globe');
  }, []);
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
            <GlobeCanvas onEnterYellowstone={beginEcoTransition} />
          ) : view === 'assets' ? (
            <AssetGallery onBack={() => setView('eco')} />
          ) : (
            <EcoView
              state={state}
              onBack={returnToGlobe}
              onOpenCascade={() => setCascadeOpen(true)}
              hasCascade={cascade != null}
              onTogglePause={() => handleSend(state.paused ? '继续' : '暂停')}
              entryTransition={transitionPhase === 'arrival'}
            />
          )}
          <GlobeToEcoTransition phase={transitionPhase} />
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
