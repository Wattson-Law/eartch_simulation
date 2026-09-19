export const TAU = Math.PI * 2;

export const YELLOWSTONE = {
  longitude: (-110.5885 * Math.PI) / 180,
  latitude: (44.6 * Math.PI) / 180,
} as const;

export const VIEW_LATITUDE = (20 * Math.PI) / 180;

export interface ProjectedLocation {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export interface GlobeLookup {
  readonly size: number;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly longitudeOffset: Float32Array;
  readonly latitude: Float32Array;
  readonly textureRow: Float32Array;
  readonly textureY0: Uint32Array;
  readonly textureY1: Uint32Array;
  readonly textureTY: Float32Array;
  readonly shade: Float32Array;
  readonly edgeAlpha: Uint8ClampedArray;
  readonly visible: Uint8Array;
}

export function wrapAngle(angle: number): number {
  const wrapped = ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return wrapped === Math.PI ? -Math.PI : wrapped;
}

export function projectLocation(
  longitude: number,
  latitude: number,
  centerLongitude: number,
  viewLatitude = VIEW_LATITUDE,
): ProjectedLocation {
  const deltaLongitude = wrapAngle(longitude - centerLongitude);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinViewLatitude = Math.sin(viewLatitude);
  const cosViewLatitude = Math.cos(viewLatitude);
  const cosDeltaLongitude = Math.cos(deltaLongitude);

  const x = cosLatitude * Math.sin(deltaLongitude);
  const y = cosLatitude * sinViewLatitude * cosDeltaLongitude - sinLatitude * cosViewLatitude;
  const z = sinLatitude * sinViewLatitude + cosLatitude * cosViewLatitude * cosDeltaLongitude;

  return { x, y, z, visible: z >= 0 };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function createGlobeLookup(
  size: number,
  textureWidth: number,
  textureHeight: number,
  viewLatitude = VIEW_LATITUDE,
): GlobeLookup {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('Globe lookup size must be an integer >= 2');
  if (!Number.isInteger(textureWidth) || textureWidth < 2 || !Number.isInteger(textureHeight) || textureHeight < 2) {
    throw new RangeError('Texture dimensions must be integers >= 2');
  }
  const count = size * size;
  const longitudeOffset = new Float32Array(count);
  const latitude = new Float32Array(count);
  const textureRow = new Float32Array(count);
  const textureY0 = new Uint32Array(count);
  const textureY1 = new Uint32Array(count);
  const textureTY = new Float32Array(count);
  const shade = new Float32Array(count);
  const edgeAlpha = new Uint8ClampedArray(count);
  const visible = new Uint8Array(count);
  const center = (size - 1) / 2;
  const radius = size / 2;
  const sinViewLatitude = Math.sin(viewLatitude);
  const cosViewLatitude = Math.cos(viewLatitude);
  const lightX = -0.42;
  const lightY = -0.52;
  const lightZ = 0.74;

  for (let py = 0; py < size; py++) {
    const screenY = (py - center) / radius;
    for (let px = 0; px < size; px++) {
      const index = py * size + px;
      const screenX = (px - center) / radius;
      const distance = Math.hypot(screenX, screenY);
      const coverage = 1 - smoothstep(0.985, 1.015, distance);
      edgeAlpha[index] = Math.round(coverage * 255);
      if (coverage <= 0) continue;

      const z = Math.sqrt(Math.max(0, 1 - screenX * screenX - screenY * screenY));
      const worldX = screenY * sinViewLatitude + z * cosViewLatitude;
      const worldY = screenX;
      const worldZ = -screenY * cosViewLatitude + z * sinViewLatitude;
      longitudeOffset[index] = Math.atan2(worldY, worldX);
      latitude[index] = Math.asin(Math.max(-1, Math.min(1, worldZ)));
      textureRow[index] = (Math.PI / 2 - latitude[index]) / Math.PI * (textureHeight - 1);
      textureY0[index] = Math.floor(textureRow[index]);
      textureY1[index] = Math.min(textureHeight - 1, textureY0[index] + 1);
      textureTY[index] = textureRow[index] - textureY0[index];
      visible[index] = 1;

      const illumination = Math.max(0, screenX * lightX + screenY * lightY + z * lightZ);
      shade[index] = 0.86 + illumination * 0.14;
    }
  }

  return {
    size,
    textureWidth,
    textureHeight,
    longitudeOffset,
    latitude,
    textureRow,
    textureY0,
    textureY1,
    textureTY,
    shade,
    edgeAlpha,
    visible,
  };
}

export function renderGlobeTexture(
  target: Uint8ClampedArray,
  texture: Uint8ClampedArray,
  lookup: GlobeLookup,
  centerLongitude: number,
): void {
  const size = lookup.size;
  const pixelCount = size * size;
  if (target.length < pixelCount * 4) throw new RangeError('Target buffer is smaller than the lookup');
  if (texture.length === 0 || texture.length % 4 !== 0) throw new RangeError('Texture must be RGBA data');
  const textureWidth = lookup.textureWidth;
  const textureHeight = lookup.textureHeight;
  if (textureWidth * textureHeight * 4 !== texture.length) throw new RangeError('Texture dimensions disagree with the lookup');
  const textureStride = textureWidth * 4;
  const wrappedCenterLongitude = wrapAngle(centerLongitude);

  for (let index = 0; index < pixelCount; index++) {
    const output = index * 4;
    const alpha = lookup.edgeAlpha[index];
    if (!lookup.visible[index] || alpha === 0) {
      target[output] = 0;
      target[output + 1] = 0;
      target[output + 2] = 0;
      target[output + 3] = 0;
      continue;
    }

    const longitude = wrappedCenterLongitude + lookup.longitudeOffset[index];
    const u = ((longitude + Math.PI) / TAU) * textureWidth - 0.5;
    const wrappedU = ((u % textureWidth) + textureWidth) % textureWidth;
    const x0 = Math.floor(wrappedU);
    const x1 = (x0 + 1) % textureWidth;
    const tx = wrappedU - x0;
    const tx1 = 1 - tx;
    const y0 = lookup.textureY0[index];
    const y1 = lookup.textureY1[index];
    const ty = lookup.textureTY[index];
    const ty1 = 1 - ty;
    const topLeft = y0 * textureStride + x0 * 4;
    const topRight = y0 * textureStride + x1 * 4;
    const bottomLeft = y1 * textureStride + x0 * 4;
    const bottomRight = y1 * textureStride + x1 * 4;
    const shade = lookup.shade[index];
    const red = (texture[topLeft] * tx1 + texture[topRight] * tx) * ty1 + (texture[bottomLeft] * tx1 + texture[bottomRight] * tx) * ty;
    const green =
      (texture[topLeft + 1] * tx1 + texture[topRight + 1] * tx) * ty1 +
      (texture[bottomLeft + 1] * tx1 + texture[bottomRight + 1] * tx) * ty;
    const blue =
      (texture[topLeft + 2] * tx1 + texture[topRight + 2] * tx) * ty1 +
      (texture[bottomLeft + 2] * tx1 + texture[bottomRight + 2] * tx) * ty;
    const sourceAlpha =
      (texture[topLeft + 3] * tx1 + texture[topRight + 3] * tx) * ty1 +
      (texture[bottomLeft + 3] * tx1 + texture[bottomRight + 3] * tx) * ty;
    target[output] = Math.round(red * shade);
    target[output + 1] = Math.round(green * shade);
    target[output + 2] = Math.round(blue * shade);
    target[output + 3] = Math.round(sourceAlpha * (alpha / 255));
  }
}
