/** GitHub Pages base-aware asset URL helper */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const clean = path.replace(/^\//, '');
  return `${base}${clean}`;
}

export const PLANET_EARTH = assetUrl('assets/planets/earth.png');
export const PLANET_EARTH_ALT = assetUrl('assets/planets/earth_alt.png');

export function pixelEarthFrame(n: number): string {
  const id = String(n).padStart(4, '0');
  return assetUrl(`assets/earth/${id}.png`);
}

export const PIXEL_EARTH_FRAME_COUNT = 20;

/** ScratchIO Animated Wild Animals — horizontal strips */
export const ANIMAL_SHEETS = {
  wolfWalk: { src: assetUrl('assets/animals/Wolf_Walk.png'), frameW: 64, frameH: 40, frames: 8 },
  wolfRun: { src: assetUrl('assets/animals/Wolf_Run.png'), frameW: 64, frameH: 40, frames: 6 },
  wolfHowl: { src: assetUrl('assets/animals/Wolf_Howl.png'), frameW: 64, frameH: 40, frames: 10 },
  rabbitIdle: { src: assetUrl('assets/animals/Rabbit_Idle.png'), frameW: 32, frameH: 26, frames: 10 },
  rabbitHop: { src: assetUrl('assets/animals/Rabbit_Hop.png'), frameW: 32, frameH: 26, frames: 10 },
  rabbitRun: { src: assetUrl('assets/animals/Rabbit_Run.png'), frameW: 32, frameH: 26, frames: 6 },
  deerIdle: { src: assetUrl('assets/animals/Deer_Idle.png'), frameW: 72, frameH: 52, frames: 10 },
  deerWalk: { src: assetUrl('assets/animals/Deer_Walk.png'), frameW: 72, frameH: 52, frames: 8 },
  deerRun: { src: assetUrl('assets/animals/Deer_Run.png'), frameW: 72, frameH: 52, frames: 6 },
} as const;

export type SheetMeta = (typeof ANIMAL_SHEETS)[keyof typeof ANIMAL_SHEETS];

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
  const fi = ((frameIndex % meta.frames) + meta.frames) % meta.frames;
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
