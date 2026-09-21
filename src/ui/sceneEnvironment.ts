export type SceneSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type SceneRgb = readonly [number, number, number];
export type SceneDayPhase = 'dawn' | 'morning' | 'noon' | 'evening' | 'night';
export type DayPhase = SceneDayPhase;

export interface SeasonPalette {
  skyTop: SceneRgb;
  skyBottom: SceneRgb;
  far: SceneRgb;
  near: SceneRgb;
  carpet: SceneRgb;
  carpetAlpha: number;
  tint: SceneRgb;
  tintAlpha: number;
  snow: number;
}

/**
 * Lighting values are deliberately independent from the season palette. This
 * keeps the existing four-season API stable while allowing a day clock to
 * ease the entire scene continuously through sunrise, noon, dusk and night.
 */
export interface DayPalette {
  skyTop: SceneRgb;
  skyBottom: SceneRgb;
  farLight: SceneRgb;
  nearLight: SceneRgb;
  cloud: SceneRgb;
  cloudAlpha: number;
  sun: SceneRgb;
  sunAlpha: number;
  moon: SceneRgb;
  moonAlpha: number;
  starAlpha: number;
  horizonGlow: SceneRgb;
  horizonGlowAlpha: number;
  ambientLight: number;
  shadow: number;
  warmth: number;
  sunElevation: number;
}

export interface SceneEnvironmentPalette extends SeasonPalette, DayPalette {}

export const SEASON_PALETTES: Readonly<Record<SceneSeason, SeasonPalette>> = {
  spring: {
    skyTop: [179, 229, 252], skyBottom: [232, 245, 233], far: [129, 199, 132], near: [174, 213, 129],
    carpet: [165, 214, 167], carpetAlpha: 0.18, tint: [172, 213, 190], tintAlpha: 0.05, snow: 0,
  },
  summer: {
    skyTop: [79, 195, 247], skyBottom: [255, 245, 157], far: [102, 187, 106], near: [156, 204, 101],
    carpet: [129, 199, 132], carpetAlpha: 0.2, tint: [255, 230, 145], tintAlpha: 0.025, snow: 0,
  },
  autumn: {
    // Lamar Valley autumn is generally cool and hazy with restrained gold in
    // the grass, rather than a saturated orange wash over the whole sky.
    skyTop: [168, 195, 207], skyBottom: [238, 226, 198], far: [145, 145, 142], near: [193, 181, 151],
    carpet: [205, 175, 111], carpetAlpha: 0.1, tint: [188, 151, 112], tintAlpha: 0.045, snow: 0,
  },
  winter: {
    skyTop: [144, 202, 249], skyBottom: [236, 239, 241], far: [144, 164, 174], near: [236, 239, 241],
    carpet: [255, 255, 255], carpetAlpha: 0.35, tint: [185, 205, 218], tintAlpha: 0.13, snow: 1,
  },
} as const;

export const SCENE_SEASONS: readonly SceneSeason[] = ['spring', 'summer', 'autumn', 'winter'];
export const SCENE_DAY_PHASES: readonly SceneDayPhase[] = ['dawn', 'morning', 'noon', 'evening', 'night'];
export const DAY_PHASES = SCENE_DAY_PHASES;
export const DAY_PHASE_LABELS: Readonly<Record<SceneDayPhase, string>> = {
  dawn: '清晨',
  morning: '上午',
  noon: '中午',
  evening: '傍晚',
  night: '夜间',
} as const;

