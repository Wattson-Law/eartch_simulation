export interface SpaceStar {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
  readonly phase: number;
  readonly twinkle: number;
  readonly tone: number;
}

export interface SpaceStarLayer {
  readonly drift: number;
  readonly parallax: number;
  readonly stars: readonly SpaceStar[];
}

function fractional(value: number) {
  return value - Math.floor(value);
}

function seeded(seed: number) {
  return fractional(Math.sin(seed * 91.733 + 17.17) * 43758.5453);
}

function createStars(count: number, seed: number, minRadius: number, maxRadius: number): SpaceStar[] {
  return Array.from({ length: count }, (_, index) => {
    const key = seed + index * 5.37;
    return {
      x: seeded(key),
      y: seeded(key + 1.71),
      radius: minRadius + seeded(key + 2.93) * (maxRadius - minRadius),
      alpha: 0.42 + seeded(key + 4.19) * 0.5,
      phase: seeded(key + 5.43) * Math.PI * 2,
      twinkle: 0.55 + seeded(key + 6.77) * 1.25,
      tone: seeded(key + 8.11),
    };
  });
}

export const SPACE_STAR_LAYERS: readonly SpaceStarLayer[] = [
  { drift: 0.00016, parallax: 0.004, stars: createStars(72, 11, 0.35, 0.75) },
  { drift: 0.00032, parallax: 0.009, stars: createStars(42, 109, 0.55, 1.15) },
  { drift: 0.00058, parallax: 0.016, stars: createStars(18, 313, 0.9, 1.75) },
] as const;

export const SPACE_STAR_COUNT = SPACE_STAR_LAYERS.reduce((total, layer) => total + layer.stars.length, 0);

export function spaceStarPosition(star: SpaceStar, layer: SpaceStarLayer, time: number, longitude: number) {
  return {
    x: fractional(star.x + time * layer.drift - longitude * layer.parallax),
    y: fractional(star.y + Math.sin(time * 0.035 + star.phase) * layer.drift * 5),
  };
}

/** Illustrated deep-space layers for the 2D globe entrance. */
export function drawSpaceBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  longitude: number,
) {
  ctx.save();
  const base = ctx.createRadialGradient(width * 0.48, height * 0.42, 0, width * 0.48, height * 0.42, Math.max(width, height) * 0.78);
  base.addColorStop(0, '#182b48');
  base.addColorStop(0.56, '#0c1930');
  base.addColorStop(1, '#050a16');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const nebulae = [
    { x: 0.08, y: 0.3, radius: 0.48, color: 'rgba(43, 132, 139, 0.20)' },
    { x: 0.88, y: 0.18, radius: 0.42, color: 'rgba(104, 73, 139, 0.18)' },
    { x: 0.7, y: 0.88, radius: 0.52, color: 'rgba(37, 82, 136, 0.22)' },
  ];
  for (const nebula of nebulae) {
    const radius = Math.max(width, height) * nebula.radius;
    const gradient = ctx.createRadialGradient(width * nebula.x, height * nebula.y, 0, width * nebula.x, height * nebula.y, radius);
    gradient.addColorStop(0, nebula.color);
    gradient.addColorStop(1, 'rgba(4, 9, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.translate(width * 0.52, height * 0.47);
  ctx.rotate(-0.24);
  const band = ctx.createLinearGradient(0, -height * 0.48, 0, height * 0.48);
  band.addColorStop(0, 'rgba(141, 167, 195, 0)');
  band.addColorStop(0.32, 'rgba(141, 167, 195, 0.045)');
  band.addColorStop(0.5, 'rgba(190, 205, 213, 0.13)');
  band.addColorStop(0.68, 'rgba(112, 165, 175, 0.055)');
  band.addColorStop(1, 'rgba(112, 165, 175, 0)');
  ctx.fillStyle = band;
  ctx.fillRect(-width, -height * 0.52, width * 2, height * 1.04);
  ctx.restore();

  for (const layer of SPACE_STAR_LAYERS) {
    for (const star of layer.stars) {
      const position = spaceStarPosition(star, layer, time, longitude);
      const x = position.x * width;
      const y = position.y * height;
      const alpha = star.alpha * (0.78 + Math.sin(time * star.twinkle + star.phase) * 0.22);
      ctx.fillStyle = star.tone > 0.72
        ? `rgba(255, 226, 169, ${alpha})`
        : star.tone < 0.16
          ? `rgba(171, 220, 235, ${alpha})`
          : `rgba(242, 242, 224, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fill();
      if (star.radius > 1.45) {
        ctx.strokeStyle = `rgba(243, 240, 211, ${alpha * 0.48})`;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(x - star.radius * 2.2, y);
        ctx.lineTo(x + star.radius * 2.2, y);
        ctx.moveTo(x, y - star.radius * 2.2);
        ctx.lineTo(x, y + star.radius * 2.2);
        ctx.stroke();
      }
    }
  }

  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, 'rgba(2, 6, 16, 0)');
  vignette.addColorStop(1, 'rgba(2, 5, 14, 0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
