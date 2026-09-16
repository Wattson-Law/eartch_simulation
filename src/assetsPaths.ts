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
