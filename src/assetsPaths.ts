/** GitHub Pages base-aware asset URL helper */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const clean = path.replace(/^\//, '');
  return `${base}${clean}`;
}

export const PLANET_EARTH = assetUrl('assets/planets/earth.png');
export const PLANET_EARTH_ALT = assetUrl('assets/planets/earth_alt.png');

/**
 * Artwork metadata used by the generated Yellowstone pack.  The pack is
 * optional at runtime: all consumers keep their original fallback assets.
 */
export interface SpriteAnchor {
  x: number;
  y: number;
}

export interface SheetMeta {
  src: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps?: number;
  loop?: boolean;
  anchor?: SpriteAnchor;
  facing?: 'left' | 'right';
}

export type EcosystemAnimal = 'wolf' | 'elk' | 'rabbit';
export type EcosystemAction = 'idle' | 'walk' | 'run' | 'howl' | 'graze' | 'hop' | 'alert';

export interface EarthAtlasMeta {
  atlas: string;
  frames: number;
  columns: number;
  rows: number;
  frameW: number;
  frameH: number;
  fps?: number;
}

export type SceneLayerKey =
  | 'sky'
  | 'mountains'
  | 'meadow'
  | 'forestBack'
  | 'river'
  | 'foreground';

export interface SceneLayerMeta {
  src: string;
  alpha: boolean;
}

export interface ScenePropMeta {
  src: string;
  width: number;
  height: number;
}

export interface EcosystemManifest {
  version: string;
  earth?: EarthAtlasMeta;
  animals: Partial<Record<EcosystemAnimal, Partial<Record<EcosystemAction, SheetMeta>>>>;
  scene?: {
    width: number;
    height: number;
    layers: Partial<Record<SceneLayerKey, SceneLayerMeta>>;
    waterMask?: string;
  };
  props?: Record<string, ScenePropMeta>;
}

export const ECOSYSTEM_MANIFEST = assetUrl('assets/ecosystem-v1/manifest.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function manifestAssetUrl(src: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(src) || src.startsWith('/')) return src;
  if (src.startsWith('assets/')) return assetUrl(src);
  return assetUrl(`assets/ecosystem-v1/${src.replace(/^\/+/, '')}`);
}

function parseSheetMeta(value: unknown): SheetMeta | null {
  if (!isRecord(value) || typeof value.src !== 'string' || value.src.length === 0) return null;
  return {
    src: manifestAssetUrl(value.src),
    frameW: positiveNumber(value.frameW, 1),
    frameH: positiveNumber(value.frameH, 1),
    frames: Math.max(1, Math.floor(positiveNumber(value.frames, 1))),
    fps: positiveNumber(value.fps, 8),
    loop: value.loop !== false,
    anchor:
      isRecord(value.anchor) && typeof value.anchor.x === 'number' && typeof value.anchor.y === 'number'
        ? { x: value.anchor.x, y: value.anchor.y }
        : undefined,
    facing: value.facing === 'left' ? 'left' : value.facing === 'right' ? 'right' : undefined,
  };
}

function parseManifest(raw: unknown): EcosystemManifest | null {
  if (!isRecord(raw) || typeof raw.version !== 'string') return null;

  const animals: EcosystemManifest['animals'] = {};
  for (const animal of ['wolf', 'elk', 'rabbit'] as const) {
    const source = isRecord(raw.animals) && isRecord(raw.animals[animal]) ? raw.animals[animal] : {};
    const parsed: Partial<Record<EcosystemAction, SheetMeta>> = {};
    for (const action of ['idle', 'walk', 'run', 'howl', 'graze', 'hop', 'alert'] as const) {
      const sheet = parseSheetMeta(source[action]);
      if (sheet) parsed[action] = sheet;
    }
    animals[animal] = parsed;
  }

  let earth: EarthAtlasMeta | undefined;
  if (isRecord(raw.earth) && typeof raw.earth.atlas === 'string') {
    earth = {
      atlas: manifestAssetUrl(raw.earth.atlas),
      frames: Math.max(1, Math.floor(positiveNumber(raw.earth.frames, 1))),
      columns: Math.max(1, Math.floor(positiveNumber(raw.earth.columns, 1))),
      rows: Math.max(1, Math.floor(positiveNumber(raw.earth.rows, 1))),
      frameW: positiveNumber(raw.earth.frameW, 1),
      frameH: positiveNumber(raw.earth.frameH, 1),
      fps: positiveNumber(raw.earth.fps, 8),
    };
  }

  let scene: EcosystemManifest['scene'];
  if (isRecord(raw.scene)) {
    const layers: Partial<Record<SceneLayerKey, SceneLayerMeta>> = {};
    for (const key of ['sky', 'mountains', 'meadow', 'forestBack', 'river', 'foreground'] as const) {
      const layer = isRecord(raw.scene.layers) && isRecord(raw.scene.layers[key]) ? raw.scene.layers[key] : null;
      if (layer && typeof layer.src === 'string') {
        layers[key] = { src: manifestAssetUrl(layer.src), alpha: layer.alpha !== false };
      }
    }
    scene = {
      width: positiveNumber(raw.scene.width, 2048),
      height: positiveNumber(raw.scene.height, 1152),
      layers,
      waterMask: typeof raw.scene.waterMask === 'string' ? manifestAssetUrl(raw.scene.waterMask) : undefined,
    };
  }

  const props: EcosystemManifest['props'] = {};
  if (isRecord(raw.props)) {
    for (const [id, value] of Object.entries(raw.props)) {
      if (isRecord(value) && typeof value.src === 'string') {
        props[id] = {
          src: manifestAssetUrl(value.src),
          width: positiveNumber(value.width, 64),
          height: positiveNumber(value.height, 64),
        };
      }
    }
  }

  return { version: raw.version, earth, animals, scene, props };
}

