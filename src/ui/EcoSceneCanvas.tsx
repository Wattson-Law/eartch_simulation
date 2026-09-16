import { useEffect, useRef } from 'react';
import type { EcosystemState } from '../sim/types';
import {
  ANIMAL_SHEETS,
  drawSheetFrame,
  loadImage,
  loadPlantImages,
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
/** Visual caps — density maps from grass/shrubs counts only (no sim change). */
const PLANT_CAP = { trees: 10, shrubs: 14, grass: 20 } as const;

function seeded(i: number, salt: number) {
  const t = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  drawH: number,
  flipX = false,
) {
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const dw = drawH * aspect;
  const dh = drawH;
  ctx.save();
  if (flipX) {
    ctx.translate(x + dw / 2, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  } else {
    ctx.drawImage(img, x - dw / 2, y - dh, dw, dh);
  }
  ctx.restore();
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
    const plants = {
      grass: [] as HTMLImageElement[],
      shrubs: [] as HTMLImageElement[],
      trees: [] as HTMLImageElement[],
    };

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
      try {
        const loaded = await loadPlantImages();
        plants.grass = loaded.grass;
        plants.shrubs = loaded.shrubs;
        plants.trees = loaded.trees;
      } catch {
        /* keep blob fallback */
      }
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

    /** Map biomass → sprite counts. Fire temporarily thins foliage for feedback. */
    const plantCounts = (s: EcosystemState) => {
      // shrubs 0–5000 → trees up to 10; grass mix adds a little canopy richness
      let treeN = Math.min(
        PLANT_CAP.trees,
        Math.max(0, Math.ceil(s.shrubs / 450) + Math.ceil(s.grass / 4000)),
      );
      // shrubs 0–5000 → mid bushes up to 14
      let shrubN = Math.min(PLANT_CAP.shrubs, Math.max(0, Math.ceil(s.shrubs / 360)));
      // grass 0–10000 → ground cover up to 20 (denser carpet when high)
      let grassN = Math.min(PLANT_CAP.grass, Math.max(0, Math.ceil(s.grass / 500)));
      if (s.fire) {
        treeN = Math.max(0, Math.floor(treeN * 0.55));
        shrubN = Math.max(0, Math.floor(shrubN * 0.5));
        grassN = Math.max(0, Math.floor(grassN * 0.45));
      }
      return { treeN, shrubN, grassN };
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

      // Soft grass carpet tint when biomass is high (visual only)
      if (!s.fire && s.grass > 2500) {
        const carpet = Math.min(0.28, (s.grass - 2500) / 10000);
        ctx.fillStyle = `rgba(102, 187, 106, ${carpet})`;
        ctx.fillRect(0, h * 0.58, w, h * 0.42);
      }

      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.moveTo(w * 0.55, h * 0.55);
      ctx.quadraticCurveTo(w * 0.5, h * 0.7, w * 0.62, h);
      ctx.lineTo(w * 0.72, h);
      ctx.quadraticCurveTo(w * 0.58, h * 0.7, w * 0.65, h * 0.55);
      ctx.fill();

      const { treeN, shrubN, grassN } = plantCounts(s);
      const hasTrees = plants.trees.length > 0;
      const hasShrubs = plants.shrubs.length > 0;
      const hasGrass = plants.grass.length > 0;

      ctx.save();
      if (s.fire) {
        ctx.filter = 'brightness(0.55) sepia(0.55) saturate(1.2)';
      } else if (s.season === 'winter') {
        ctx.filter = 'brightness(1.05) saturate(0.55)';
      } else if (s.season === 'autumn') {
        ctx.filter = 'sepia(0.25) hue-rotate(-15deg) saturate(1.1)';
      }

      // Background: trees / tall plants (shrubs-driven)
      for (let i = 0; i < treeN; i++) {
        const tx = 24 + seeded(i, 41) * (w - 48);
        const ty = h * 0.52 + seeded(i, 42) * h * 0.08;
        const size = 48 + seeded(i, 43) * 36;
        if (hasTrees) {
          const img = plants.trees[i % plants.trees.length]!;
          drawSprite(ctx, img, tx, ty, size, seeded(i, 44) > 0.5);
        } else {
          drawPlantBlob(tx, ty - size * 0.3, size * 0.35, s.fire ? '#a1887f' : '#43a047');
        }
      }

      // Mid: shrubs
      for (let i = 0; i < shrubN; i++) {
        const sx = 20 + seeded(i, 51) * (w - 40);
        const sy = h * 0.58 + seeded(i, 52) * h * 0.12;
        const size = 28 + seeded(i, 53) * 22;
        if (hasShrubs) {
          const img = plants.shrubs[i % plants.shrubs.length]!;
          drawSprite(ctx, img, sx, sy, size, seeded(i, 54) > 0.5);
        } else {
          drawPlantBlob(sx, sy - 8, 14 + (i % 3) * 3, s.fire ? '#a1887f' : '#66bb6a');
        }
      }

      // Foreground: grass / leaf tufts
      for (let i = 0; i < grassN; i++) {
        const gx = 12 + seeded(i, 61) * (w - 24);
        const gy = h * 0.7 + seeded(i, 62) * h * 0.22;
        const size = 16 + seeded(i, 63) * 18;
        if (hasGrass) {
          const img = plants.grass[i % plants.grass.length]!;
          drawSprite(ctx, img, gx, gy, size, seeded(i, 64) > 0.5);
        } else {
          ctx.fillStyle = s.season === 'winter' ? '#b0bec5' : '#7cb342';
          ctx.fillRect(gx, gy - 10, 2, 8 + seeded(i, 33) * 6);
        }
      }

      ctx.restore();

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

      // Animals drawn last so they stay in front of plants
      for (const c of crittersRef.list) {
        const bob = Math.sin(elapsed * c.speed * 4 + c.phase) * 1.5;
        const wander = Math.sin(elapsed * c.speed + c.phase) * 12;
        const x = c.x + wander;
        const y = c.y + bob;
        const frameT = elapsed * (c.kind === 'rabbit' ? 8 : 6) + c.phase;

        if (c.kind === 'rabbit') {
          const key = sheets.rabbitHop
            ? 'rabbitHop'
            : sheets.rabbitIdle
              ? 'rabbitIdle'
              : sheets.rabbitRun
                ? 'rabbitRun'
                : null;
          if (key) {
            drawSheetFrame(ctx, sheets[key]!, ANIMAL_SHEETS[key], Math.floor(frameT), x, y, 1.35, c.flip);
          } else {
            ctx.font = '16px serif';
            ctx.fillText('🐇', x, y + 16);
          }
        } else if (c.kind === 'deer') {
          const key = sheets.deerWalk
            ? 'deerWalk'
            : sheets.deerIdle
              ? 'deerIdle'
              : sheets.deerRun
                ? 'deerRun'
                : null;
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