const DAY_PALETTES: Readonly<Record<SceneDayPhase, DayPalette>> = {
  dawn: {
    skyTop: [93, 119, 163], skyBottom: [244, 182, 143], farLight: [139, 153, 165], nearLight: [183, 164, 133],
    cloud: [244, 222, 212], cloudAlpha: 0.76, sun: [255, 190, 112], sunAlpha: 0.84,
    moon: [201, 215, 231], moonAlpha: 0.32, starAlpha: 0.12, horizonGlow: [255, 190, 120], horizonGlowAlpha: 0.42,
    ambientLight: 0.74, shadow: 0.34, warmth: 0.72, sunElevation: 0.16,
  },
  morning: {
    skyTop: [93, 177, 224], skyBottom: [224, 239, 220], farLight: [151, 187, 175], nearLight: [183, 201, 143],
    cloud: [249, 246, 230], cloudAlpha: 0.82, sun: [255, 232, 166], sunAlpha: 0.9,
    moon: [201, 215, 231], moonAlpha: 0.06, starAlpha: 0, horizonGlow: [246, 221, 167], horizonGlowAlpha: 0.18,
    ambientLight: 0.9, shadow: 0.2, warmth: 0.42, sunElevation: 0.48,
  },
  noon: {
    skyTop: [79, 195, 247], skyBottom: [255, 245, 157], farLight: [168, 198, 178], nearLight: [190, 210, 133],
    cloud: [255, 252, 237], cloudAlpha: 0.88, sun: [255, 241, 180], sunAlpha: 0.98,
    moon: [201, 215, 231], moonAlpha: 0, starAlpha: 0, horizonGlow: [255, 239, 160], horizonGlowAlpha: 0.1,
    ambientLight: 1, shadow: 0.12, warmth: 0.28, sunElevation: 0.9,
  },
  evening: {
    skyTop: [97, 113, 161], skyBottom: [235, 142, 111], farLight: [125, 122, 137], nearLight: [174, 139, 112],
    cloud: [230, 196, 186], cloudAlpha: 0.7, sun: [255, 164, 88], sunAlpha: 0.75,
    moon: [216, 224, 235], moonAlpha: 0.18, starAlpha: 0.04, horizonGlow: [255, 151, 93], horizonGlowAlpha: 0.5,
    ambientLight: 0.68, shadow: 0.4, warmth: 0.84, sunElevation: 0.2,
  },
  night: {
    skyTop: [13, 25, 52], skyBottom: [44, 61, 83], farLight: [57, 71, 77], nearLight: [67, 82, 72],
    cloud: [117, 132, 149], cloudAlpha: 0.28, sun: [255, 176, 96], sunAlpha: 0,
    moon: [220, 231, 241], moonAlpha: 0.92, starAlpha: 0.78, horizonGlow: [89, 119, 150], horizonGlowAlpha: 0.16,
    ambientLight: 0.3, shadow: 0.68, warmth: 0.08, sunElevation: -0.32,
  },
} as const;

