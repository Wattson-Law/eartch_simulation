import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { EcosystemState } from '../sim/types';
import {
  createWildlifeWorld,
  stepWildlife,
  WILDLIFE_COVER_PATCHES,
  WILDLIFE_ACTIVITY_LABELS,
  WILDLIFE_LABELS,
  type WildlifeAgent,
  type WildlifeKind,
  type WildlifeActivity,
  type WildlifeObservation,
} from '../sim/wildlife';
import {
  ANIMAL_SHEETS,
  drawSheetFrameAnchored,
  loadEcosystemManifest,
  loadImage,
  loadPlantImages,
  type EcosystemAction,
  type EcosystemAnimal,
  type EcosystemManifest,
  type SheetMeta,
  type SceneLayerKey,
  type ScenePropMeta,
} from '../assetsPaths';
import {
  CLOUDS,
  cloudPosition,
  fishPosition,
  drawFish as drawSceneFish,
  drawLivingSky,
  FALLBACK_FISH_ROUTES,
  fitFishRoutes,
  advanceSeasonVisual,
  approachVisual,
  rgba,
  seasonPaletteAt,
  seasonPosition,
  type FishRoute,
} from './sceneEnvironment';

interface Props {
  state: EcosystemState;
  onObservation: (observation: WildlifeObservation) => void;
  onStatus?: (statuses: WildlifeStatus[]) => void;
}

export interface WildlifeStatus {
  kind: WildlifeKind;
  activity: WildlifeActivity;
  moving: boolean;
}

interface CritterHit {
  agent: WildlifeAgent;
  hitX: number;
  hitY: number;
  hitR: number;
}

interface VisualPose {
  action: EcosystemAction;
  previousAction: EcosystemAction;
  frame: number;
  previousFrame: number;
  actionTime: number;
  blend: number;
  movement: number;
  facing: number;
  oldFacing: number;
  turnTime: number;
}

interface FoliageSprite {
  id: string;
  img?: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  sway: number;
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
  id?: string;
  title: string;
  lines: string[];
  x: number;
  y: number;
}

const PLANT_CAP = { trees: 10, shrubs: 14, grass: 20 } as const;
const FRAME_HEIGHT = { rabbit: 38, deer: 94, wolf: 72 } as const;

const PROP_ANCHORS: Record<string, [number, number]> = {
  'pine-cluster': [0.11, 0.68],
  pine: [0.86, 0.69],
  aspen: [0.29, 0.67],
  'golden-shrub': [0.76, 0.79],
  willow: [0.61, 0.77],
  'distant-pines': [0.47, 0.64],
  'river-rocks': [0.59, 0.91],
  'moss-rock': [0.72, 0.91],
  'grass-daisies': [0.24, 0.91],
  reeds: [0.66, 0.84],
  'grass-flowers': [0.41, 0.91],
  cloud: [0.75, 0.23],
};

// Low vegetation leaves a continuous, visible corridor through the meadow.
const PROP_SCALE: Record<string, number> = {
  'grass-daisies': 0.55,
  'grass-flowers': 0.62,
  reeds: 0.55,
  willow: 0.67,
  'golden-shrub': 0.75,
  'river-rocks': 0.85,
  'moss-rock': 0.78,
  'distant-pines': 0.68,
};

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function drawFoliage(ctx: CanvasRenderingContext2D, prop: FoliageSprite) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.sway);
  if (prop.img) {
    ctx.drawImage(prop.img, -prop.width / 2, -prop.height, prop.width, prop.height);
  } else {
    for (let blade = 0; blade < 19; blade++) {
      const x = (blade / 18 - 0.5) * prop.width;
      const height = prop.height * (0.35 + seeded(blade, 74) * 0.6);
      ctx.fillStyle = blade % 2 ? '#699979' : '#80aa80';
      ctx.beginPath();
      ctx.moveTo(x - prop.width * 0.035, 0);
      ctx.quadraticCurveTo(x - prop.width * 0.08, -height * 0.55, x + prop.sway * 100, -height);
      ctx.quadraticCurveTo(x + prop.width * 0.07, -height * 0.5, x + prop.width * 0.035, 0);
      ctx.fill();
    }
  }
  ctx.restore();
}

