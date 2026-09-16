import { useEffect, useRef, useState, type MouseEvent } from 'react';
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
type Activity = 'idle' | 'eating' | 'alert' | 'fleeing';

interface Critter {
  kind: CritterKind;
  id: string;
  displayName: string;
  role: string;
  mood: string;
  activity: Activity;
  x: number;
  y: number;
  flip: boolean;
  phase: number;
  speed: number;
  /** last drawn hit box (CSS px) */
  hitX: number;
  hitY: number;
  hitR: number;
}

interface PlantTip {
  id: string;
  displayName: string;
  detail: string;
  x: number;
  y: number;
  hitR: number;
}

interface TooltipInfo {
  title: string;
  lines: string[];
  x: number;
  y: number;
}

const MAX = { rabbit: 12, deer: 8, wolf: 6 } as const;
const PLANT_CAP = { trees: 10, shrubs: 14, grass: 20 } as const;

const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: '闲逛',
  eating: '觅食中',
  alert: '警觉',
  fleeing: '退避',
};

function seeded(i: number, salt: number) {
  const t = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

function pickActivity(kind: CritterKind, i: number, state: EcosystemState): Activity {
  const r = seeded(i, 90 + (kind === 'wolf' ? 1 : kind === 'deer' ? 2 : 3));
  if (state.fire) return r > 0.35 ? 'fleeing' : 'alert';
  if (state.lastPredation && kind !== 'wolf') return r > 0.4 ? 'alert' : 'fleeing';
  if (kind === 'wolf') {
    if (r > 0.7) return 'alert';
    if (r > 0.35) return 'idle';
    return 'eating';
  }
  if (r > 0.65) return 'eating';
  if (r > 0.35) return 'idle';
  return 'alert';
}

function identityFor(kind: CritterKind, i: number): Pick<Critter, 'id' | 'displayName' | 'role' | 'mood'> {
  const num = Math.floor(seeded(i, 100 + kind.length) * 90) + 8;
  if (kind === 'wolf') {
    return {
      id: `wolf-${num}`,
      displayName: `黄石 ${num} 号狼`,
      role: i === 0 ? '领头狼' : '狼群成员',
      mood: seeded(i, 7) > 0.5 ? '沉稳' : '专注',
    };
  }
  if (kind === 'deer') {
    return {
      id: `elk-${num}`,
      displayName: `拉马谷 ${num} 号麋鹿`,
      role: '草食巡游者',
      mood: seeded(i, 8) > 0.5 ? '警觉' : '安静',
    };
  }
  return {
    id: `rabbit-${num}`,
    displayName: `河谷 ${num} 号野兔`,
    role: '底层草食',
    mood: seeded(i, 9) > 0.5 ? '机灵' : '贪吃',
  };
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

function animSpeedMul(activity: Activity): number {
  switch (activity) {
    case 'fleeing':
      return 1.55;
    case 'alert':
      return 1.2;
    case 'eating':
      return 0.7;
    default:
      return 1;
  }
}

/** 扁平插画风黄石场景（Canvas 2D + CC0 精灵） */
export function EcoSceneCanvas({ state }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const hitRef = useRef<{ critters: Critter[]; plants: PlantTip[] }>({
    critters: [],
    plants: [],
  });

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
            /* emoji fallback */
          }
        }),
      );
      try {
        const loaded = await loadPlantImages();
        plants.grass = loaded.grass;
        plants.shrubs = loaded.shrubs;
        plants.trees = loaded.trees;
      } catch {
        /* blob fallback */
      }
    })();

    const crittersRef = { list: [] as Critter[] };

    const rebuildCritters = (w: number, h: number, s: EcosystemState) => {
      const rabbitN = Math.min(MAX.rabbit, Math.max(0, Math.ceil(s.rabbits / 50)));
      const deerN = Math.min(MAX.deer, Math.max(0, Math.ceil(s.elk / 40)));
      const wolfN = Math.min(MAX.wolf, Math.max(0, Math.ceil(s.wolves / 8)));
      const next: Critter[] = [];
      for (let i = 0; i < rabbitN; i++) {
        const idn = identityFor('rabbit', i);
        next.push({
          kind: 'rabbit',
          ...idn,
          activity: pickActivity('rabbit', i, s),
          x: 40 + seeded(i, 1) * (w * 0.45),
          y: h * 0.72 + seeded(i, 2) * h * 0.18,
          flip: seeded(i, 3) > 0.5,
          phase: seeded(i, 4) * 10,
          speed: 0.35 + seeded(i, 5) * 0.4,
          hitX: 0,
          hitY: 0,
          hitR: 18,
        });
      }
      for (let i = 0; i < deerN; i++) {
        const idn = identityFor('deer', i);
        next.push({
          kind: 'deer',
          ...idn,
          activity: pickActivity('deer', i, s),
          x: w * 0.12 + seeded(i, 11) * (w * 0.5),
          y: h * 0.62 + seeded(i, 12) * h * 0.16,
          flip: seeded(i, 13) > 0.45,
          phase: seeded(i, 14) * 10,
          speed: 0.25 + seeded(i, 15) * 0.3,
          hitX: 0,
          hitY: 0,
          hitR: 22,
        });
      }
      for (let i = 0; i < wolfN; i++) {
        const idn = identityFor('wolf', i);
        next.push({
          kind: 'wolf',
          ...idn,
          activity: pickActivity('wolf', i, s),
          x: w * 0.55 + seeded(i, 21) * (w * 0.38),
          y: h * 0.66 + seeded(i, 22) * h * 0.18,
          flip: seeded(i, 23) > 0.4,
          phase: seeded(i, 24) * 10,
          speed: 0.4 + seeded(i, 25) * 0.45,
          hitX: 0,
          hitY: 0,
          hitR: 22,
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

    const plantCounts = (s: EcosystemState) => {
      let treeN = Math.min(
        PLANT_CAP.trees,
        Math.max(0, Math.ceil(s.shrubs / 450) + Math.ceil(s.grass / 4000)),
      );
      let shrubN = Math.min(PLANT_CAP.shrubs, Math.max(0, Math.ceil(s.shrubs / 360)));
      let grassN = Math.min(PLANT_CAP.grass, Math.max(0, Math.ceil(s.grass / 500)));
      if (s.fire) {
        treeN = Math.max(0, Math.floor(treeN * 0.55));
        shrubN = Math.max(0, Math.floor(shrubN * 0.5));
        grassN = Math.max(0, Math.floor(grassN * 0.45));
      }
      return { treeN, shrubN, grassN };
    };

    const groundColors = (season: EcosystemState['season'], fire: boolean) => {
      if (fire) return { far: '#8d6e63', near: '#a1887f', carpet: null as string | null };
      switch (season) {
        case 'winter':
          return { far: '#90a4ae', near: '#eceff1', carpet: 'rgba(255,255,255,0.35)' };
        case 'autumn':
          return { far: '#a1887f', near: '#d7ccc8', carpet: 'rgba(255,152,0,0.12)' };
        case 'summer':
          return { far: '#66bb6a', near: '#9ccc65', carpet: 'rgba(129,199,132,0.2)' };
        default:
          return { far: '#81c784', near: '#aed581', carpet: 'rgba(165,214,167,0.18)' };
      }
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
        summer: ['#4fc3f7', '#fff59d'],
        autumn: ['#ffcc80', '#ffe0b2'],
        winter: ['#90caf9', '#eceff1'],
      };
      const [c1, c2] = skies[s.season];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // —— 远山 ——
      const mt = groundColors(s.season, s.fire);
      ctx.fillStyle = s.season === 'winter' ? '#78909c' : '#7e57c2';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.42);
      ctx.lineTo(w * 0.15, h * 0.22);
      ctx.lineTo(w * 0.28, h * 0.38);
      ctx.lineTo(w * 0.45, h * 0.16);
      ctx.lineTo(w * 0.62, h * 0.36);
      ctx.lineTo(w * 0.78, h * 0.18);
      ctx.lineTo(w, h * 0.34);
      ctx.lineTo(w, h * 0.5);
      ctx.lineTo(0, h * 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 雪顶
      if (s.season === 'winter' || s.temperature < 5) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(w * 0.45, h * 0.16);
        ctx.lineTo(w * 0.48, h * 0.22);
        ctx.lineTo(w * 0.42, h * 0.22);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w * 0.78, h * 0.18);
        ctx.lineTo(w * 0.81, h * 0.24);
        ctx.lineTo(w * 0.74, h * 0.24);
        ctx.fill();
      }

      // 中景山丘
      ctx.fillStyle = mt.far;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.48);
      ctx.lineTo(w * 0.2, h * 0.32);
      ctx.lineTo(w * 0.4, h * 0.45);
      ctx.lineTo(w * 0.55, h * 0.3);
      ctx.lineTo(w * 0.75, h * 0.44);
      ctx.lineTo(w, h * 0.34);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      // 近景草地
      ctx.fillStyle = mt.near;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      if (mt.carpet) {
        ctx.fillStyle = mt.carpet;
        ctx.fillRect(0, h * 0.58, w, h * 0.42);
      }

      if (!s.fire && s.grass > 2500) {
        const carpet = Math.min(0.28, (s.grass - 2500) / 10000);
        ctx.fillStyle = `rgba(102, 187, 106, ${carpet})`;
        ctx.fillRect(0, h * 0.58, w, h * 0.42);
      }

      // —— 间歇泉蒸汽 ——
      const elapsed = (now - t0) / 1000;
      const steamX = w * 0.22;
      const steamY = h * 0.5;
      for (let i = 0; i < 4; i++) {
        const rise = ((elapsed * 18 + i * 22) % 50);
        const alpha = 0.18 - rise / 280;
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(
          steamX + Math.sin(elapsed + i) * 6,
          steamY - rise,
          10 + i * 3,
          6 + i,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(steamX - 6, steamY, 12, 4);

      // —— 河流中景 ——
      const river = ctx.createLinearGradient(w * 0.5, h * 0.55, w * 0.7, h);
      river.addColorStop(0, '#4fc3f7');
      river.addColorStop(1, '#0288d1');
      ctx.fillStyle = river;
      ctx.beginPath();
      ctx.moveTo(w * 0.52, h * 0.55);
      ctx.quadraticCurveTo(w * 0.48, h * 0.72, w * 0.58, h);
      ctx.lineTo(w * 0.72, h);
      ctx.quadraticCurveTo(w * 0.56, h * 0.72, w * 0.64, h * 0.55);
      ctx.fill();
      // 高光
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.58, h * 0.58);
      ctx.quadraticCurveTo(w * 0.54, h * 0.75, w * 0.62, h * 0.95);
      ctx.stroke();

      const { treeN, shrubN, grassN } = plantCounts(s);
      const hasTrees = plants.trees.length > 0;
      const hasShrubs = plants.shrubs.length > 0;
      const hasGrass = plants.grass.length > 0;
      const plantTips: PlantTip[] = [];

      ctx.save();
      if (s.fire) {
        ctx.filter = 'brightness(0.55) sepia(0.55) saturate(1.2)';
      } else if (s.season === 'winter') {
        ctx.filter = 'brightness(1.08) saturate(0.5)';
      } else if (s.season === 'autumn') {
        ctx.filter = 'sepia(0.3) hue-rotate(-18deg) saturate(1.15)';
      } else if (s.season === 'summer') {
        ctx.filter = 'brightness(1.06) saturate(1.15)';
      }

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
        // 少量河岸柳提示
        if (i < 4) {
          const pressure =
            s.elk > 200 ? '啃食压力高' : s.wolves > 30 ? '啃食压力缓和' : '生长平稳';
          plantTips.push({
            id: `willow-${i}`,
            displayName: '河岸柳树',
            detail: pressure,
            x: sx,
            y: sy - size * 0.5,
            hitR: 20,
          });
        }
      }

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

      // 刷新 activity（随状态变化，位置保持）
      for (let i = 0; i < crittersRef.list.length; i++) {
        const c = crittersRef.list[i]!;
        c.activity = pickActivity(c.kind, i, s);
      }

      const wantR = Math.min(MAX.rabbit, Math.max(0, Math.ceil(s.rabbits / 50)));
      const wantD = Math.min(MAX.deer, Math.max(0, Math.ceil(s.elk / 40)));
      const wantW = Math.min(MAX.wolf, Math.max(0, Math.ceil(s.wolves / 8)));
      const curR = crittersRef.list.filter((c) => c.kind === 'rabbit').length;
      const curD = crittersRef.list.filter((c) => c.kind === 'deer').length;
      const curWw = crittersRef.list.filter((c) => c.kind === 'wolf').length;
      if (curR !== wantR || curD !== wantD || curWw !== wantW || crittersRef.list.length === 0) {
        rebuildCritters(w, h, s);
      }

      for (const c of crittersRef.list) {
        const mul = animSpeedMul(c.activity);
        const bob = Math.sin(elapsed * c.speed * 4 * mul + c.phase) * 1.5;
        const wander = Math.sin(elapsed * c.speed * mul + c.phase) * (c.activity === 'fleeing' ? 18 : 12);
        const x = c.x + wander;
        const y = c.y + bob;
        const frameT = elapsed * (c.kind === 'rabbit' ? 8 : 6) * mul + c.phase;
        c.hitX = x;
        c.hitY = y - 12;
        c.hitR = c.kind === 'rabbit' ? 16 : 22;

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

      hitRef.current = { critters: crittersRef.list, plants: plantTips };

      if (s.fire) {
        ctx.fillStyle = 'rgba(255,87,34,0.28)';
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

      // 冬雪粒子
      if (s.season === 'winter') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 40; i++) {
          const sx = (seeded(i, 200) * w + elapsed * (12 + (i % 5))) % w;
          const sy = (seeded(i, 201) * h + elapsed * (20 + (i % 7)) * 8) % h;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2);
          ctx.fill();
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

  const hitTest = (clientX: number, clientY: number): TooltipInfo | null => {
    const canvas = ref.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: { d: number; tip: TooltipInfo } | null = null;

    for (const c of hitRef.current.critters) {
      const dx = x - c.hitX;
      const dy = y - c.hitY;
      const d = Math.hypot(dx, dy);
      if (d <= c.hitR && (!best || d < best.d)) {
        best = {
          d,
          tip: {
            title: c.displayName,
            lines: [
              `${c.role} · 心情 ${c.mood}`,
              `正在：${ACTIVITY_LABEL[c.activity]}`,
            ],
            x: c.hitX,
            y: Math.max(8, c.hitY - 28),
          },
        };
      }
    }
    for (const p of hitRef.current.plants) {
      const dx = x - p.x;
      const dy = y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= p.hitR && (!best || d < best.d)) {
        best = {
          d,
          tip: {
            title: p.displayName,
            lines: [p.detail],
            x: p.x,
            y: Math.max(8, p.y - 20),
          },
        };
      }
    }
    return best?.tip ?? null;
  };

  const onMove = (e: MouseEvent) => {
    setTooltip(hitTest(e.clientX, e.clientY));
  };
  const onClick = (e: MouseEvent) => {
    const tip = hitTest(e.clientX, e.clientY);
    if (tip) setTooltip(tip);
  };
  const onLeave = () => setTooltip(null);

  return (
    <div className="eco-scene-wrap" ref={wrapRef}>
      <canvas
        ref={ref}
        className="eco-scene-canvas"
        onMouseMove={onMove}
        onClick={onClick}
        onMouseLeave={onLeave}
      />
      {tooltip && (
        <div
          className="eco-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
          role="tooltip"
        >
          <div className="eco-tooltip-title">{tooltip.title}</div>
          {tooltip.lines.map((line) => (
            <div key={line} className="eco-tooltip-line">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