function mixNumber(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function mixRgb(a: SceneRgb, b: SceneRgb, amount: number): SceneRgb {
  return [
    mixNumber(a[0], b[0], amount),
    mixNumber(a[1], b[1], amount),
    mixNumber(a[2], b[2], amount),
  ];
}

function normalizeSeasonPosition(value: number) {
  return ((value % SCENE_SEASONS.length) + SCENE_SEASONS.length) % SCENE_SEASONS.length;
}

export function seasonPosition(season: SceneSeason) {
  return SCENE_SEASONS.indexOf(season);
}

export function dayPhasePosition(phase: SceneDayPhase) {
  return SCENE_DAY_PHASES.indexOf(phase);
}

export function dayPhaseAt(position: number): SceneDayPhase {
  return SCENE_DAY_PHASES[Math.floor(normalizeDayPosition(position))]!;
}

export function dayPhaseLabel(phase: SceneDayPhase) {
  return DAY_PHASE_LABELS[phase];
}

function normalizeDayPosition(value: number) {
  return ((value % SCENE_DAY_PHASES.length) + SCENE_DAY_PHASES.length) % SCENE_DAY_PHASES.length;
}

/** Move through the shortest path around the dawn-to-night cycle. */
export function advanceDayVisual(current: number, target: SceneDayPhase, delta: number, response = 2.2) {
  const targetPosition = dayPhasePosition(target);
  const currentPosition = normalizeDayPosition(current);
  let difference = targetPosition - currentPosition;
  if (difference > SCENE_DAY_PHASES.length / 2) difference -= SCENE_DAY_PHASES.length;
  if (difference < -SCENE_DAY_PHASES.length / 2) difference += SCENE_DAY_PHASES.length;
  return current + difference * (1 - Math.exp(-Math.max(0, delta) * response));
}

/** Move through the shortest path around the four-season cycle. */
export function advanceSeasonVisual(current: number, target: SceneSeason, delta: number, response = 2.8) {
  const targetPosition = seasonPosition(target);
  const currentPosition = normalizeSeasonPosition(current);
  let difference = targetPosition - currentPosition;
  if (difference > SCENE_SEASONS.length / 2) difference -= SCENE_SEASONS.length;
  if (difference < -SCENE_SEASONS.length / 2) difference += SCENE_SEASONS.length;
  return current + difference * (1 - Math.exp(-Math.max(0, delta) * response));
}

export function seasonPaletteAt(position: number): SeasonPalette {
  const normalized = normalizeSeasonPosition(position);
  const fromIndex = Math.floor(normalized);
  const amount = normalized - fromIndex;
  const from = SEASON_PALETTES[SCENE_SEASONS[fromIndex]!]!;
  const to = SEASON_PALETTES[SCENE_SEASONS[(fromIndex + 1) % SCENE_SEASONS.length]!]!;
  return {
    skyTop: mixRgb(from.skyTop, to.skyTop, amount),
    skyBottom: mixRgb(from.skyBottom, to.skyBottom, amount),
    far: mixRgb(from.far, to.far, amount),
    near: mixRgb(from.near, to.near, amount),
    carpet: mixRgb(from.carpet, to.carpet, amount),
    carpetAlpha: mixNumber(from.carpetAlpha, to.carpetAlpha, amount),
    tint: mixRgb(from.tint, to.tint, amount),
    tintAlpha: mixNumber(from.tintAlpha, to.tintAlpha, amount),
    snow: mixNumber(from.snow, to.snow, amount),
  };
}

export function dayPaletteAt(position: number): DayPalette {
  const normalized = normalizeDayPosition(position);
  const fromIndex = Math.floor(normalized);
  const amount = normalized - fromIndex;
  const from = DAY_PALETTES[SCENE_DAY_PHASES[fromIndex]!]!;
  const to = DAY_PALETTES[SCENE_DAY_PHASES[(fromIndex + 1) % SCENE_DAY_PHASES.length]!]!;
  return {
    skyTop: mixRgb(from.skyTop, to.skyTop, amount),
    skyBottom: mixRgb(from.skyBottom, to.skyBottom, amount),
    farLight: mixRgb(from.farLight, to.farLight, amount),
    nearLight: mixRgb(from.nearLight, to.nearLight, amount),
    cloud: mixRgb(from.cloud, to.cloud, amount),
    cloudAlpha: mixNumber(from.cloudAlpha, to.cloudAlpha, amount),
    sun: mixRgb(from.sun, to.sun, amount),
    sunAlpha: mixNumber(from.sunAlpha, to.sunAlpha, amount),
    moon: mixRgb(from.moon, to.moon, amount),
    moonAlpha: mixNumber(from.moonAlpha, to.moonAlpha, amount),
    starAlpha: mixNumber(from.starAlpha, to.starAlpha, amount),
    horizonGlow: mixRgb(from.horizonGlow, to.horizonGlow, amount),
    horizonGlowAlpha: mixNumber(from.horizonGlowAlpha, to.horizonGlowAlpha, amount),
    ambientLight: mixNumber(from.ambientLight, to.ambientLight, amount),
    shadow: mixNumber(from.shadow, to.shadow, amount),
    warmth: mixNumber(from.warmth, to.warmth, amount),
    sunElevation: mixNumber(from.sunElevation, to.sunElevation, amount),
  };
}

/**
 * Blend seasonal ground colours with the day lighting layer. The returned
 * object is useful to a renderer that wants one stable palette per frame.
 */
export function environmentPaletteAt(seasonPositionValue: number, dayPosition: number): SceneEnvironmentPalette {
  const season = seasonPaletteAt(seasonPositionValue);
  const day = dayPaletteAt(dayPosition);
  const dayMix = 0.58;
  const lightMix = 0.34;
  return {
    ...season,
    ...day,
    skyTop: mixRgb(season.skyTop, day.skyTop, dayMix),
    skyBottom: mixRgb(season.skyBottom, day.skyBottom, dayMix),
    far: mixRgb(season.far, day.farLight, lightMix),
    near: mixRgb(season.near, day.nearLight, lightMix),
    tint: mixRgb(season.tint, day.horizonGlow, Math.min(0.42, day.horizonGlowAlpha)),
    tintAlpha: Math.max(season.tintAlpha, day.horizonGlowAlpha * 0.22),
  };
}

/** Alias for callers that prefer the shorter scene-oriented name. */
export const scenePaletteAt = environmentPaletteAt;

export function approachVisual(current: number, target: number, delta: number, response = 4) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) * response));
}