function seeded(i: number, salt: number) {
  const t = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

function identityFor(agent: WildlifeAgent) {
  const { kind } = agent;
  const num = Number(agent.id.match(/\d+/)?.[0] ?? 1);
  if (kind === 'wolf') {
    return {
      displayName: `黄石 ${num} 号狼`,
      role: '河谷捕食者',
    };
  }
  if (kind === 'deer') {
    return {
      displayName: `拉马谷 ${num} 号美洲赤鹿`,
      role: '草食巡游者',
    };
  }
  return {
    displayName: `河谷 ${num} 号野兔`,
    role: '草丛觅食者',
  };
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  drawH: number,
  flipX = false,
  sway = 0,
) {
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const dw = drawH * aspect;
  const dh = drawH;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  if (flipX) {
    ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  } else {
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  }
  ctx.restore();
}

function tooltipFor(hit: CritterHit): TooltipInfo {
  const identity = identityFor(hit.agent);
  return {
    id: hit.agent.id,
    title: identity.displayName,
    lines: [identity.role, `正在：${WILDLIFE_ACTIVITY_LABELS[hit.agent.activity]}`],
    x: hit.hitX,
    y: Math.max(8, hit.hitY - 28),
  };
}

/** 绘本风黄石场景（Canvas 2D，生成素材缺失时使用备用精灵）。 */
export function EcoSceneCanvas({ state, onObservation, onStatus }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const observationRef = useRef(onObservation);
  const statusRef = useRef(onStatus);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hitRef = useRef<{ critters: CritterHit[]; plants: PlantTip[] }>({
    critters: [],
    plants: [],
  });

  useEffect(() => {
    stateRef.current = state;
    observationRef.current = onObservation;
    statusRef.current = onStatus;
  }, [state, onObservation, onStatus]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let cancelled = false;
    const t0 = performance.now();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animationSeconds = 0;
    let previousNow = t0;
    const wildlife = createWildlifeWorld(stateRef.current);
    const visualPoses = new Map<string, VisualPose>();
    let visualSeason = seasonPosition(stateRef.current.season);
    let visualRain = stateRef.current.rainfall;
    let visualFire = stateRef.current.fire ? 1 : 0;
    let lastObservation = '';
    let lastUiUpdate = 0;
    const statusPriority: Record<WildlifeActivity, number> = {
      feed: 8,
      graze: 7,
      drink: 6,
      chase: 5,
      flee: 5,
      pounce: 5,
      stalk: 4,
      emerge: 3,
      roam: 2,
      alert: 2,
      hide: 1,
      rest: 0,
    };

    const sheets: Partial<Record<keyof typeof ANIMAL_SHEETS, HTMLImageElement>> = {};
    const generatedSheets: Partial<Record<string, { img: HTMLImageElement; meta: SheetMeta }>> = {};
    const sceneImages: Partial<Record<SceneLayerKey, { img: HTMLImageElement; src: string }>> = {};
    const generatedProps: { id: string; meta: ScenePropMeta; img: HTMLImageElement }[] = [];
    let manifest: EcosystemManifest | null = null;
    let waterMask: HTMLCanvasElement | null = null;
    let waterSource = 'procedural';
    let fishRoutes: readonly FishRoute[] = FALLBACK_FISH_ROUTES;
    const rippleCanvas = document.createElement('canvas');
    const rippleCtx = rippleCanvas.getContext('2d');
    const animalCanvas = document.createElement('canvas');
    const animalCtx = animalCanvas.getContext('2d');
    const plants = {
      grass: [] as HTMLImageElement[],
      shrubs: [] as HTMLImageElement[],
      trees: [] as HTMLImageElement[],
    };

    const installWaterMask = (source: HTMLImageElement, inferWater = false) => {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = source.naturalWidth;
      maskCanvas.height = source.naturalHeight;
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      if (!maskCtx) return;
      maskCtx.drawImage(source, 0, 0);
      const pixels = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      const { data } = pixels;
      if (inferWater) {
        // The river layer also includes its sandy bank. Select blue-green water
        // from its opaque pixels if the separate mask cannot be downloaded.
        for (let i = 0; i < data.length; i += 4) {
          const water = data[i + 3]! > 230 && data[i + 1]! > data[i]! * 1.04 && data[i + 2]! > data[i]! * 1.07;
          data[i + 3] = water ? 255 : 0;
        }
        maskCtx.putImageData(pixels, 0, 0);
      }
      fishRoutes = fitFishRoutes((x, y) => {
        if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
        const pixel = Math.floor(y * maskCanvas.height) * maskCanvas.width + Math.floor(x * maskCanvas.width);
        return data[pixel * 4 + 3]! > 230;
      });
      waterMask = maskCanvas;
      waterSource = inferWater ? 'inferred' : 'generated';
    };

    void (async () => {
      // Start legacy loads immediately so a slow generated pack never leaves
      // the scene without animals during its first paint.
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
    })();

    void (async () => {
      manifest = await loadEcosystemManifest();
      if (manifest?.scene) {
        const sceneEntries = Object.entries(manifest.scene.layers) as [SceneLayerKey, { src: string }][];
        await Promise.all(
          sceneEntries.map(async ([key, layer]) => {
            try {
              sceneImages[key] = { img: await loadImage(layer.src), src: layer.src };
            } catch {
              /* missing layer keeps the procedural counterpart */
            }
          }),
        );
        if (sceneImages.river) {
          try {
            if (!manifest.scene.waterMask) throw new Error('No water mask');
            installWaterMask(await loadImage(manifest.scene.waterMask));
          } catch {
            installWaterMask(sceneImages.river.img, true);
          }
        }
      }
      if (manifest?.props) {
        await Promise.all(
          Object.entries(manifest.props).map(async ([id, meta]) => {
            try {
              generatedProps.push({ id, meta, img: await loadImage(meta.src) });
            } catch {
              /* old plant sprites remain available when no generated prop loads */
            }
          }),
        );
        generatedProps.sort((a, b) => a.id.localeCompare(b.id));
      }
      if (manifest) {
        const generatedEntries: [EcosystemAnimal, EcosystemAction][] = [
          ['wolf', 'idle'],
          ['wolf', 'walk'],
          ['wolf', 'run'],
          ['wolf', 'howl'],
          ['elk', 'idle'],
          ['elk', 'walk'],
          ['elk', 'run'],
          ['elk', 'graze'],
          ['rabbit', 'idle'],
          ['rabbit', 'hop'],
          ['rabbit', 'run'],
          ['rabbit', 'alert'],
        ];
        await Promise.all(
          generatedEntries.map(async ([animal, action]) => {
            const meta = manifest?.animals[animal]?.[action];
            if (!meta) return;
            try {
              generatedSheets[`${animal}:${action}`] = { img: await loadImage(meta.src), meta };
            } catch {
              /* old ScratchIO sheet remains the fallback */
            }
          }),
        );
      }
      try {
        const loaded = await loadPlantImages();
        plants.grass = loaded.grass;
        plants.shrubs = loaded.shrubs;
        plants.trees = loaded.trees;
      } catch {
        /* blob fallback */
      }
    })();

    const generatedSheet = (kind: WildlifeKind, action: EcosystemAction) => {
      const animal: EcosystemAnimal = kind === 'deer' ? 'elk' : kind;
      return generatedSheets[`${animal}:${action}`];
    };

    const drawSkyMotion = (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number, overcast: boolean | number) => {
      const cloud = generatedProps.find((prop) => prop.id === 'cloud');
      drawLivingSky(ctx, w, h, elapsed, cloud?.img, overcast);
    };

    const sheetFor = (kind: WildlifeKind, action: EcosystemAction) => {
      const generated = generatedSheet(kind, action);
      if (generated) return generated;
      const prefix = kind === 'deer' ? 'elk' : kind;
      const key = `${prefix}${action[0].toUpperCase()}${action.slice(1)}` as keyof typeof ANIMAL_SHEETS;
      return { img: sheets[key], meta: ANIMAL_SHEETS[key] as SheetMeta };
    };

    const drawCritterSheet = (
      target: CanvasRenderingContext2D,
      agent: WildlifeAgent,
      x: number,
      y: number,
      sceneWidth: number,
      elapsed: number,
      delta: number,
    ) => {
      const { kind, activity } = agent;
      const moving = Math.hypot(agent.vx, agent.vy * 0.5625) > 0.002;
      const running = activity === 'chase' || activity === 'flee' || activity === 'pounce';
      const action: EcosystemAction = moving || running
        ? running ? 'run' : kind === 'rabbit' ? 'hop' : 'walk'
        : kind === 'deer' && (activity === 'graze' || activity === 'drink') ? 'graze'
        : kind === 'rabbit' && activity === 'alert' ? 'alert'
        : kind === 'wolf' && activity === 'alert' && agent.activityTime > 1.2 ? 'howl' : 'idle';
      const current = sheetFor(kind, action);
      if (!current.img) return false;
      let pose = visualPoses.get(agent.id);
      if (!pose) {
        pose = { action, previousAction: action, frame: 0, previousFrame: 0, actionTime: agent.phase % 1.5, blend: 1, movement: moving ? 1 : 0, facing: agent.facing, oldFacing: agent.facing, turnTime: 1 };
        visualPoses.set(agent.id, pose);
      }
      if (pose.action !== action) {
        pose.previousAction = pose.action;
        pose.previousFrame = pose.frame;
        pose.action = action;
        pose.actionTime = 0;
        pose.blend = 0;
      }
      if (pose.facing !== agent.facing) {
        pose.oldFacing = pose.facing;
        pose.facing = agent.facing;
        pose.turnTime = 0;
      }
      pose.actionTime += delta;
      pose.blend = Math.min(1, pose.blend + delta / 0.22);
      pose.movement += ((moving ? 1 : 0) - pose.movement) * (1 - Math.exp(-delta * 12));
      pose.turnTime = Math.min(1, pose.turnTime + delta / 0.32);
      const facing = pose.turnTime < 0.5 ? pose.oldFacing : pose.facing;
      const turnScale = 1 - Math.sin(pose.turnTime * Math.PI) * 0.83;
      // Distance drives feet; stationary gestures have an independent clock.
      pose.frame = moving || running ? agent.gait * current.meta.frames : pose.actionTime * (current.meta.fps ?? 6);
      const depth = 0.84 + (agent.y - 0.61) * 0.8;
      const desiredHeight = FRAME_HEIGHT[kind] * Math.min(sceneWidth / 700, 1.4) * depth;
      const strideWave = Math.sin(agent.gait * Math.PI * 2);
      const hop = kind === 'rabbit' ? Math.max(0, strideWave) * desiredHeight * 0.13 * pose.movement : 0;
      const pounce = activity === 'pounce' ? Math.sin(Math.min(1, agent.activityTime / 0.65) * Math.PI) * desiredHeight * 0.28 : 0;
      const breath = Math.sin(elapsed * 2.1 + agent.phase) * 0.007 * (1 - pose.movement);
      const weight = kind !== 'rabbit' ? Math.abs(strideWave) * desiredHeight * (running ? 0.025 : 0.012) * pose.movement : 0;
      target.save();
      target.globalAlpha = agent.opacity;
      target.fillStyle = 'rgba(48,69,51,0.17)';
      target.beginPath();
      target.ellipse(x, y + 1, desiredHeight * (kind === 'rabbit' ? 0.36 : 0.49), desiredHeight * 0.06, 0, 0, Math.PI * 2);
      target.fill();
      target.translate(x, y - hop - pounce - weight);
      const nibble = activity === 'graze' || activity === 'feed' || activity === 'drink';
      const pitch = activity === 'stalk' ? 0.025 : activity === 'feed' ? 0.09 : activity === 'drink' ? 0.075 : activity === 'graze' ? 0.055 : 0;
      target.rotate(facing * (pitch + (nibble ? Math.sin(elapsed * 4 + agent.phase) * 0.012 : 0)));
      target.scale(turnScale, 1 + breath - (activity === 'stalk' ? 0.055 : 0));
      const drawPose = (sheet: ReturnType<typeof sheetFor>, frame: number, alpha: number) => {
        if (!sheet.img || alpha <= 0) return;
        const meta = sheet.meta;
        const anchored = meta.anchor ? meta : { ...meta, anchor: { x: 0.5, y: 1 } };
        target.globalAlpha = agent.opacity * alpha;
        drawSheetFrameAnchored(target, sheet.img, anchored, frame, 0, 0, desiredHeight / meta.frameH, (meta.facing ?? 'right') === 'right' ? facing < 0 : facing > 0);
      };
      const previous = sheetFor(kind, pose.previousAction);
      const blend = previous.img ? smoothstep(pose.blend) : 1;
      if (blend < 1) {
        drawPose(previous, pose.previousFrame, 1 - blend);
        // Add premultiplied pose weights on the isolated animal surface. This
        // avoids the transparent dip of a normal source-over crossfade.
        target.globalCompositeOperation = 'lighter';
      }
      drawPose(current, pose.frame, blend);
      target.restore();

      // Sprite sheets carry the broad silhouette. These small overlays make
      // the intent of a gesture readable even when the source clip is idle:
      // a grazing animal bends toward a few blades, a wolf worries a morsel,
      // and a drinking animal creates a ring in the water.
      if (nibble && agent.opacity > 0.35) {
        const gesture = (Math.sin(elapsed * (activity === 'drink' ? 3.6 : 5.2) + agent.phase) + 1) * 0.5;
        const headX = x + facing * desiredHeight * (kind === 'rabbit' ? 0.16 : 0.23);
        const headY = y - desiredHeight * (kind === 'rabbit' ? 0.5 : 0.69) + gesture * desiredHeight * 0.035;
        target.save();
        target.globalAlpha = agent.opacity * (0.48 + gesture * 0.2);
        target.lineWidth = Math.max(0.75, desiredHeight * 0.018);
        if (activity === 'drink') {
          target.strokeStyle = 'rgba(226,244,230,0.72)';
          target.beginPath();
          target.ellipse(headX, y + desiredHeight * 0.035, desiredHeight * (0.18 + gesture * 0.06), desiredHeight * 0.025, 0, 0, Math.PI * 2);
          target.stroke();
          target.strokeStyle = 'rgba(141,204,196,0.58)';
          target.beginPath();
          target.ellipse(headX, y + desiredHeight * 0.035, desiredHeight * (0.08 + gesture * 0.04), desiredHeight * 0.012, 0, 0, Math.PI * 2);
          target.stroke();
        } else if (activity === 'feed') {
          target.fillStyle = '#a8784d';
          target.beginPath();
          target.ellipse(headX + facing * desiredHeight * 0.11, headY + desiredHeight * 0.04, desiredHeight * 0.055, desiredHeight * 0.035, 0, 0, Math.PI * 2);
          target.fill();
          target.strokeStyle = 'rgba(244,201,137,0.7)';
          target.beginPath();
          target.moveTo(headX + facing * desiredHeight * 0.04, headY + desiredHeight * 0.1);
          target.lineTo(headX + facing * desiredHeight * 0.16, headY + desiredHeight * 0.1 + gesture * desiredHeight * 0.025);
          target.stroke();
        } else {
          target.strokeStyle = 'rgba(111,157,91,0.78)';
          for (let blade = 0; blade < 3; blade++) {
            const bx = headX + facing * desiredHeight * (0.04 + blade * 0.065);
            const by = headY + desiredHeight * 0.14;
            target.beginPath();
            target.moveTo(bx, by);
            target.quadraticCurveTo(bx - facing * desiredHeight * 0.02, by - desiredHeight * (0.08 + blade * 0.012), bx + facing * desiredHeight * 0.02, by - desiredHeight * (0.13 + gesture * 0.025));
            target.stroke();
          }
        }
        target.restore();
      }

      if (moving && agent.opacity > 0.5) {
        for (let i = 0; i < 3; i++) {
          const age = (agent.gait * 1.4 + i / 3) % 1;
          const dustAlpha = running ? 0.2 : 0.1;
          target.fillStyle = `rgba(191,170,127,${(1 - age) * dustAlpha})`;
          target.beginPath();
          target.ellipse(x - facing * desiredHeight * (0.25 + age * 0.5), y - age * desiredHeight * 0.08, desiredHeight * (0.018 + age * 0.06), desiredHeight * (0.015 + age * 0.035), 0, 0, Math.PI * 2);
          target.fill();
        }
      }
      return true;
    };

    const drawSceneLayer = (ctx: CanvasRenderingContext2D, key: SceneLayerKey, w: number, h: number) => {
      const entry = sceneImages[key];
      if (!entry) return false;
      const sourceW = manifest?.scene?.width ?? 2048;
      const sourceH = manifest?.scene?.height ?? 1152;
      // Contain keeps the generated composition undistorted on narrow panels.
      const scale = Math.min(w / sourceW, h / sourceH);
      const dw = sourceW * scale;
      const dh = sourceH * scale;
      ctx.drawImage(entry.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return true;
    };

    const prepareFoliage = (w: number, h: number, elapsed: number): FoliageSprite[] => {
      const scale = Math.min(w / (manifest?.scene?.width ?? 2048), h / (manifest?.scene?.height ?? 1152));
      const sprites: FoliageSprite[] = generatedProps.filter((prop) => prop.id !== 'cloud').map((prop, index) => {
        const [x, y] = PROP_ANCHORS[prop.id] ?? [0.5, 0.86];
        const plant = !['river-rocks', 'moss-rock'].includes(prop.id);
        return { id: prop.id, img: prop.img, x: x * w, y: y * h, width: prop.meta.width * scale * (PROP_SCALE[prop.id] ?? 1), height: prop.meta.height * scale * (PROP_SCALE[prop.id] ?? 1), sway: plant ? Math.sin(elapsed * 0.8 + index * 0.9) * 0.014 : 0 };
      });
      for (const patch of WILDLIFE_COVER_PATCHES) {
        const count = patch.id === 'left-tall-grass' ? 7 : 3;
        for (let i = 0; i < count; i++) {
          const offset = i / (count - 1) * 2 - 1;
          const prop = generatedProps.find((p) => p.id === (i % 2 ? 'grass-flowers' : 'grass-daisies'));
          const height = patch.height * h * (0.64 + (1 - Math.abs(offset)) * 0.45);
          const x = patch.x + patch.rx * offset * 0.86;
          const y = patch.y + patch.ry * (0.38 + 0.12 * Math.sin(i * 2.3));
          const visitor = wildlife.agents.find((agent) => Math.hypot(agent.x - x, (agent.y - y) * 0.5625) < 0.065);
          const rustle = visitor ? Math.min(1, Math.hypot(visitor.vx, visitor.vy) / 0.06) * Math.sin(elapsed * 9 + i) * 0.045 : 0;
          sprites.push({ id: `${patch.id}-${i}`, img: prop?.img, x: x * w, y: y * h, width: height * (prop ? prop.meta.width / prop.meta.height : 1.4), height, sway: Math.sin(elapsed * 1.1 + i * 0.7) * 0.018 + rustle });
        }
      }
      return sprites.sort((a, b) => a.y - b.y);
    };

    const drawWaterMotion = (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
      if (waterMask && rippleCtx) {
        const width = Math.max(1, Math.floor(w * dpr));
        const height = Math.max(1, Math.floor(h * dpr));
        if (rippleCanvas.width !== width || rippleCanvas.height !== height) {
          rippleCanvas.width = width;
          rippleCanvas.height = height;
        }
        rippleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rippleCtx.clearRect(0, 0, w, h);
        rippleCtx.save();
        drawSceneFish(rippleCtx, w, h, elapsed, fishRoutes);
        rippleCtx.strokeStyle = 'rgba(255,239,190,0.26)';
        rippleCtx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const y = h * (0.61 + ((i * 0.073 + elapsed * 0.012) % 0.34));
          const x = w * (0.48 + ((i * 0.11 + elapsed * 0.01) % 0.34));
          rippleCtx.beginPath();
          rippleCtx.ellipse(x, y, w * 0.03, h * 0.006, 0, 0, Math.PI * 2);
          rippleCtx.stroke();
        }
        rippleCtx.strokeStyle = 'rgba(255,255,255,0.42)';
        rippleCtx.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          const y = h * (0.58 + ((i * 0.047 + elapsed * 0.025) % 0.37));
          const x = w * (0.48 + ((i * 0.073 + elapsed * 0.018) % 0.22));
          rippleCtx.beginPath();
          rippleCtx.moveTo(x, y);
          rippleCtx.quadraticCurveTo(x + w * 0.025, y - 2, x + w * 0.05, y);
          rippleCtx.stroke();
        }
        const sourceW = manifest?.scene?.width ?? 2048;
        const sourceH = manifest?.scene?.height ?? 1152;
        const scale = Math.min(w / sourceW, h / sourceH);
        const dw = sourceW * scale;
        const dh = sourceH * scale;
        rippleCtx.globalCompositeOperation = 'destination-in';
        rippleCtx.drawImage(waterMask, (w - dw) / 2, (h - dh) / 2, dw, dh);
        rippleCtx.restore();
        ctx.drawImage(rippleCanvas, 0, 0, w, h);
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.52, h * 0.78);
      ctx.quadraticCurveTo(w * 0.5, h * 0.9, w * 0.58, h);
      ctx.lineTo(w * 0.72, h);
      ctx.quadraticCurveTo(w * 0.72, h * 0.9, w * 0.64, h * 0.78);
      ctx.clip();
      drawSceneFish(ctx, w, h, elapsed, FALLBACK_FISH_ROUTES);
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const y = h * (0.78 + ((i * 0.027 + elapsed * 0.025) % 0.22));
        const x = w * (0.48 + ((i * 0.073 + elapsed * 0.018) % 0.22));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + w * 0.025, y - 2, x + w * 0.05, y);
        ctx.stroke();
      }
      ctx.restore();
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

    const plantCounts = (s: EcosystemState, fireStrength: number) => {
      let treeN = Math.min(
        PLANT_CAP.trees,
        Math.max(0, Math.ceil(s.shrubs / 450) + Math.ceil(s.grass / 4000)),
      );
      let shrubN = Math.min(PLANT_CAP.shrubs, Math.max(0, Math.ceil(s.shrubs / 360)));
      let grassN = Math.min(PLANT_CAP.grass, Math.max(0, Math.ceil(s.grass / 500)));
      if (fireStrength > 0) {
        treeN = Math.max(0, Math.floor(treeN * (1 - fireStrength * 0.45)));
        shrubN = Math.max(0, Math.floor(shrubN * (1 - fireStrength * 0.5)));
        grassN = Math.max(0, Math.floor(grassN * (1 - fireStrength * 0.55)));
      }
      return { treeN, shrubN, grassN };
    };

    const paint = (now: number) => {
      if (cancelled) return;
      const delta = Math.min(0.1, Math.max(0, (now - previousNow) / 1000));
      previousNow = now;
      const s = stateRef.current;
      const reducedMotion = motionQuery.matches;
      const motionDelta = !s.paused && !reducedMotion && !document.hidden ? delta : 0;
      animationSeconds += motionDelta;
      stepWildlife(wildlife, motionDelta, s);
      if (reducedMotion) {
        // Deliberate commands still need to be visible when the user asks for
        // reduced motion; only the interpolation itself is removed.
        visualSeason = seasonPosition(s.season);
        visualRain = s.rainfall;
        visualFire = s.fire ? 1 : 0;
      } else {
        visualSeason = advanceSeasonVisual(visualSeason, s.season, motionDelta);
        visualRain = approachVisual(visualRain, s.rainfall, motionDelta, 2.8);
        visualFire = approachVisual(visualFire, s.fire ? 1 : 0, motionDelta, 4.8);
      }
      if (wildlife.observation.text !== lastObservation) {
        lastObservation = wildlife.observation.text;
        observationRef.current({ ...wildlife.observation });
      }
      const elapsed = animationSeconds;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const hasSceneArt = Object.keys(sceneImages).length > 0;
      const palette = seasonPaletteAt(visualSeason);
      const rainOvercast = Math.max(0, Math.min(1, (visualRain - 0.45) / 0.55));
      const seasonCyclePosition = ((visualSeason % 4) + 4) % 4;
      const vegetationFilter = visualFire > 0.001
        ? `brightness(${1 - visualFire * 0.45}) sepia(${visualFire * 0.55}) saturate(${1 + visualFire * 0.2})`
        : palette.snow > 0.02
          ? `brightness(${1 + palette.snow * 0.08}) saturate(${1 - palette.snow * 0.5})`
          : seasonCyclePosition > 1.8 && seasonCyclePosition < 2.8
            ? 'sepia(0.3) hue-rotate(-18deg) saturate(1.15)'
            : seasonCyclePosition > 0.8 && seasonCyclePosition < 1.8
              ? 'brightness(1.06) saturate(1.15)'
              : 'none';
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(palette.skyTop));
      g.addColorStop(1, rgba(palette.skyBottom));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      drawSceneLayer(ctx, 'sky', w, h);
      drawSkyMotion(ctx, w, h, elapsed, rainOvercast);

      // —— 远山 ——
      if (!sceneImages.mountains) {
        ctx.fillStyle = rgba(palette.far);
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
        if (palette.snow > 0.02) {
          ctx.fillStyle = `rgba(255,255,255,${0.85 * palette.snow})`;
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

      }

      if (!sceneImages.meadow) {
        // 中景山丘
        ctx.fillStyle = rgba(palette.far);
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
        ctx.fillStyle = rgba(palette.near);
        ctx.fillRect(0, h * 0.55, w, h * 0.45);
        if (palette.carpetAlpha > 0.001) {
          ctx.fillStyle = rgba(palette.carpet, palette.carpetAlpha * (1 - visualFire * 0.75));
          ctx.fillRect(0, h * 0.58, w, h * 0.42);
        }

        if (visualFire < 0.99 && s.grass > 2500) {
          const carpet = Math.min(0.28, (s.grass - 2500) / 10000) * (1 - visualFire * 0.8);
          ctx.fillStyle = rgba(palette.carpet, carpet);
          ctx.fillRect(0, h * 0.58, w, h * 0.42);
        }

      }

      // —— 间歇泉蒸汽 ——
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
      // Generated river art already contains the full shape. Keep the
      // procedural fallback only when that layer is unavailable.
      if (!sceneImages.river) {
        const river = ctx.createLinearGradient(w * 0.5, h * 0.78, w * 0.7, h);
        river.addColorStop(0, '#4fc3f7');
        river.addColorStop(1, '#0288d1');
        ctx.fillStyle = river;
        ctx.beginPath();
        // Keep the same dry upper corridor used by the wildlife navigation.
        ctx.moveTo(w * 0.52, h * 0.78);
        ctx.quadraticCurveTo(w * 0.5, h * 0.9, w * 0.58, h);
        ctx.lineTo(w * 0.72, h);
        ctx.quadraticCurveTo(w * 0.72, h * 0.9, w * 0.64, h * 0.78);
        ctx.fill();
        // 高光
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.58, h * 0.8);
        ctx.quadraticCurveTo(w * 0.54, h * 0.9, w * 0.62, h * 0.95);
        ctx.stroke();
      }

      // Generated layers replace their matching procedural counterpart while
      // any missing file remains covered by the original drawing above.
      if (hasSceneArt) {
        for (const key of ['mountains', 'meadow', 'forestBack', 'river'] as const) {
          drawSceneLayer(ctx, key, w, h);
        }
      }
      // Keep generated layers and procedural fallbacks in the same seasonal
      // atmosphere. The strength is continuous, so a forced season reads as
      // a slow change in light instead of a hard palette cut.
      if (palette.tintAlpha > 0.001 || visualFire > 0.001) {
        ctx.save();
        ctx.fillStyle = rgba(palette.tint);
        ctx.globalAlpha = palette.tintAlpha;
        ctx.fillRect(0, 0, w, h * 0.86);
        if (visualFire > 0.001) {
          ctx.fillStyle = '#5d4037';
          ctx.globalAlpha = visualFire * 0.16;
          ctx.fillRect(0, h * 0.42, w, h * 0.58);
        }
        ctx.restore();
      }
      drawWaterMotion(ctx, w, h, elapsed);

      const { treeN, shrubN, grassN } = plantCounts(s, visualFire);
      const hasTrees = plants.trees.length > 0;
      const hasShrubs = plants.shrubs.length > 0;
      const hasGrass = plants.grass.length > 0;
      const plantTips: PlantTip[] = [];
      const generatedPropIds = new Set(generatedProps.map((prop) => prop.id));
      const hasGeneratedTrees = ['pine-cluster', 'pine', 'aspen', 'distant-pines'].some((id) => generatedPropIds.has(id));
      const hasGeneratedShrubs = ['golden-shrub', 'willow'].some((id) => generatedPropIds.has(id));
      const hasGeneratedGrass = ['grass-daisies', 'reeds', 'grass-flowers'].some((id) => generatedPropIds.has(id));


      ctx.save();
      ctx.filter = vegetationFilter;

      if (!hasGeneratedTrees) for (let i = 0; i < treeN; i++) {
        const tx = 24 + seeded(i, 41) * (w - 48);
        const ty = h * 0.52 + seeded(i, 42) * h * 0.08;
        const size = 48 + seeded(i, 43) * 36;
        if (hasTrees) {
          const img = plants.trees[i % plants.trees.length]!;
          drawSprite(ctx, img, tx, ty, size, seeded(i, 44) > 0.5, Math.sin(elapsed * 0.65 + i) * 0.018);
        } else {
          drawPlantBlob(tx, ty - size * 0.3, size * 0.35, rgba(palette.near));
        }
      }

      if (!hasGeneratedShrubs) for (let i = 0; i < shrubN; i++) {
        const sx = 20 + seeded(i, 51) * (w - 40);
        const sy = h * 0.58 + seeded(i, 52) * h * 0.12;
        const size = 28 + seeded(i, 53) * 22;
        if (hasShrubs) {
          const img = plants.shrubs[i % plants.shrubs.length]!;
          drawSprite(ctx, img, sx, sy, size, seeded(i, 54) > 0.5, Math.sin(elapsed * 0.9 + i * 0.7) * 0.024);
        } else {
          drawPlantBlob(sx, sy - 8, 14 + (i % 3) * 3, rgba(palette.carpet));
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

      if (!hasGeneratedGrass) for (let i = 0; i < grassN; i++) {
        const gx = 12 + seeded(i, 61) * (w - 24);
        const gy = h * 0.7 + seeded(i, 62) * h * 0.22;
        const size = 16 + seeded(i, 63) * 18;
        if (hasGrass) {
          const img = plants.grass[i % plants.grass.length]!;
          drawSprite(ctx, img, gx, gy, size, seeded(i, 64) > 0.5, Math.sin(elapsed * 1.2 + i * 0.5) * 0.035);
        } else {
          ctx.fillStyle = palette.snow > 0.2 ? rgba(palette.near) : rgba(palette.carpet);
          ctx.fillRect(gx, gy - 10, 2, 8 + seeded(i, 33) * 6);
        }
      }

      ctx.restore();

      const hits: CritterHit[] = [];
      const foliage = prepareFoliage(w, h, elapsed);
      ctx.save();
      ctx.filter = vegetationFilter;
      for (const prop of foliage) drawFoliage(ctx, prop);
      ctx.restore();
      // Reuse one small offscreen surface. Leaf alpha masks reveal each animal
      // continuously as it walks past the shelter, instead of flipping a whole
      // sprite from in front to behind when its feet cross a sorting line.
      const bufferW = Math.ceil(FRAME_HEIGHT.deer * Math.min(w / 700, 1.4) * 3.6);
      const bufferH = Math.ceil(FRAME_HEIGHT.deer * Math.min(w / 700, 1.4) * 2.3);
      if (animalCanvas.width !== Math.ceil(bufferW * dpr) || animalCanvas.height !== Math.ceil(bufferH * dpr)) {
        animalCanvas.width = Math.ceil(bufferW * dpr);
        animalCanvas.height = Math.ceil(bufferH * dpr);
      }
      for (const agent of [...wildlife.agents].sort((a, b) => a.y - b.y)) {
        if (agent.opacity < 0.05) continue;
        const x = agent.x * w;
        const y = agent.y * h;
        const drawnHeight = FRAME_HEIGHT[agent.kind] * Math.min(w / 700, 1.4) * (0.84 + (agent.y - 0.61) * 0.8);
        hits.push({ agent, hitX: x, hitY: y - drawnHeight * 0.42, hitR: Math.max(9, drawnHeight * 0.4) });
        const target = animalCtx ?? ctx;
        const left = x - bufferW / 2;
        const top = y - bufferH * 0.84;
        if (animalCtx) {
          animalCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          animalCtx.clearRect(0, 0, bufferW, bufferH);
          animalCtx.translate(-left, -top);
        }
        if (!drawCritterSheet(target, agent, x, y, w, elapsed, motionDelta)) {
          target.save();
          target.globalAlpha = agent.opacity;
          target.font = `${drawnHeight * 0.7}px serif`;
          target.textAlign = 'center';
          target.fillText(agent.kind === 'rabbit' ? '🐇' : agent.kind === 'deer' ? '🦌' : '🐺', x, y);
          target.restore();
        }
        if (animalCtx) {
          animalCtx.save();
          animalCtx.globalCompositeOperation = 'destination-out';
          for (const prop of foliage) {
            if (Math.abs(prop.x - x) > prop.width * 0.62 + drawnHeight || prop.y < y - drawnHeight * 1.5 || prop.y - prop.height > y + drawnHeight * 0.15) continue;
            const occlusion = smoothstep((prop.y / h - agent.y + 0.018) / 0.036);
            if (occlusion <= 0) continue;
            animalCtx.save();
            if (occlusion < 1) {
              // As feet step in front of the plant, reveal the body upward.
              // Leaves stay opaque instead of making the animal ghostlike.
              const maskBottom = y - drawnHeight * 1.5 + occlusion * drawnHeight * 1.65;
              animalCtx.beginPath();
              animalCtx.rect(left, top, bufferW, Math.max(0, maskBottom - top));
              animalCtx.clip();
            }
            animalCtx.filter = vegetationFilter;
            drawFoliage(animalCtx, prop);
            animalCtx.restore();
          }
          animalCtx.restore();
          ctx.drawImage(animalCanvas, left, top, bufferW, bufferH);
        }
      }
      for (const id of visualPoses.keys()) {
        if (!wildlife.agents.some((agent) => agent.id === id)) visualPoses.delete(id);
      }

      if (hasSceneArt) drawSceneLayer(ctx, 'foreground', w, h);

      hitRef.current = { critters: hits, plants: plantTips };
      if (now - lastUiUpdate > 200) {
        lastUiUpdate = now;
        const selected = hits.find((hit) => hit.agent.id === selectedRef.current);
        if (selectedRef.current) setTooltip(selected ? tooltipFor(selected) : null);
        if (statusRef.current) {
          const byKind = new Map<WildlifeKind, WildlifeAgent>();
          for (const agent of wildlife.agents) {
            const previous = byKind.get(agent.kind);
            if (!previous || statusPriority[agent.activity] > statusPriority[previous.activity]) byKind.set(agent.kind, agent);
          }
          statusRef.current((['wolf', 'deer', 'rabbit'] as WildlifeKind[]).map((kind) => {
            const agent = byKind.get(kind);
            return {
              kind,
              activity: agent?.activity ?? 'rest',
              moving: agent ? Math.hypot(agent.vx, agent.vy * 0.5625) > 0.002 : false,
            };
          }));
        }
        // Development-only telemetry supports reproducible movement checks;
        // no diagnostics or implementation details enter the visitor UI.
        if (import.meta.env.DEV) {
          canvas.dataset.wildlife = JSON.stringify({
            time: wildlife.time,
            observation: wildlife.observation,
            scene: { sun: true, clouds: CLOUDS.length, fish: (waterMask ? fishRoutes : FALLBACK_FISH_ROUTES).length, waterSource },
            environment: {
              clouds: CLOUDS.map((_, index) => cloudPosition(index, elapsed)),
              fish: (waterMask ? fishRoutes : FALLBACK_FISH_ROUTES).map((route) => ({ ...fishPosition(route, elapsed), size: route.size })),
              time: elapsed,
              visualSeason,
              visualRain,
              visualFire,
              rainStrength: Math.max(0, Math.min(1, (visualRain - 0.45) / 0.55)),
              snowStrength: palette.snow,
            },
            poses: [...visualPoses.entries()].map(([id, pose]) => ({ id, action: pose.action, blend: pose.blend, frame: pose.frame })),
            agents: wildlife.agents.map(({ id, kind, x, y, vx, vy, facing, activity, gait, opacity, cover }) => ({ id, kind, x, y, vx, vy, facing, activity, gait, opacity, cover })),
            statuses: (['wolf', 'deer', 'rabbit'] as WildlifeKind[]).map((kind) => {
              const agent = wildlife.agents.find((candidate) => candidate.kind === kind);
              return { kind, label: WILDLIFE_LABELS[kind], activity: agent?.activity ?? 'rest' };
            }),
          });
        }
      }

      if (visualFire > 0.001) {
        // A low translucent ember bed plus tapered flame shapes reads as a
        // fire front while still allowing the illustrated scene to remain
        // visible underneath. Both layers fade with the same visual state.
        ctx.save();
        ctx.globalAlpha = visualFire * 0.24;
        const heat = ctx.createLinearGradient(0, h * 0.5, 0, h);
        heat.addColorStop(0, 'rgba(255,112,55,0)');
        heat.addColorStop(1, 'rgba(255,78,32,0.9)');
        ctx.fillStyle = heat;
        ctx.fillRect(0, h * 0.48, w, h * 0.52);
        for (let i = 0; i < 9; i++) {
          const baseX = w * (0.09 + seeded(i, 301) * 0.82);
          const baseY = h * (0.76 + seeded(i, 302) * 0.16);
          const flameH = h * (0.08 + seeded(i, 303) * 0.11) * Math.max(0.55, visualFire);
          const sway = Math.sin(elapsed * (3.4 + seeded(i, 304) * 1.8) + i) * w * 0.009;
          ctx.globalAlpha = visualFire * (0.48 + seeded(i, 305) * 0.3);
          ctx.fillStyle = i % 2 ? '#e85d2a' : '#f59e43';
          ctx.beginPath();
          ctx.moveTo(baseX - w * 0.012, baseY);
          ctx.quadraticCurveTo(baseX - w * 0.026, baseY - flameH * 0.42, baseX + sway, baseY - flameH);
          ctx.quadraticCurveTo(baseX + w * 0.023, baseY - flameH * 0.47, baseX + w * 0.012, baseY);
          ctx.fill();
          ctx.globalAlpha = visualFire * 0.58;
          ctx.fillStyle = '#ffe2a1';
          ctx.beginPath();
          ctx.ellipse(baseX + sway * 0.4, baseY - flameH * 0.27, w * 0.006, flameH * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = visualFire * 0.5;
        ctx.fillStyle = '#f6b34a';
        for (let i = 0; i < 12; i++) {
          const ex = w * (0.08 + seeded(i, 306) * 0.84);
          const ey = h * (0.64 + seeded(i, 307) * 0.27) - elapsed * (4 + i % 4);
          ctx.beginPath();
          ctx.arc(ex, ey % (h * 0.34) + h * 0.52, 1.1 + (i % 3) * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        // Smoke rises slowly and bends with the same paused clock.
        ctx.globalAlpha = visualFire * 0.12;
        ctx.fillStyle = '#5d514b';
        for (let i = 0; i < 4; i++) {
          const sx = w * (0.2 + i * 0.2) + Math.sin(elapsed * 0.4 + i) * w * 0.02;
          const sy = h * (0.58 - i * 0.07);
          ctx.beginPath();
          ctx.ellipse(sx, sy, w * (0.035 + i * 0.008), h * (0.022 + i * 0.006), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      const rainStrength = Math.max(0, Math.min(1, (visualRain - 0.45) / 0.55));
      if (rainStrength > 0.005) {
        ctx.save();
        ctx.strokeStyle = `rgba(100,180,255,${0.12 + rainStrength * 0.42})`;
        ctx.lineWidth = Math.max(0.7, 0.8 + rainStrength * 0.5);
        const drops = Math.round(8 + rainStrength * 64);
        for (let i = 0; i < drops; i++) {
          const rx = (seeded(i, 321) * w + elapsed * (38 + (i % 7) * 8)) % w;
          const ry = (seeded(i, 322) * h * 0.62 + elapsed * (62 + (i % 5) * 10)) % (h * 0.7);
          const length = 4 + rainStrength * 8;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 1.5, ry + length);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 冬雪粒子也随季节调色值渐入渐出，而不是等到 season 字符串变更才出现。
      if (palette.snow > 0.005) {
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${0.2 + palette.snow * 0.65})`;
        const flakes = Math.round(8 + palette.snow * 40);
        for (let i = 0; i < flakes; i++) {
          const sx = (seeded(i, 200) * w + elapsed * (8 + (i % 5) * 2) + Math.sin(elapsed * 0.6 + i) * 5) % w;
          const sy = (seeded(i, 201) * h + elapsed * (20 + (i % 7)) * 8) % h;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
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
          tip: tooltipFor(c),
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
    const tip = hitTest(e.clientX, e.clientY);
    selectedRef.current = tip?.id ?? null;
    setTooltip(tip);
  };
  const onClick = (e: MouseEvent) => {
    const tip = hitTest(e.clientX, e.clientY);
    selectedRef.current = tip?.id ?? null;
    setTooltip(tip);
  };
  const onLeave = () => {
    selectedRef.current = null;
    setTooltip(null);
  };

  return (
    <div className="eco-scene-wrap" ref={wrapRef}>
      <canvas
        ref={ref}
        className="eco-scene-canvas"
        role="img"
        aria-label="阳光和流云下的黄石河谷，灰狼、美洲赤鹿与野兔穿过草丛，游鱼在水中摆尾"
        onMouseMove={onMove}
        onClick={onClick}
        onMouseLeave={onLeave}
      />
      {tooltip && (
        <div
          className="eco-tooltip"
          style={{
            left: `clamp(100px, ${tooltip.x}px, calc(100% - 100px))`,
            top: `clamp(90px, ${tooltip.y}px, calc(100% - 8px))`,
          }}
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
