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

export function drawLivingSky(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, cloudImage?: HTMLImageElement, overcast = false) {
  const sunX = w * (0.565 + Math.sin(seconds * 0.003) * 0.035);
  const sunY = h * (0.175 - Math.sin(seconds * 0.002) * 0.02);
  const radius = w * 0.027;
  ctx.save();
  ctx.globalAlpha = overcast ? 0.4 : 1;
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
    ctx.globalAlpha = cloud.opacity;
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
