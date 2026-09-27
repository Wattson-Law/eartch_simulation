import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from './sim/state';
import { tick } from './sim/tick';
import { applyCommand } from './sim/commands';
import type { CampaignDecision, EcosystemState } from './sim/types';
import { GlobeCanvas } from './ui/GlobeCanvas';
import { EcoView } from './ui/EcoView';
import { Disclaimer } from './ui/Disclaimer';
import { AssetGallery } from './ui/AssetGallery';
import { GlobeToEcoTransition, type GlobeToEcoPhase } from './ui/GlobeToEcoTransition';
import './App.css';

type View = 'globe' | 'eco' | 'assets';

function initialView(): View {
  if (typeof window !== 'undefined') {
    const requested = new URLSearchParams(window.location.search).get('view');
    if (requested === 'assets' || requested === 'eco') return requested;
  }
  return 'globe';
}

export default function App() {
  const [state, setState] = useState<EcosystemState>(() => createInitialState());
  const [view, setView] = useState<View>(() => initialView());
  const [transitionPhase, setTransitionPhase] = useState<GlobeToEcoPhase>('idle');
  const stateRef = useRef(state);
  const viewRef = useRef(view);
  const transitionRef = useRef<GlobeToEcoPhase>('idle');
  const transitionTimersRef = useRef<number[]>([]);

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
      // The globe is an entry scene, and a background tab is not an active
      // field observation. Keep the deterministic ecosystem clock scoped to a
      // visible Yellowstone session so waiting at the landing screen or
      // switching tabs cannot silently drain the populations.
      if (document.hidden || viewRef.current !== 'eco') return;
      setState((prev) => {
        if (prev.paused) return prev;
        return tick(prev);
      });
    }, 1800);
    return () => window.clearInterval(id);
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

  const handleCampaignDecision = useCallback((decision: CampaignDecision) => {
    const result = applyCommand(stateRef.current, { type: 'campaign_decision', decision });
    setState(result.state);
  }, []);

  const togglePause = useCallback(() => {
    const command = stateRef.current.paused ? { type: 'resume' as const } : { type: 'pause' as const };
    setState(applyCommand(stateRef.current, command).state);
  }, []);

  const restartCampaign = useCallback(() => {
    const fresh = createInitialState();
    setState(fresh);
    viewRef.current = 'eco';
    transitionRef.current = 'idle';
    setTransitionPhase('idle');
    setView('eco');
  }, []);

  const returnToGlobe = useCallback(() => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    transitionRef.current = 'idle';
    setTransitionPhase('idle');
    viewRef.current = 'globe';
    setView('globe');
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">🌍</span>
          <div>
            <h1>我做了一个存活在电脑里的地球</h1>
            <p className="tagline">三分钟黄石生态叙事展品</p>
          </div>
        </div>
        <Disclaimer compact />
      </header>

      <main className="app-main app-main--exhibit">
        <section className="stage">
          {view === 'globe' ? (
            <GlobeCanvas onEnterYellowstone={beginEcoTransition} />
          ) : view === 'assets' ? (
            <AssetGallery onBack={() => setView('eco')} />
          ) : (
            <EcoView
              state={state}
              onBack={returnToGlobe}
              onTogglePause={togglePause}
              onCampaignDecision={handleCampaignDecision}
              onRestartCampaign={restartCampaign}
              entryTransition={transitionPhase === 'arrival'}
            />
          )}
          <GlobeToEcoTransition phase={transitionPhase} />
        </section>
      </main>

      <footer className="app-footer">
        <Disclaimer />
        <span className="footer-note">画面只跟随三位代表个体 · 数值由确定性模拟器推进</span>
      </footer>
    </div>
  );
}