export function rgba(rgb: SceneRgb, alpha = 1) {
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${Math.max(0, Math.min(1, alpha))})`;
}

/** Continuous scene motion, driven by the same pausable clock as the animals. */
export const CLOUDS = [
  { start: 0.22, y: 0.23, width: 0.17, speed: 0.0042, opacity: 0.88 },
  { start: 0.73, y: 0.17, width: 0.23, speed: 0.006, opacity: 0.98 },
  { start: 0.48, y: 0.09, width: 0.11, speed: 0.0027, opacity: 0.65 },
] as const;

export function cloudPosition(index: number, seconds: number) {
  const cloud = CLOUDS[index % CLOUDS.length]!;
  // Wrap only after the entire cloud has left the viewport.
  return ((cloud.start + seconds * cloud.speed + cloud.width / 2) % (1 + cloud.width)) - cloud.width / 2;
}

export function drawLivingSky(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, cloudImage?: HTMLImageElement, overcast: boolean | number = false) {
  const sunX = w * (0.565 + Math.sin(seconds * 0.003) * 0.035);
  const sunY = h * (0.175 - Math.sin(seconds * 0.002) * 0.02);
  const radius = w * 0.027;
  const overcastStrength = typeof overcast === 'number' ? Math.max(0, Math.min(1, overcast)) : overcast ? 1 : 0;
  ctx.save();
  ctx.globalAlpha = 1 - overcastStrength * 0.62;
  const halo = ctx.createRadialGradient(sunX, sunY, radius * 0.65, sunX, sunY, radius * 2.6);
  halo.addColorStop(0, 'rgba(255,232,160,0.42)');
  halo.addColorStop(1, 'rgba(255,239,192,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - radius * 2.6, sunY - radius * 2.6, radius * 5.2, radius * 5.2);
  const light = ctx.createLinearGradient(sunX, sunY - radius, sunX, sunY + radius);
  light.addColorStop(0, '#fff2bc');
  light.addColorStop(1, '#f1cb7a');
  ctx.fillStyle = light;
  ctx.strokeStyle = '#c4a16b';
  ctx.lineWidth = Math.max(0.6, w * 0.0012);
  ctx.beginPath();
  ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  CLOUDS.forEach((cloud, index) => {
    const x = cloudPosition(index, seconds) * w;
    const y = cloud.y * h + Math.sin(seconds * 0.12 + index) * h * 0.002;
    const width = cloud.width * w;
    ctx.save();
    ctx.globalAlpha = cloud.opacity * (1 - overcastStrength * 0.18);
    if (cloudImage) {
      const height = width * cloudImage.naturalHeight / cloudImage.naturalWidth;
      ctx.drawImage(cloudImage, x - width / 2, y - height / 2, width, height);
    } else {
      ctx.fillStyle = '#fff4da';
      ctx.beginPath();
      ctx.ellipse(x, y, width * 0.48, width * 0.13, 0, 0, Math.PI * 2);
      ctx.ellipse(x - width * 0.13, y - width * 0.08, width * 0.22, width * 0.16, 0, 0, Math.PI * 2);
      ctx.ellipse(x + width * 0.12, y - width * 0.1, width * 0.25, width * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  if (overcastStrength > 0.001) {
    ctx.fillStyle = `rgba(77,99,116,${overcastStrength * 0.12})`;
    ctx.fillRect(0, 0, w, h * 0.62);
  }
}

export interface FishRoute {
  x: number;
  y: number;
  rx: number;
  ry: number;
  phase: number;
  speed: number;
  size: number;
}

// Routes are checked against the loaded water alpha before being displayed.
// Decorative fish never feed back into the macro population equations.
export const FISH_ROUTES: readonly FishRoute[] = [
  { x: 0.765, y: 0.952, rx: 0.079, ry: 0.013, phase: 0.7, speed: 0.2, size: 0.029 },
  { x: 0.793, y: 0.972, rx: 0.073, ry: 0.008, phase: 1.2, speed: 0.21, size: 0.022 },
  { x: 0.707, y: 0.954, rx: 0.043, ry: 0.016, phase: 3.1, speed: 0.18, size: 0.025 },
  { x: 0.829, y: 0.925, rx: 0.034, ry: 0.015, phase: 2.2, speed: 0.23, size: 0.022 },
  { x: 0.741, y: 0.895, rx: 0.04, ry: 0.016, phase: 4.1, speed: 0.19, size: 0.019 },
];

export const FALLBACK_FISH_ROUTES: readonly FishRoute[] = [
  { x: 0.606, y: 0.9, rx: 0.035, ry: 0.045, phase: 0, speed: 0.22, size: 0.021 },
  { x: 0.64, y: 0.954, rx: 0.032, ry: 0.018, phase: 2, speed: 0.25, size: 0.017 },
];

export function fishPosition(route: FishRoute, seconds: number) {
  const phase = seconds * route.speed + route.phase;
  return {
    x: route.x + Math.cos(phase) * route.rx,
    y: route.y + Math.sin(phase) * route.ry,
    dx: -Math.sin(phase) * route.rx,
    dy: Math.cos(phase) * route.ry,
  };
}

/** Find loops wholly inside water, including a margin for the body and tail. */
export function fitFishRoutes(isWater: (x: number, y: number) => boolean): FishRoute[] {
  return FISH_ROUTES.flatMap((route) => {
    for (const shrink of [1, 0.75, 0.5, 0.25]) {
      const fitted = { ...route, rx: route.rx * shrink, ry: route.ry * shrink };
      const margin = route.size * 0.65;
      let valid = true;
      for (let sample = 0; sample < 96 && valid; sample++) {
        const p = fishPosition(fitted, sample / 96 * Math.PI * 2 / route.speed);
        for (const [mx, my] of [[0, 0], [-margin, 0], [margin, 0], [0, -margin * 16 / 9], [0, margin * 16 / 9]]) {
          if (!isWater(p.x + mx!, p.y + my!)) { valid = false; break; }
        }
      }
      if (valid) return [fitted];
    }
    return [];
  });
}

export function drawFish(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, routes: readonly FishRoute[]) {
  routes.forEach((route, index) => {
    const position = fishPosition(route, seconds);
    const length = route.size * w;
    const tail = Math.sin(seconds * (8 + index * 0.5) + route.phase) * length * 0.12;
    ctx.save();
    ctx.translate(position.x * w, position.y * h);
    ctx.rotate(Math.atan2(position.dy * h, position.dx * w));
    // A shadow, muted colour and a lighter dorsal line keep fish below the water.
    ctx.fillStyle = 'rgba(40,86,84,0.12)';
    ctx.beginPath();
    ctx.ellipse(1, length * 0.14, length * 0.46, length * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = index % 3 === 0 ? '#aa956b' : '#57796b';
    ctx.strokeStyle = '#3f7069';
    ctx.lineWidth = Math.max(0.45, length * 0.024);
    ctx.beginPath();
    ctx.moveTo(length * 0.5, 0);
    ctx.bezierCurveTo(length * 0.16, -length * 0.2, -length * 0.2, -length * 0.13 + tail * 0.3, -length * 0.34, tail * 0.5);
    ctx.lineTo(-length * 0.6, tail - length * 0.16);
    ctx.quadraticCurveTo(-length * 0.52, tail, -length * 0.6, tail + length * 0.16);
    ctx.lineTo(-length * 0.34, tail * 0.5);
    ctx.bezierCurveTo(-length * 0.12, length * 0.13 + tail * 0.3, length * 0.2, length * 0.18, length * 0.5, 0);
    ctx.fill();
    ctx.stroke();
    // Translucent pectoral fins open and close slightly with each tail stroke.
    ctx.fillStyle = '#b1ad7e';
    ctx.beginPath();
    ctx.moveTo(length * 0.08, length * 0.08);
    ctx.lineTo(-length * 0.06, length * (0.27 + Math.sin(seconds * 5 + index) * 0.03));
    ctx.lineTo(-length * 0.14, length * 0.08);
    ctx.fill();
    ctx.fillStyle = '#41695e';
    for (let spot = 0; spot < 3; spot++) {
      ctx.beginPath();
      ctx.arc(length * (0.15 - spot * 0.12), -length * 0.055, length * 0.019, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#ded1a1';
    ctx.lineWidth = Math.max(0.5, length * 0.035);
    ctx.beginPath();
    ctx.moveTo(length * 0.3, -length * 0.025);
    ctx.quadraticCurveTo(0, -length * 0.065, -length * 0.25, tail * 0.35);
    ctx.stroke();
    ctx.fillStyle = '#30544e';
    ctx.beginPath();
    ctx.arc(length * 0.32, -length * 0.035, Math.max(0.4, length * 0.024), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
