import { useEffect, useRef } from 'react';
import type { EcosystemState } from '../sim/types';
import {
  ANIMAL_SHEETS,
  drawSheetFrame,
  loadImage,
  type SheetMeta,
} from '../assetsPaths';

interface Props {
  state: EcosystemState;
}

type CritterKind = 'rabbit' | 'deer' | 'wolf';

interface Critter {
  kind: CritterKind;
  x: number;
  y: number;
  flip: boolean;
  phase: number;
  speed: number;
}

const MAX = { rabbit: 12, deer: 8, wolf: 6 } as const;

function seeded(i: number, salt: number) {
  const t = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

/** 扁平插画风黄石场景（Canvas 2D + CC0 精灵） */
export function EcoSceneCanvas({ state }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let cancelled = false;
    const t0 = performance.now();

    const sheets: Partial<Record<keyof typeof ANIMAL_SHEETS, HTMLImageElement>> = {};
    void (async () => {
      const entries = Object.entries(ANIMAL_SHEETS) as [
        keyof typeof ANIMAL_SHEETS,
        SheetMeta,
      ][];
      await Promise.all(
        entries.map(async ([key, meta]) => {
          try {
            sheets[key] = await loadImage(meta.src);
          } catch {
            /* keep emoji fallback */
          }
        }),
      );
    })();

    const crittersRef = { list: [] as Critter[] };

    const rebuildCritters = (w: number, h: number, s: EcosystemState) => {
      const rabbitN = Math.min(MAX.rabbit, Math.max(0, Math.ceil(s.rabbits / 50)));
      const deerN = Math.min(MAX.deer, Math.max(0, Math.ceil(s.elk / 40)));
      const wolfN = Math.min(MAX.wolf, Math.max(0, Math.ceil(s.wolves / 8)));
      const next: Critter[] = [];
      for (let i = 0; i < rabbitN; i++) {
        next.push({
          kind: 'rabbit',
          x: 40 + seeded(i, 1) * (w * 0.45),
          y: h * 0.72 + seeded(i, 2) * h * 0.18,
          flip: seeded(i, 3) > 0.5,
          phase: seeded(i, 4) * 10,
          speed: 0.35 + seeded(i, 5) * 0.4,
        });
      }
      for (let i = 0; i < deerN; i++) {
        next.push({
          kind: 'deer',
          x: w * 0.12 + seeded(i, 11) * (w * 0.5),
          y: h * 0.62 + seeded(i, 12) * h * 0.16,
          flip: seeded(i, 13) > 0.45,
          phase: seeded(i, 14) * 10,
          speed: 0.25 + seeded(i, 15) * 0.3,
        });
      }
      for (let i = 0; i < wolfN; i++) {
        next.push({
          kind: 'wolf',
          x: w * 0.55 + seeded(i, 21) * (w * 0.38),
          y: h * 0.66 + seeded(i, 22) * h * 0.18,
          flip: seeded(i, 23) > 0.4,
          phase: seeded(i, 24) * 10,
          speed: 0.4 + seeded(i, 25) * 0.45,
        });
      }
      crittersRef.list = next;
    };

    const drawPlantBlob = (x: number, y: number, size: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.7, size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - size * 0.35, y + size * 0.1, size * 0.4, size * 0.35, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + size * 0.3, y + size * 0.05, size * 0.38, size * 0.32, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(x - 1.5, y + size * 0.2, 3, size * 0.45);
    };

    const paint = (now: number) => {
      if (cancelled) return;
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rebuildCritters(w, h, s);
      }

      const skies: Record<string, [string, string]> = {
        spring: ['#b3e5fc', '#e8f5e9'],
        summer: ['#81d4fa', '#fff9c4'],
        autumn: ['#ffe0b2', '#ffccbc'],
        winter: ['#e3f2fd', '#eceff1'],
      };
      const [c1, c2] = skies[s.season];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = s.season === 'winter' ? '#90a4ae' : '#81c784';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.45);
      ctx.lineTo(w * 0.2, h * 0.28);
      ctx.lineTo(w * 0.4, h * 0.42);
      ctx.lineTo(w * 0.55, h * 0.25);
      ctx.lineTo(w * 0.75, h * 0.4);
      ctx.lineTo(w, h * 0.3);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      ctx.fillStyle = s.fire ? '#8d6e63' : s.season === 'winter' ? '#cfd8dc' : '#aed581';
      ctx.fillRect(0, h * 0.55, w, h * 0.45);

      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.moveTo(w * 0.55, h * 0.55);
      ctx.quadraticCurveTo(w * 0.5, h * 0.7, w * 0.62, h);
      ctx.lineTo(w * 0.72, h);
      ctx.quadraticCurveTo(w * 0.58, h * 0.7, w * 0.65, h * 0.55);
      ctx.fill();

      const shrubN = Math.min(10, Math.ceil(s.shrubs / 400));
      const grassN = Math.min(14, Math.ceil(s.grass / 500));
      for (let i = 0; i < grassN; i++) {
        const gx = 16 + seeded(i, 31) * (w - 32);
        const gy = h * 0.58 + seeded(i, 32) * h * 0.08;
        ctx.fillStyle = s.season === 'winter' ? '#b0bec5' : '#7cb342';
        ctx.fillRect(gx, gy, 2, 8 + seeded(i, 33) * 6);
      }
      for (let i = 0; i < shrubN; i++) {
        const sx = 30 + i * ((w - 60) / Math.max(shrubN, 1));
        const sy = h * 0.58 + (i % 3) * 10;
        drawPlantBlob(sx, sy, 14 + (i % 3) * 3, s.fire ? '#a1887f' : '#66bb6a');
      }

      // 同步数量（tick 变化时重建位置）
      const wantR = Math.min(MAX.rabbit, Math.max(0, Math.ceil(s.rabbits / 50)));
      const wantD = Math.min(MAX.deer, Math.max(0, Math.ceil(s.elk / 40)));
      const wantW = Math.min(MAX.wolf, Math.max(0, Math.ceil(s.wolves / 8)));
      const curR = crittersRef.list.filter((c) => c.kind === 'rabbit').length;
      const curD = crittersRef.list.filter((c) => c.kind === 'deer').length;
      const curWw = crittersRef.list.filter((c) => c.kind === 'wolf').length;
      if (curR !== wantR || curD !== wantD || curWw !== wantW || crittersRef.list.length === 0) {
        rebuildCritters(w, h, s);
      }

      const elapsed = (now - t0) / 1000;

      for (const c of crittersRef.list) {
        const bob = Math.sin(elapsed * c.speed * 4 + c.phase) * 1.5;
        const wander = Math.sin(elapsed * c.speed + c.phase) * 12;
        const x = c.x + wander;
        const y = c.y + bob;
        const frameT = elapsed * (c.kind === 'rabbit' ? 8 : 6) + c.phase;

        if (c.kind === 'rabbit') {
          const key = sheets.rabbitHop ? 'rabbitHop' : sheets.rabbitIdle ? 'rabbitIdle' : sheets.rabbitRun ? 'rabbitRun' : null;
          if (key) {
            drawSheetFrame(ctx, sheets[key]!, ANIMAL_SHEETS[key], Math.floor(frameT), x, y, 1.35, c.flip);
          } else {
            ctx.font = '16px serif';
            ctx.fillText('🐇', x, y + 16);
          }
        } else if (c.kind === 'deer') {
          const key = sheets.deerWalk ? 'deerWalk' : sheets.deerIdle ? 'deerIdle' : sheets.deerRun ? 'deerRun' : null;
          if (key) {
            drawSheetFrame(ctx, sheets[key]!, ANIMAL_SHEETS[key], Math.floor(frameT), x, y, 0.95, c.flip);
          } else {
            ctx.font = '20px serif';
            ctx.fillText('🦌', x, y + 20);
          }
        } else {
          const key = sheets.wolfWalk ? 'wolfWalk' : sheets.wolfRun ? 'wolfRun' : null;
          if (key) {
            drawSheetFrame(ctx, sheets[key]!, ANIMAL_SHEETS[key], Math.floor(frameT), x, y, 1.15, c.flip);
          } else {
            ctx.font = '18px serif';
            ctx.fillText('🐺', x, y + 18);
          }
        }
      }

      if (s.fire) {
        ctx.fillStyle = 'rgba(255,87,34,0.35)';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '28px serif';
        for (let i = 0; i < 5; i++) {
          ctx.fillText('🔥', 60 + i * 70, h * 0.5 + (i % 2) * 20);
        }
      }

      if (s.rainfall > 0.55) {
        ctx.strokeStyle = 'rgba(100,180,255,0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
          const rx = (i * 37 + s.tick * 3) % w;
          const ry = (i * 53 + s.tick * 5) % (h * 0.55);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + 2, ry + 8);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    const onResize = () => {
      const rect = canvas.getBoundingClientRect();
      rebuildCritters(rect.width, rect.height, stateRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} className="eco-scene-canvas" />;
}