let ecosystemManifestPromise: Promise<EcosystemManifest | null> | null = null;

/** Load and validate the generated pack once. A missing pack is a normal fallback case. */
export function loadEcosystemManifest(): Promise<EcosystemManifest | null> {
  if (ecosystemManifestPromise) return ecosystemManifestPromise;
  ecosystemManifestPromise = fetch(ECOSYSTEM_MANIFEST)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${ECOSYSTEM_MANIFEST}`);
      return response.json() as Promise<unknown>;
    })
    .then(parseManifest)
    .catch(() => null);
  return ecosystemManifestPromise;
}

export function pixelEarthFrame(n: number): string {
  const id = String(n).padStart(4, '0');
  return assetUrl(`assets/earth/${id}.png`);
}

export const PIXEL_EARTH_FRAME_COUNT = 20;

/** ScratchIO Animated Wild Animals — horizontal strips */
export const ANIMAL_SHEETS = {
  // Aliases keep the old ScratchIO assets usable until the generated pack is available.
  wolfIdle: { src: assetUrl('assets/animals/Wolf_Walk.png'), frameW: 64, frameH: 40, frames: 8 },
  wolfWalk: { src: assetUrl('assets/animals/Wolf_Walk.png'), frameW: 64, frameH: 40, frames: 8 },
  wolfRun: { src: assetUrl('assets/animals/Wolf_Run.png'), frameW: 64, frameH: 40, frames: 6 },
  wolfHowl: { src: assetUrl('assets/animals/Wolf_Howl.png'), frameW: 64, frameH: 40, frames: 10 },
  rabbitIdle: { src: assetUrl('assets/animals/Rabbit_Idle.png'), frameW: 32, frameH: 26, frames: 10 },
  rabbitHop: { src: assetUrl('assets/animals/Rabbit_Hop.png'), frameW: 32, frameH: 26, frames: 10 },
  rabbitRun: { src: assetUrl('assets/animals/Rabbit_Run.png'), frameW: 32, frameH: 26, frames: 6 },
  rabbitAlert: { src: assetUrl('assets/animals/Rabbit_Hop.png'), frameW: 32, frameH: 26, frames: 10 },
  elkIdle: { src: assetUrl('assets/animals/Deer_Idle.png'), frameW: 72, frameH: 52, frames: 10 },
  elkWalk: { src: assetUrl('assets/animals/Deer_Walk.png'), frameW: 72, frameH: 52, frames: 8 },
  elkRun: { src: assetUrl('assets/animals/Deer_Run.png'), frameW: 72, frameH: 52, frames: 6 },
  elkGraze: { src: assetUrl('assets/animals/Deer_Idle.png'), frameW: 72, frameH: 52, frames: 10 },
  deerIdle: { src: assetUrl('assets/animals/Deer_Idle.png'), frameW: 72, frameH: 52, frames: 10 },
  deerWalk: { src: assetUrl('assets/animals/Deer_Walk.png'), frameW: 72, frameH: 52, frames: 8 },
  deerRun: { src: assetUrl('assets/animals/Deer_Run.png'), frameW: 72, frameH: 52, frames: 6 },
} as const;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export function drawSheetFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  meta: SheetMeta,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX = false,
) {
  const total = Math.max(1, Math.floor(meta.frames));
  const fi = ((Math.floor(frameIndex) % total) + total) % total;
  const dw = meta.frameW * scale;
  const dh = meta.frameH * scale;
  ctx.save();
  if (flipX) {
    ctx.translate(x + dw, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, x, y, dw, dh);
  }
  ctx.restore();
}

/** Draw a horizontal sheet using the manifest's normalized anchor. */
export function drawSheetFrameAnchored(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  meta: SheetMeta,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX = false,
) {
  const anchor = meta.anchor;
  if (!anchor) {
    drawSheetFrame(ctx, img, meta, frameIndex, x, y, scale, flipX);
    return;
  }
  const dw = meta.frameW * scale;
  const dh = meta.frameH * scale;
  const visibleAnchorX = flipX ? 1 - anchor.x : anchor.x;
  drawSheetFrame(ctx, img, meta, frameIndex, x - dw * visibleAnchorX, y - dh * anchor.y, scale, flipX);
}

/** Draw a frame from the generated 8×6 earth atlas without rotating its plane. */
export function drawEarthAtlasFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  meta: EarthAtlasMeta,
  frameIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const total = Math.max(1, Math.min(meta.frames, meta.columns * meta.rows));
  const fi = ((Math.floor(frameIndex) % total) + total) % total;
  const col = fi % meta.columns;
  const row = Math.floor(fi / meta.columns);
  ctx.drawImage(
    img,
    col * meta.frameW,
    row * meta.frameH,
    meta.frameW,
    meta.frameH,
    x,
    y,
    width,
    height,
  );
}

/** Kenney foliage — curated sprites under public/assets/plants/ */
const GRASS_FILES = [
  'sprite_0001.png',
  'sprite_0002.png',
  'sprite_0003.png',
  'sprite_0004.png',
  'sprite_0005.png',
  'sprite_0006.png',
  'sprite_0007.png',
  'sprite_0008.png',
  'sprite_0024.png',
  'sprite_0026.png',
  'foliagePack_leaves_001.png',
  'foliagePack_leaves_005.png',
  'foliagePack_leaves_009.png',
  'foliagePack_leaves_013.png',
] as const;

const SHRUB_FILES = [
  'sprite_0009.png',
  'sprite_0010.png',
  'sprite_0011.png',
  'sprite_0012.png',
  'sprite_0013.png',
  'sprite_0014.png',
  'sprite_0015.png',
  'sprite_0016.png',
  'sprite_0017.png',
  'sprite_0018.png',
  'foliagePack_013.png',
  'foliagePack_014.png',
  'foliagePack_015.png',
  'foliagePack_016.png',
] as const;

const TREE_FILES = [
  'foliagePack_004.png',
  'foliagePack_005.png',
  'foliagePack_006.png',
  'foliagePack_007.png',
  'foliagePack_008.png',
  'foliagePack_009.png',
  'foliagePack_010.png',
  'foliagePack_011.png',
  'foliagePack_012.png',
  'foliagePack_027.png',
  'foliagePack_028.png',
  'foliagePack_029.png',
  'foliagePack_030.png',
  'foliagePack_040.png',
  'foliagePack_041.png',
  'foliagePack_042.png',
] as const;

export function plantGrassUrl(file: string): string {
  return assetUrl(`assets/plants/grass/${file}`);
}

export function plantShrubUrl(file: string): string {
  return assetUrl(`assets/plants/shrubs/${file}`);
}

export function plantTreeUrl(file: string): string {
  return assetUrl(`assets/plants/trees/${file}`);
}

export const PLANT_GRASS_URLS = GRASS_FILES.map(plantGrassUrl);
export const PLANT_SHRUB_URLS = SHRUB_FILES.map(plantShrubUrl);
export const PLANT_TREE_URLS = TREE_FILES.map(plantTreeUrl);

/** Species panel thumbnails */
export const PLANT_THUMBS = {
  grass: plantGrassUrl('sprite_0003.png'),
  shrubs: plantShrubUrl('sprite_0011.png'),
} as const;

export async function loadPlantImages(): Promise<{
  grass: HTMLImageElement[];
  shrubs: HTMLImageElement[];
  trees: HTMLImageElement[];
}> {
  const loadAll = (urls: string[]) =>
    Promise.all(
      urls.map(async (src) => {
        try {
          return await loadImage(src);
        } catch {
          return null;
        }
      }),
    ).then((arr) => arr.filter((img): img is HTMLImageElement => img != null));

  const [grass, shrubs, trees] = await Promise.all([
    loadAll(PLANT_GRASS_URLS),
    loadAll(PLANT_SHRUB_URLS),
    loadAll(PLANT_TREE_URLS),
  ]);
  return { grass, shrubs, trees };
}
