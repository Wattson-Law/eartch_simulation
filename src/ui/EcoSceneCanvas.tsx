import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { EcosystemState } from '../sim/types';
import { createVisualSlice, stepVisualSlice } from '../sim/visualSlice';
import {
  WILDLIFE_COVER_PATCHES,
  WILDLIFE_ACTIVITY_LABELS,
  WILDLIFE_LABELS,
  isRiverWater,
  riverProfileAt,
  riverBankVariation,
  riverBankCove,
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
  type ScenePropMeta,
  type SceneLayerKey,
} from '../assetsPaths';
import {
  CLOUDS,
  cloudPosition,
  fishPosition,
  drawFish as drawSceneFish,
  advanceSeasonVisual,
  advanceDayVisual,
  approachVisual,
  rgba,
  dayPaletteAt,
  dayPhaseAt,
  dayPhaseLabel,
  dayPhasePosition,
  environmentPaletteAt,
  seasonPosition,
  type SceneDayPhase,
  type FishRoute,
  type SeasonPalette,
} from './sceneEnvironment';

interface Props {
  state: EcosystemState;
  onObservation: (observation: WildlifeObservation) => void;
  onStatus?: (statuses: WildlifeStatus[]) => void;
  onDayPhase?: (phase: SceneDayPhase) => void;
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
  sitBlend: number;
  caughtBlend: number;
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
const WORLD_WIDTH_FACTOR = 2.4;
// Keep the representatives readable at the viewport size while preserving
// the distance cue from the valley artwork. The previous sizes made the
// foreground elk and wolf dominate the landscape when the camera reached the
// right side of the panorama.
const FRAME_HEIGHT = { rabbit: 38, deer: 96, wolf: 72 } as const;

const PANORAMA_FISH_ROUTES: readonly FishRoute[] = [
  // These routes follow the shared full-world river profile instead of the
  // source panel's mirrored exits, keeping the fish inside the water on every
  // camera segment.
  { x: 0.25, y: 0.84, rx: 0.022, ry: 0.009, phase: 0.3, speed: 0.2, size: 0.009 },
  { x: 0.31, y: 0.78, rx: 0.024, ry: 0.008, phase: 2.1, speed: 0.23, size: 0.008 },
  { x: 0.4, y: 0.70, rx: 0.022, ry: 0.007, phase: 4.2, speed: 0.19, size: 0.009 },
  { x: 0.61, y: 0.69, rx: 0.022, ry: 0.007, phase: 1.4, speed: 0.24, size: 0.008 },
  { x: 0.7, y: 0.71, rx: 0.024, ry: 0.008, phase: 3.5, speed: 0.2, size: 0.009 },
  { x: 0.76, y: 0.72, rx: 0.022, ry: 0.009, phase: 5.1, speed: 0.22, size: 0.008 },
] as const;

/**
 * The generated art pack is a 2048×1152 scene panel. Mirroring two panels
 * gives the camera a 2.4-viewport Lamar Valley without stretching the trees or
 * flattening the river's perspective. The join is at the river's foreground
 * exit, so it reads as one continuous bend while the camera pans.
 */
function drawMirroredPanoramaLayer(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  worldW: number,
  h: number,
  alpha = 1,
  maxY = h,
) {
  if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;
  const panelW = worldW / 2;
  // The source art is a single panel whose river exits at the right edge.
  // Mirroring it at the edge preserves the exit direction, but the edge
  // pixels still need a broad crossfade so the mountain and bank contours
  // do not form a vertical cut at the join.
  const seamOverlap = Math.min(panelW * 0.085, 76);
  const drawMirroredPanel = () => {
    ctx.save();
    ctx.translate(worldW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, panelW, h);
    ctx.restore();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, worldW, maxY);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, panelW, h);
  // The mirrored panel shares a river exit with the first panel. A short
  // feather at the join hides a one-pixel bank/grass discontinuity without
  // blurring the rest of the landscape or stretching the source art.
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelW + seamOverlap, 0, panelW, maxY);
  ctx.clip();
  drawMirroredPanel();
  ctx.restore();
  const strips = 16;
  for (let i = 0; i < strips; i++) {
    const left = panelW - seamOverlap + (i * seamOverlap * 2) / strips;
    const width = (seamOverlap * 2) / strips + 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, width, maxY);
    ctx.clip();
    const progress = (i + 1) / strips;
    ctx.globalAlpha = alpha * smoothstep(progress);
    drawMirroredPanel();
    ctx.restore();
  }
  ctx.restore();
  return true;
}

function traceRiverRibbon(ctx: CanvasRenderingContext2D, w: number, h: number, widthScale = 1) {
  const samples = 96;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const unitX = i / samples;
    const profile = riverProfileAt(unitX);
    const x = unitX * w;
    const y = (profile.center - profile.halfWidth * widthScale) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = samples; i >= 0; i--) {
    const unitX = i / samples;
    const profile = riverProfileAt(unitX);
    ctx.lineTo(unitX * w, (profile.center + profile.halfWidth * widthScale) * h);
  }
  ctx.closePath();
}

function traceRiverRibbonAsymmetric(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  upperScale = 1,
  lowerScale = 1,
) {
  const samples = 96;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const unitX = i / samples;
    const profile = riverProfileAt(unitX);
    // A real valley stream has alternating shallow shelves and small coves;
    // let the two banks breathe independently instead of drawing parallel
    // rails around the water.
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const localUpper = upperScale * (1 + variation);
    const x = unitX * w;
    const y = (profile.center - profile.halfWidth * localUpper + cove) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = samples; i >= 0; i--) {
    const unitX = i / samples;
    const profile = riverProfileAt(unitX);
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const localLower = lowerScale * (1 - variation * 0.7);
    ctx.lineTo(unitX * w, (profile.center + profile.halfWidth * localLower + cove * 0.6) * h);
  }
  ctx.closePath();
}

function traceRiverCenter(ctx: CanvasRenderingContext2D, w: number, h: number, offset = 0) {
  const samples = 96;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const unitX = i / samples;
    const profile = riverProfileAt(unitX);
    const x = unitX * w;
    const y = (profile.center + profile.halfWidth * offset) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/**
 * The supplied river artwork is composed as a single portrait-like panel.
 * Mirroring that panel makes a pleasing still image, but it reverses the
 * river's bend at the panorama join. Draw a quiet hand-painted ribbon across
 * the whole world instead so the water, banks and fish follow one continuous
 * downstream path while the generated meadow and foreground art remain in
 * the same visual language.
 */
function drawContinuousGeneratedRiver(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  elapsed: number,
) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  traceRiverRibbonAsymmetric(ctx, w, h, 1.28, 1.62);
  ctx.fillStyle = '#c6b58a';
  ctx.fill();
  ctx.strokeStyle = '#4f6f70';
  ctx.lineWidth = Math.max(1.2, h * 0.0034);
  ctx.stroke();

  // Two shallow backwaters break the long ribbon at different depths. They
  // are deliberately short and low contrast: the eye reads them as wetland
  // pockets connected to the main stream, not as a second canal.
  for (const [unitX, side, depthScale] of [
    [0.37, -1, 0.72],
    [0.61, 1, 0.58],
    [0.79, -1, 0.46],
  ] as const) {
    const profile = riverProfileAt(unitX);
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const edge = side < 0
      ? profile.center - profile.halfWidth * 1.28 * (1 + variation) + cove
      : profile.center + profile.halfWidth * 1.62 * (1 - variation * 0.7) + cove * 0.6;
    const x = unitX * w;
    const y = edge * h;
    const span = Math.max(18, w * 0.055);
    const depth = h * 0.055 * depthScale;
    ctx.save();
    ctx.fillStyle = 'rgba(102,164,157,.32)';
    ctx.strokeStyle = 'rgba(57,103,96,.38)';
    ctx.lineWidth = Math.max(0.8, h * 0.0018);
    ctx.beginPath();
    ctx.moveTo(x - span * 0.48, y + side * h * 0.002);
    ctx.quadraticCurveTo(x - span * 0.12, y + side * depth * 0.42, x + span * 0.5, y + side * depth * 0.72);
    ctx.quadraticCurveTo(x + span * 0.28, y + side * depth, x - span * 0.22, y + side * depth * 0.86);
    ctx.quadraticCurveTo(x - span * 0.58, y + side * depth * 0.5, x - span * 0.48, y + side * h * 0.002);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  traceRiverRibbonAsymmetric(ctx, w, h, 0.9, 1.04);
  const water = ctx.createLinearGradient(0, h * 0.66, 0, h * 0.98);
  water.addColorStop(0, '#92cdd0');
  water.addColorStop(0.52, '#6cb7c3');
  water.addColorStop(1, '#4a96aa');
  ctx.fillStyle = water;
  ctx.fill();
  ctx.strokeStyle = '#355f70';
  ctx.lineWidth = Math.max(1, h * 0.0027);
  ctx.stroke();

  // A visible side channel at the floodplain bend gives the river a natural
  // recessed bank. It joins the main water with a narrow neck, then opens into
  // a shallow, stone-edged pool; this remains part of the same water system as
  // the main ribbon rather than a decorative second stream.
  {
    const unitX = 0.53;
    const profile = riverProfileAt(unitX);
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const edge = (profile.center - profile.halfWidth * 0.98 * (1 + variation)) * h + cove * h;
    const x = unitX * w;
    const neck = Math.max(14, w * 0.018);
    const reach = Math.max(38, w * 0.082);
    const depth = h * 0.068;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - neck * 0.62, edge + h * 0.006);
    ctx.bezierCurveTo(
      x - neck * 0.18, edge - depth * 0.18,
      x - reach * 0.22, edge - depth * 0.52,
      x - reach * 0.72, edge - depth * 0.62,
    );
    ctx.bezierCurveTo(
      x - reach * 0.95, edge - depth * 0.67,
      x - reach * 0.96, edge - depth * 0.94,
      x - reach * 0.68, edge - depth,
    );
    ctx.bezierCurveTo(
      x - reach * 0.35, edge - depth * 1.02,
      x - reach * 0.08, edge - depth * 0.86,
      x + neck * 0.7, edge - depth * 0.24,
    );
    ctx.quadraticCurveTo(x + neck * 0.84, edge - depth * 0.02, x + neck * 0.54, edge + h * 0.006);
    ctx.closePath();
    const backwater = ctx.createLinearGradient(x, edge - depth, x, edge);
    backwater.addColorStop(0, '#78b5b8');
    backwater.addColorStop(1, '#61a8b1');
    ctx.fillStyle = backwater;
    ctx.fill();
    ctx.strokeStyle = 'rgba(53,95,92,.72)';
    ctx.lineWidth = Math.max(1, h * 0.0023);
    ctx.stroke();

    // Exposed gravel on the inside of the bend helps sell the shallow shelf.
    ctx.fillStyle = 'rgba(164,151,111,.86)';
    for (let i = 0; i < 7; i++) {
      const stoneX = x - reach * (0.22 + i * 0.105);
      const stoneY = edge - depth * (0.9 + Math.sin(i * 1.7) * 0.035);
      const stoneR = Math.max(1.8, h * (0.004 + (i % 3) * 0.0014));
      ctx.beginPath();
      ctx.ellipse(stoneX, stoneY, stoneR * 1.65, stoneR * 0.72, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Long, low-contrast highlights make the current read as flowing in one
  // direction instead of as a repeated static texture.
  for (const offset of [-0.38, 0.16]) {
    traceRiverCenter(ctx, w, h, offset);
    ctx.strokeStyle = 'rgba(244,246,220,.46)';
    ctx.lineWidth = Math.max(0.75, h * 0.0019);
    ctx.stroke();
  }

  // Sparse bank texture: a few exposed stones, shallow bars, and reed clumps
  // keep the waterline irregular without turning the stream into decoration.
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 13; i++) {
    const unitX = 0.035 + seeded(i, 931) * 0.93;
    const profile = riverProfileAt(unitX);
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const upperEdge = profile.center - profile.halfWidth * 1.28 * (1 + variation) + cove;
    const lowerEdge = profile.center + profile.halfWidth * 1.62 * (1 - variation * 0.7) + cove * 0.6;
    const side = i % 2 === 0 ? -1 : 1;
    const edge = side < 0 ? upperEdge : lowerEdge;
    const x = unitX * w;
    const y = edge * h + side * h * (0.003 + seeded(i, 932) * 0.009);
    const radius = Math.max(2, h * (0.004 + seeded(i, 933) * 0.008));
    ctx.fillStyle = i % 3 === 0 ? 'rgba(89,107,100,.5)' : 'rgba(119,128,112,.4)';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (1.25 + seeded(i, 934) * 0.75), radius * 0.58, seeded(i, 935) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    if (i % 3 === 1) {
      ctx.strokeStyle = 'rgba(84,126,107,.5)';
      ctx.lineWidth = Math.max(0.7, h * 0.0012);
      for (let reed = 0; reed < 3; reed++) {
        const rx = x + (reed - 1) * radius * 0.72;
        ctx.beginPath();
        ctx.moveTo(rx, y + side * radius * 0.2);
        ctx.quadraticCurveTo(rx - side * radius * 0.5, y - h * 0.012, rx + side * radius * 0.18, y - h * 0.025);
        ctx.stroke();
      }
    }
  }
  // Dark, broken shoreline shadows make the waterline legible as a set of
  // coves and shallow shelves rather than two continuous drawn rails.
  ctx.strokeStyle = 'rgba(56,92,84,.36)';
  ctx.lineWidth = Math.max(1, h * 0.0032);
  for (let i = 0; i < 11; i++) {
    const unitX = 0.04 + seeded(i, 941) * 0.9;
    const profile = riverProfileAt(unitX);
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const side = i % 2 === 0 ? -1 : 1;
    const edge = side < 0
      ? profile.center - profile.halfWidth * 1.28 * (1 + variation) + cove
      : profile.center + profile.halfWidth * 1.62 * (1 - variation * 0.7) + cove * 0.6;
    const x = unitX * w;
    const span = Math.max(10, w * (0.012 + seeded(i, 942) * 0.018));
    const depth = h * (0.006 + seeded(i, 943) * 0.012);
    ctx.beginPath();
    ctx.moveTo(x - span, edge * h + side * depth * 0.25);
    ctx.quadraticCurveTo(x - span * 0.2, edge * h + side * depth * 1.3, x + span * 0.55, edge * h + side * depth * 0.72);
    ctx.quadraticCurveTo(x + span * 0.9, edge * h + side * depth * 0.35, x + span, edge * h + side * depth * 0.15);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  traceRiverRibbonAsymmetric(ctx, w, h, 0.88, 1.02);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = Math.max(0.7, h * 0.0015);
  for (let i = 0; i < 26; i++) {
    const unitX = (seeded(i, 921) + elapsed * (0.0028 + (i % 4) * 0.0007)) % 1;
    const profile = riverProfileAt(unitX);
    const x = unitX * w;
    const y = (profile.center + (seeded(i, 922) - 0.5) * profile.halfWidth * 1.25) * h;
    const length = Math.max(7, w * (0.004 + seeded(i, 923) * 0.006));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + length * 0.45, y - h * 0.002, x + length, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawDistantPine(ctx: CanvasRenderingContext2D, x: number, groundY: number, height: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#416b69';
  ctx.beginPath();
  ctx.moveTo(x, groundY - height);
  ctx.lineTo(x - height * 0.24, groundY - height * 0.3);
  ctx.lineTo(x - height * 0.1, groundY - height * 0.34);
  ctx.lineTo(x - height * 0.3, groundY);
  ctx.lineTo(x + height * 0.3, groundY);
  ctx.lineTo(x + height * 0.1, groundY - height * 0.34);
  ctx.lineTo(x + height * 0.24, groundY - height * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLamarLandscape(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: SeasonPalette,
  grassAmount: number,
  visualFire: number,
) {
  const outline = '#31536a';

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Blue-gray Absaroka ridges stay distant so the valley reads as broad rather
  // than as a wall of close conifers.
  ctx.beginPath();
  ctx.moveTo(0, h * 0.48);
  for (let i = 0; i <= 84; i++) {
    const unitX = i / 84;
    const ridge = 0.37
      + Math.sin(unitX * Math.PI * 4.1 + 0.4) * 0.045
      + Math.sin(unitX * Math.PI * 10.7) * 0.018
      - Math.exp(-Math.pow((unitX - 0.57) / 0.09, 2)) * 0.12;
    ctx.lineTo(unitX * w, ridge * h);
  }
  ctx.lineTo(w, h * 0.57);
  ctx.lineTo(0, h * 0.57);
  ctx.closePath();
  ctx.fillStyle = '#92aeb7';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.4, h * 0.0042);
  ctx.globalAlpha = 0.9;
  ctx.stroke();

  // Broad, low-contrast facets give the ridges the hand-painted volume seen
  // in Yellowstone valley illustrations without turning them into a close
  // mountain wall.
  const facets = [
    { x: 0.18, peak: 0.285, spread: 0.11 },
    { x: 0.47, peak: 0.31, spread: 0.14 },
    { x: 0.68, peak: 0.295, spread: 0.12 },
    { x: 0.87, peak: 0.325, spread: 0.1 },
  ] as const;
  for (const facet of facets) {
    const base = 0.43;
    ctx.fillStyle = 'rgba(211,228,229,.44)';
    ctx.beginPath();
    ctx.moveTo((facet.x - facet.spread) * w, base * h);
    ctx.lineTo(facet.x * w, facet.peak * h);
    ctx.lineTo((facet.x + facet.spread * 0.72) * w, base * h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(67,105,120,.16)';
    ctx.beginPath();
    ctx.moveTo(facet.x * w, facet.peak * h);
    ctx.lineTo((facet.x + facet.spread * 0.72) * w, base * h);
    ctx.lineTo((facet.x + facet.spread * 0.2) * w, base * h);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(0, h * 0.53);
  for (let i = 0; i <= 72; i++) {
    const unitX = i / 72;
    const foothill = 0.48
      + Math.sin(unitX * Math.PI * 3.2 + 1.5) * 0.035
      + Math.sin(unitX * Math.PI * 8.4) * 0.012;
    ctx.lineTo(unitX * w, foothill * h);
  }
  ctx.lineTo(w, h * 0.63);
  ctx.lineTo(0, h * 0.63);
  ctx.closePath();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#789c8d';
  ctx.fill();
  ctx.strokeStyle = 'rgba(47,78,79,.72)';
  ctx.lineWidth = Math.max(1, h * 0.0028);
  ctx.stroke();

  // A sparse conifer line anchors the foothills without enclosing the meadow.
  for (let i = 0; i < 54; i++) {
    if (seeded(i, 811) < 0.42) continue;
    const unitX = (i + seeded(i, 812) * 0.7) / 54;
    const cluster = Math.max(
      Math.exp(-Math.pow((unitX - 0.08) / 0.11, 2)),
      Math.exp(-Math.pow((unitX - 0.42) / 0.08, 2)) * 0.7,
      Math.exp(-Math.pow((unitX - 0.89) / 0.1, 2)),
    );
    if (seeded(i, 813) > 0.25 + cluster * 0.75) continue;
    drawDistantPine(
      ctx,
      unitX * w,
      h * (0.555 + seeded(i, 814) * 0.018),
      h * (0.045 + seeded(i, 815) * 0.045),
      0.36 + cluster * 0.34,
    );
  }

  ctx.fillStyle = rgba(palette.near);
  ctx.fillRect(0, h * 0.555, w, h * 0.445);

  for (let band = 0; band < 3; band++) {
    ctx.beginPath();
    ctx.moveTo(0, h * (0.62 + band * 0.075));
    for (let i = 0; i <= 60; i++) {
      const unitX = i / 60;
      const y = 0.62 + band * 0.075
        + Math.sin(unitX * Math.PI * (3.4 + band * 0.7) + band) * 0.012
        + Math.sin(unitX * Math.PI * 9.1) * 0.004;
      ctx.lineTo(unitX * w, y * h);
    }
    ctx.lineTo(w, h * (0.69 + band * 0.075));
    ctx.lineTo(0, h * (0.69 + band * 0.075));
    ctx.closePath();
    ctx.fillStyle = band % 2 === 0 ? 'rgba(226,231,175,.18)' : 'rgba(91,140,105,.12)';
    ctx.fill();
  }

  ctx.fillStyle = rgba(palette.far, 0.32);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.64);
  for (let i = 0; i <= 64; i++) {
    const unitX = i / 64;
    ctx.lineTo(unitX * w, h * (0.62 + Math.sin(unitX * Math.PI * 5.2 + 0.8) * 0.018));
  }
  ctx.lineTo(w, h * 0.72);
  ctx.lineTo(0, h * 0.72);
  ctx.closePath();
  ctx.fill();

  if (palette.carpetAlpha > 0.001 || grassAmount > 2500) {
    ctx.fillStyle = rgba(palette.carpet, Math.min(0.2, palette.carpetAlpha + Math.max(0, grassAmount - 2500) / 22000));
    ctx.fillRect(0, h * 0.59, w, h * 0.41);
  }

  // Sandy shallows frame a winding Lamar River that remains visible across
  // every camera position and narrows naturally toward the middle distance.
  traceRiverRibbon(ctx, w, h, 1.42);
  ctx.fillStyle = '#c6b58a';
  ctx.fill();
  ctx.strokeStyle = '#4f6f70';
  ctx.lineWidth = Math.max(1.4, h * 0.004);
  ctx.stroke();

  traceRiverRibbon(ctx, w, h);
  const river = ctx.createLinearGradient(0, h * 0.71, 0, h * 0.93);
  river.addColorStop(0, '#91ced1');
  river.addColorStop(0.55, '#69b6c3');
  river.addColorStop(1, '#4b9aad');
  ctx.fillStyle = river;
  ctx.fill();
  ctx.strokeStyle = '#355f70';
  ctx.lineWidth = Math.max(1.2, h * 0.0032);
  ctx.stroke();

  for (const offset of [-0.38, 0.18]) {
    traceRiverCenter(ctx, w, h, offset);
    ctx.strokeStyle = 'rgba(244,246,220,.48)';
    ctx.lineWidth = Math.max(0.8, h * 0.0022);
    ctx.stroke();
  }

  // Sagebrush-steppe texture replaces the previous decorative flower carpet.
  const sageAlpha = (1 - visualFire * 0.7) * 0.58;
  ctx.strokeStyle = `rgba(71,111,91,${sageAlpha})`;
  ctx.lineWidth = Math.max(0.7, h * 0.0018);
  for (let i = 0; i < 74; i++) {
    const unitX = seeded(i, 831);
    const unitY = 0.59 + seeded(i, 832) * 0.36;
    const profile = riverProfileAt(unitX);
    if (Math.abs(unitY - profile.center) < profile.halfWidth * 1.75) continue;
    const x = unitX * w;
    const y = unitY * h;
    const size = h * (0.006 + seeded(i, 833) * 0.009);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * 0.6, y - size);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * 1.2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.65, y - size * 0.9);
    ctx.stroke();
  }

  ctx.restore();
}

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
  'pine-cluster': 0.5,
  pine: 0.44,
  aspen: 0.55,
  'grass-daisies': 0.55,
  'grass-flowers': 0.62,
  reeds: 0.5,
  willow: 0.6,
  'golden-shrub': 0.58,
  'river-rocks': 0.7,
  'moss-rock': 0.68,
  'distant-pines': 0.58,
};

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function headingDelta(from: number, to: number) {
  let delta = (to - from + Math.PI) % (Math.PI * 2);
  if (delta < 0) delta += Math.PI * 2;
  return delta - Math.PI;
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

/**
 * Small, low-contrast details that sit over the generated layer pack. They
 * break up repeated mirror bands while keeping the approved hand-painted
 * artwork as the dominant visual source.
 */
function drawPanoramaDepthDetails(
  ctx: CanvasRenderingContext2D,
  worldW: number,
  h: number,
  palette: SeasonPalette,
  elapsed: number,
) {
  const panelW = worldW / 2;
  ctx.save();
  ctx.lineCap = 'round';

  const haze = ctx.createLinearGradient(0, h * 0.28, 0, h * 0.66);
  haze.addColorStop(0, 'rgba(235,245,245,0.015)');
  haze.addColorStop(0.72, 'rgba(235,245,245,0.065)');
  haze.addColorStop(1, 'rgba(177,207,202,0.02)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.28, worldW, h * 0.4);

  // A sparse sagebrush texture keeps the meadow from reading as horizontal
  // bands. It is intentionally quieter than the foreground foliage.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h * 0.62, worldW, h * 0.27);
  ctx.clip();
  ctx.strokeStyle = rgba(palette.far, 0.2);
  ctx.lineWidth = Math.max(0.7, h * 0.0014);
  for (let i = 0; i < 86; i++) {
    const x = 12 + seeded(i, 911) * (worldW - 24);
    const y = h * (0.64 + seeded(i, 912) * 0.22);
    const size = h * (0.006 + seeded(i, 913) * 0.009);
    const sway = Math.sin(elapsed * 0.65 + i * 0.8) * size * 0.18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * 0.55 + sway, y - size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + sway, y - size * 1.22);
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.62 + sway, y - size * 0.82);
    ctx.stroke();
  }
  ctx.restore();

  // A barely visible atmospheric wash at the mirrored join prevents a hard
  // vertical seam while preserving the river and foreground silhouettes.
  const seamWidth = Math.min(panelW * 0.085, 76);
  const seam = ctx.createLinearGradient(panelW - seamWidth, 0, panelW + seamWidth, 0);
  seam.addColorStop(0, 'rgba(222,236,232,0)');
  seam.addColorStop(0.5, 'rgba(222,236,232,0.028)');
  seam.addColorStop(1, 'rgba(222,236,232,0)');
  ctx.fillStyle = seam;
  ctx.fillRect(panelW - seamWidth, h * 0.35, seamWidth * 2, h * 0.27);

  ctx.restore();
}

/**
 * Generated Yellowstone layers already contain their own painted ground, so
 * winter needs a light, irregular cover pass instead of a flat white screen.
 * Patches are sampled against the shared river mask and never paint over the
 * water ribbon where the fish and current remain visible.
 */
function drawSeasonalSnowCover(
  ctx: CanvasRenderingContext2D,
  worldW: number,
  h: number,
  snow: number,
  elapsed: number,
) {
  if (snow <= 0.01) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 72; i++) {
    const unitX = 0.015 + seeded(i, 966) * 0.97;
    const unitY = 0.62 + seeded(i, 967) * 0.3;
    if (isRiverWater(unitX, unitY, 0.006)) continue;
    const px = unitX * worldW;
    const py = unitY * h;
    const rx = worldW * (0.012 + seeded(i, 968) * 0.032);
    const ry = h * (0.004 + seeded(i, 969) * 0.012);
    ctx.fillStyle = `rgba(239,246,247,${snow * (0.11 + seeded(i, 970) * 0.16)})`;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, seeded(i, 971) * 0.3 - 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  // A few thin, broken caps catch the colder light along the two banks.
  ctx.strokeStyle = `rgba(242,248,248,${snow * 0.32})`;
  ctx.lineWidth = Math.max(1, h * 0.0022);
  for (let i = 0; i < 26; i++) {
    const unitX = 0.02 + seeded(i, 972) * 0.96;
    const profile = riverProfileAt(unitX);
    const variation = riverBankVariation(unitX);
    const cove = riverBankCove(unitX);
    const side = i % 2 === 0 ? -1 : 1;
    const edge = side < 0
      ? profile.center - profile.halfWidth * 1.28 * (1 + variation) + cove
      : profile.center + profile.halfWidth * 1.62 * (1 - variation * 0.7) + cove * 0.6;
    const x = unitX * worldW;
    const y = edge * h + side * h * (0.008 + seeded(i, 973) * 0.012);
    const span = worldW * (0.008 + seeded(i, 974) * 0.018);
    ctx.beginPath();
    ctx.moveTo(x - span, y);
    ctx.quadraticCurveTo(x, y - side * h * 0.003, x + span, y + side * h * 0.001);
    ctx.stroke();
  }
  // Snow glints move almost imperceptibly, keeping a winter frame alive while
  // the larger ground patches remain anchored to the panorama.
  ctx.fillStyle = `rgba(255,255,255,${snow * 0.3})`;
  for (let i = 0; i < 22; i++) {
    const sx = (seeded(i, 975) * worldW + elapsed * (3 + i % 4)) % worldW;
    const sy = h * (0.18 + seeded(i, 976) * 0.62);
    ctx.beginPath();
    ctx.arc(sx, sy, 0.7 + (i % 3) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
export function EcoSceneCanvas({ state, onObservation, onStatus, onDayPhase }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const observationRef = useRef(onObservation);
  const statusRef = useRef(onStatus);
  const dayPhaseRef = useRef(onDayPhase);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [cameraProgress, setCameraProgress] = useState(0);
  const cameraRef = useRef(0);
  const dragRef = useRef({ active: false, pointerId: -1, startX: 0, startCamera: 0, moved: false });
  const selectedRef = useRef<string | null>(null);
  const hitRef = useRef<{ critters: CritterHit[]; plants: PlantTip[] }>({
    critters: [],
    plants: [],
  });

  useEffect(() => {
    stateRef.current = state;
    observationRef.current = onObservation;
    statusRef.current = onStatus;
    dayPhaseRef.current = onDayPhase;
  }, [state, onObservation, onStatus, onDayPhase]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // React delegates wheel events through a passive listener in some
    // browsers. The panorama needs to consume horizontal wheel intent, so
    // register this one handler natively with passive:false instead of
    // calling preventDefault from the synthetic event.
    const handleWheel = (event: globalThis.WheelEvent) => {
      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(horizontalDelta) < 0.5) return;
      event.preventDefault();
      const width = canvas.getBoundingClientRect().width;
      const maxCamera = Math.max(0, width * (WORLD_WIDTH_FACTOR - 1));
      const nextCamera = Math.max(0, Math.min(maxCamera, cameraRef.current + horizontalDelta));
      cameraRef.current = nextCamera;
      setCameraProgress(nextCamera / Math.max(1, maxCamera));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

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
    const wildlife = createVisualSlice(stateRef.current);
    const visualPoses = new Map<string, VisualPose>();
    let visualSeason = seasonPosition(stateRef.current.season);
    const initialDayPhase = (stateRef.current as EcosystemState & { dayPhase?: SceneDayPhase }).dayPhase;
    let visualDay = initialDayPhase ? dayPhasePosition(initialDayPhase) : 2;
    let visualRain = stateRef.current.rainfall;
    let visualFire = stateRef.current.fire ? 1 : 0;
    let lastObservation = '';
    let lastDayPhase: SceneDayPhase | null = null;
    let lastUiUpdate = 0;
    const statusPriority: Record<WildlifeActivity, number> = {
      feed: 8,
      graze: 7,
      drink: 6,
      chase: 5,
      flee: 5,
      pounce: 5,
      caught: 9,
      stalk: 4,
      emerge: 3,
      roam: 2,
      alert: 2,
      sit: 1,
      hide: 1,
      rest: 0,
    };

    const sheets: Partial<Record<keyof typeof ANIMAL_SHEETS, HTMLImageElement>> = {};
    const generatedSheets: Partial<Record<string, { img: HTMLImageElement; meta: SheetMeta }>> = {};
    const generatedIdleSheets: Partial<Record<EcosystemAnimal, { img: HTMLImageElement; meta: SheetMeta }>> = {};
    const generatedProps: { id: string; meta: ScenePropMeta; img: HTMLImageElement }[] = [];
    const generatedLayers: Partial<Record<SceneLayerKey, HTMLImageElement>> = {};
    let manifest: EcosystemManifest | null = null;
    const animalCanvas = document.createElement('canvas');
    const animalCtx = animalCanvas.getContext('2d');
    const plants = {
      grass: [] as HTMLImageElement[],
      shrubs: [] as HTMLImageElement[],
      trees: [] as HTMLImageElement[],
    };

    void (async () => {
      // Keep the old sheets as an emergency fallback only. The generated
      // Yellowstone pack remains the canonical visual language whenever any
      // part of it is available.
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
        // Start animal requests before the large panorama layers and props.
        // Partial completion is useful: each generated sheet can replace the
        // emergency legacy sprite as soon as it arrives.
        void Promise.all(
          generatedEntries.map(async ([animal, action]) => {
            const meta = manifest?.animals[animal]?.[action];
            if (!meta) return;
            try {
              const loaded = { img: await loadImage(meta.src), meta };
              generatedSheets[`${animal}:${action}`] = loaded;
              if (action === 'idle') generatedIdleSheets[animal] = loaded;
            } catch {
              /* The generated idle sheet remains the style-safe fallback. */
            }
          }),
        );
      }
      if (manifest?.scene?.layers) {
        await Promise.all(
          (Object.entries(manifest.scene.layers) as [SceneLayerKey, { src: string }][]) .map(async ([key, meta]) => {
            try {
              generatedLayers[key] = await loadImage(meta.src);
            } catch {
              /* procedural Lamar fallback remains available when a layer fails */
            }
          }),
        );
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

    const generatedIdleSheet = (kind: WildlifeKind) => {
      const animal: EcosystemAnimal = kind === 'deer' ? 'elk' : kind;
      return generatedIdleSheets[animal];
    };

    const drawSkyMotion = (
      ctx: CanvasRenderingContext2D,
      worldW: number,
      viewportW: number,
      cameraX: number,
      h: number,
      elapsed: number,
      overcast: boolean | number,
      dayPalette: ReturnType<typeof dayPaletteAt>,
    ) => {
      const cloud = generatedProps.find((prop) => prop.id === 'cloud');
      const overcastStrength = typeof overcast === 'number' ? Math.max(0, Math.min(1, overcast)) : overcast ? 1 : 0;
      // The sun is an atmospheric layer, so it stays in the visible sky while
      // the valley itself pans underneath it.
      const sunX = cameraX + viewportW * 0.79;
      const sunY = h * (0.42 - dayPalette.sunElevation * 0.3);
      const radius = Math.max(18, viewportW * 0.033);
      ctx.save();
      ctx.globalAlpha = dayPalette.sunAlpha * (0.96 - overcastStrength * 0.28);
      const halo = ctx.createRadialGradient(sunX, sunY, radius * 0.65, sunX, sunY, radius * 2.7);
      halo.addColorStop(0, rgba(dayPalette.sun, 0.58));
      halo.addColorStop(0.48, rgba(dayPalette.sun, 0.16));
      halo.addColorStop(1, rgba(dayPalette.sun, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(sunX - radius * 2.8, sunY - radius * 2.8, radius * 5.6, radius * 5.6);
      const disk = ctx.createLinearGradient(sunX, sunY - radius, sunX, sunY + radius);
      disk.addColorStop(0, rgba(dayPalette.sun, 1));
      disk.addColorStop(1, rgba(dayPalette.horizonGlow, 1));
      ctx.fillStyle = disk;
      ctx.strokeStyle = rgba(dayPalette.horizonGlow, 0.72);
      ctx.lineWidth = Math.max(0.8, viewportW * 0.0012);
      ctx.beginPath();
      ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Stars and moon fade continuously with the same day palette. Keeping
      // them in the viewport layer makes the night sky feel far away while
      // the Yellowstone panorama continues to pan underneath.
      if (dayPalette.starAlpha > 0.002 || dayPalette.moonAlpha > 0.002) {
        ctx.save();
        ctx.globalAlpha = dayPalette.starAlpha;
        ctx.fillStyle = '#f8f2d5';
        for (let star = 0; star < 42; star++) {
          const starX = cameraX + (seeded(star, 1201) * 0.94 + 0.03) * viewportW;
          const starY = (0.035 + seeded(star, 1202) * 0.3) * h;
          const starSize = Math.max(0.6, viewportW * (0.0008 + seeded(star, 1203) * 0.0012));
          // Keep the twinkle envelope positive so a star fades smoothly
          // instead of being clamped abruptly when the sine wave is negative.
          ctx.globalAlpha = dayPalette.starAlpha * (0.56 + 0.44 * ((Math.sin(elapsed * 1.4 + star) + 1) * 0.5));
          ctx.beginPath();
          ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        const moonX = cameraX + viewportW * 0.67;
        const moonY = h * (0.28 - dayPalette.sunElevation * 0.12);
        const moonRadius = Math.max(10, viewportW * 0.018);
        ctx.save();
        ctx.globalAlpha = dayPalette.moonAlpha;
        ctx.fillStyle = rgba(dayPalette.moon);
        ctx.strokeStyle = rgba(dayPalette.moon, 0.7);
        ctx.lineWidth = Math.max(0.6, viewportW * 0.0009);
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rgba(dayPalette.skyTop, 0.72);
        ctx.beginPath();
        ctx.arc(moonX + moonRadius * 0.32, moonY - moonRadius * 0.12, moonRadius * 0.88, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      CLOUDS.forEach((entry, index) => {
        // Clouds belong to the sky, so anchor them to the viewport rather
        // than the panning valley. This keeps a complete cloud silhouette at
        // the panorama seam while it drifts gently across the visible sky.
        const rawCloudUnit = cloudPosition(index, elapsed);
        const edgePadding = Math.min(0.46, entry.width * 0.58 + 0.025);
        // Leave a little breathing room around the low afternoon sun. If a
        // cloud's natural path enters that light cone, slide it to the near
        // side instead of painting a large opaque blob over the sun.
        const safeCloudMax = 1 - edgePadding;
        let safeCloudUnit = Math.max(edgePadding, Math.min(safeCloudMax, rawCloudUnit));
        const sunUnit = 0.79;
        const cloudHalf = entry.width * 0.52;
        const lightGap = 0.045;
        if (Math.abs(safeCloudUnit - sunUnit) < cloudHalf + lightGap) {
          const leftOfSun = sunUnit - cloudHalf - lightGap;
          const rightOfSun = sunUnit + cloudHalf + lightGap;
          const canSitRight = rightOfSun <= safeCloudMax;
          safeCloudUnit = safeCloudUnit <= sunUnit || !canSitRight
            ? Math.max(edgePadding, leftOfSun)
            : rightOfSun;
        }
        const x = cameraX + safeCloudUnit * viewportW;
        const y = entry.y * h + Math.sin(elapsed * 0.12 + index) * h * 0.004;
        const width = entry.width * viewportW;
        ctx.save();
        ctx.globalAlpha = entry.opacity * dayPalette.cloudAlpha * (1 - overcastStrength * 0.18);
        if (cloud?.img) {
          const height = width * cloud.img.naturalHeight / cloud.img.naturalWidth;
          ctx.drawImage(cloud.img, x - width / 2, y - height / 2, width, height);
        } else {
          ctx.fillStyle = rgba(dayPalette.cloud);
          ctx.strokeStyle = rgba(dayPalette.cloud, 0.7);
          ctx.lineWidth = Math.max(0.8, viewportW * 0.0012);
          ctx.beginPath();
          ctx.ellipse(x, y, width * 0.48, width * 0.13, 0, 0, Math.PI * 2);
          ctx.ellipse(x - width * 0.13, y - width * 0.08, width * 0.22, width * 0.16, 0, 0, Math.PI * 2);
          ctx.ellipse(x + width * 0.12, y - width * 0.1, width * 0.25, width * 0.19, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
      // Keep a small warm edge visible even when a generated cloud happens to
      // drift over the halo. It gives the valley a consistent light direction
      // without turning the sun into a hard sticker.
      ctx.save();
      ctx.globalAlpha = dayPalette.sunAlpha * (0.9 - overcastStrength * 0.22);
      ctx.strokeStyle = rgba(dayPalette.sun, 0.52);
      ctx.lineWidth = Math.max(0.7, viewportW * 0.0011);
      for (let ray = 0; ray < 8; ray++) {
        const angle = ray / 8 * Math.PI * 2;
        const inner = radius * 1.3;
        const outer = radius * 1.62;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * inner, sunY + Math.sin(angle) * inner);
        ctx.lineTo(sunX + Math.cos(angle) * outer, sunY + Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(dayPalette.sun, 0.9);
      ctx.beginPath();
      ctx.arc(sunX, sunY, radius * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (overcastStrength > 0.001) {
        ctx.fillStyle = `rgba(77,99,116,${overcastStrength * 0.12 + dayPalette.shadow * 0.08})`;
        ctx.fillRect(0, 0, worldW, h * 0.62);
      }
    };

    const sheetFor = (kind: WildlifeKind, action: EcosystemAction) => {
      const generated = generatedSheet(kind, action);
      if (generated) return generated;
      const generatedIdle = generatedIdleSheet(kind);
      if (generatedIdle) return generatedIdle;
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
      // Keep the renderer forward-compatible with the simulation's transient
      // states while older saved worlds still only expose the original union.
      const activityName = activity as string;
      const caught = activityName === 'caught' || activityName === 'downed';
      const cartoonCaught = caught && kind === 'rabbit';
      const sitting = activityName === 'sit';
      const moving = Math.hypot(agent.vx, agent.vy * 0.5625) > 0.002;
      const running = activity === 'chase' || activity === 'flee';
      // Hiding, feeding and the brief pounce settle the body instead of
      // replaying a full locomotion clip. Only chase/flee gets a running
      // silhouette; ambient travel stays a slow walk or hop.
      const concealed = activity === 'hide' || activity === 'pounce' || activity === 'feed' || caught || sitting;
      const visualMoving = moving && !concealed;
      const action: EcosystemAction = visualMoving || running
        ? running ? 'run' : kind === 'rabbit' ? 'hop' : 'walk'
        : kind === 'deer' && (activity === 'graze' || activity === 'drink') ? 'graze'
        : kind === 'rabbit' && activity === 'alert' ? 'alert'
        : kind === 'wolf' && activity === 'alert' && agent.activityTime > 1.2 ? 'howl' : 'idle';
      // Once the manifest is available, never mix a ready generated animal
      // with a legacy pixel fallback for a species whose canonical sheet is
      // still in flight. Returning true skips the emoji/legacy branch below
      // and leaves that representative hidden for a short loading window.
      if (manifest && !generatedSheet(kind, action) && !generatedIdleSheet(kind)) return true;
      const current = sheetFor(kind, action);
      if (!current.img) return false;
      let pose = visualPoses.get(agent.id);
      if (!pose) {
        pose = {
          action,
          previousAction: action,
          frame: 0,
          previousFrame: 0,
          actionTime: agent.phase % 1.5,
          blend: 1,
          movement: visualMoving ? 1 : 0,
          sitBlend: sitting ? 1 : 0,
          caughtBlend: caught ? 1 : 0,
          facing: agent.facing,
          oldFacing: agent.facing,
          turnTime: 1,
        };
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
      pose.movement += ((visualMoving ? 1 : 0) - pose.movement) * (1 - Math.exp(-delta * 12));
      pose.sitBlend += ((sitting ? 1 : 0) - pose.sitBlend) * (1 - Math.exp(-delta * 7));
      pose.caughtBlend += ((caught ? 1 : 0) - pose.caughtBlend) * (1 - Math.exp(-delta * 8));
      pose.turnTime = Math.min(1, pose.turnTime + delta / 0.32);
      const facing = pose.turnTime < 0.58 ? pose.oldFacing : pose.facing;
      // Keep the body readable while it arcs through a turn. A small heading
      // lean communicates the curve; the silhouette never collapses into a
      // cartoon squash or snaps to a mirrored frame on the same tick.
      const turnProgress = smoothstep(Math.min(1, pose.turnTime / 0.78));
      const turnWave = Math.sin(turnProgress * Math.PI);
      // A real animal narrows its side silhouette as the shoulders lead the
      // hips through a turn. Keep the effect small enough that the sprite does
      // not squash or pop while the facing image crossfades.
      const turnScale = 1 - turnWave * 0.2;
      const facingHeading = facing > 0 ? 0 : Math.PI;
      const travelAngle = headingDelta(facingHeading, agent.heading);
      const headingLean = Math.max(-0.14, Math.min(0.14, Math.sin(travelAngle) * 0.11)) * pose.movement;
      const shoulderTurn = Math.max(-0.08, Math.min(0.08, Math.sin(headingDelta(agent.heading, agent.targetHeading)) * 0.06));
      // Distance drives feet; stationary gestures have an independent clock.
      pose.frame = visualMoving || running ? agent.gait * current.meta.frames : pose.actionTime * (current.meta.fps ?? 6);
      const depth = 0.84 + (agent.y - 0.61) * 0.8;
      const desiredHeight = FRAME_HEIGHT[kind] * Math.min(sceneWidth / 700, 1.4) * depth;
      const strideWave = Math.sin(agent.gait * Math.PI * 2);
      const hop = kind === 'rabbit' ? Math.max(0, strideWave) * desiredHeight * 0.13 * pose.movement : 0;
      // The successful encounter is mostly hidden by high grass. Keep the
      // internal pounce phase for telemetry, but make the visible weight
      // shift small and grounded instead of a cartoon leap.
      const pounce = activity === 'pounce' ? Math.sin(Math.min(1, agent.activityTime / 0.8) * Math.PI) * desiredHeight * 0.028 : 0;
      const breath = Math.sin(elapsed * 2.1 + agent.phase) * 0.007 * (1 - pose.movement);
      const weight = kind !== 'rabbit' ? Math.abs(strideWave) * desiredHeight * (running ? 0.025 : 0.012) * pose.movement : 0;
      // Resting animals lower their center of mass. A caught rabbit settles
      // onto its side and remains readable for the short post-capture beat.
      const sitDrop = desiredHeight * (kind === 'rabbit' ? 0.08 : 0.12) * pose.sitBlend;
      const caughtDrop = desiredHeight * (kind === 'rabbit' ? 0.22 : 0.17) * pose.caughtBlend;
      const caughtTilt = facing * (kind === 'rabbit' ? 0.46 : 0.28) * pose.caughtBlend;
      target.save();
      target.globalAlpha = agent.opacity;
      target.fillStyle = 'rgba(48,69,51,0.17)';
      target.beginPath();
      target.ellipse(
        x,
        y + 1,
        desiredHeight * (kind === 'rabbit' ? 0.36 + pose.caughtBlend * 0.12 : 0.49 + pose.caughtBlend * 0.08),
        desiredHeight * (0.06 + pose.caughtBlend * 0.015),
        0,
        0,
        Math.PI * 2,
      );
      target.fill();
      target.translate(x, y - hop - pounce - weight + sitDrop + caughtDrop);
      const nibble = activity === 'graze' || activity === 'feed' || activity === 'drink';
      const pitch = activity === 'stalk' ? 0.025 : activity === 'feed' ? 0.09 : activity === 'drink' ? 0.075 : activity === 'graze' ? 0.055 : 0;
      target.rotate(
        caughtTilt
        + facing * (pitch + (nibble ? Math.sin(elapsed * 4 + agent.phase) * 0.012 : 0))
        + headingLean
        + shoulderTurn,
      );
      target.scale(
        turnScale * (1 + pose.caughtBlend * 0.04 - pose.sitBlend * 0.06),
        (1 + breath - (activity === 'stalk' ? 0.055 : 0)) * (1 - pose.caughtBlend * 0.28 - pose.sitBlend * 0.1),
      );
      const drawPose = (
        sheet: ReturnType<typeof sheetFor>,
        frame: number,
        alpha: number,
        drawFacing = facing,
      ) => {
        if (!sheet.img || alpha <= 0) return;
        const meta = sheet.meta;
        const anchored = meta.anchor ? meta : { ...meta, anchor: { x: 0.5, y: 1 } };
        const frameIndex = Math.floor(frame);
        const frameAmount = meta.frames >= 16 ? frame - frameIndex : 0;
        const flip = (meta.facing ?? 'right') === 'right' ? drawFacing < 0 : drawFacing > 0;
        target.globalAlpha = agent.opacity * alpha * (1 - frameAmount);
        drawSheetFrameAnchored(target, sheet.img, anchored, frameIndex, 0, 0, desiredHeight / meta.frameH, flip);
        if (frameAmount > 0.001) {
          target.globalAlpha = agent.opacity * alpha * frameAmount;
          drawSheetFrameAnchored(target, sheet.img, anchored, frameIndex + 1, 0, 0, desiredHeight / meta.frameH, flip);
        }
      };
      const previous = sheetFor(kind, pose.previousAction);
      const blend = previous.img ? smoothstep(pose.blend) : 1;
      if (blend < 1) {
        drawPose(previous, pose.previousFrame, 1 - blend);
        // Add premultiplied pose weights on the isolated animal surface. This
        // avoids the transparent dip of a normal source-over crossfade.
        target.globalCompositeOperation = 'lighter';
      }
      if (pose.turnTime < 0.84 && pose.oldFacing !== pose.facing) {
        const oldAlpha = (1 - turnProgress) * blend;
        const newAlpha = turnProgress * blend;
        drawPose(current, pose.frame, oldAlpha, pose.oldFacing);
        drawPose(current, pose.frame, newAlpha, pose.facing);
      } else {
        drawPose(current, pose.frame, blend, facing);
      }
      // The X eyes are deliberately drawn as a simple graphic overlay. It
      // keeps the capture beat legible at small canvas sizes without blood or
      // a separate sprite sheet, and fades with the same animal opacity.
      if (cartoonCaught && pose.caughtBlend > 0.02 && agent.opacity > 0.08) {
        const faceX = facing * desiredHeight * 0.2;
        const faceY = -desiredHeight * 0.37;
        const markSize = Math.max(2.2, desiredHeight * 0.065);
        target.save();
        target.globalAlpha = agent.opacity * pose.caughtBlend * 0.92;
        target.strokeStyle = '#2f2928';
        target.lineWidth = Math.max(1.1, markSize * 0.22);
        target.lineCap = 'round';
        for (const offset of [-markSize * 0.62, markSize * 0.62]) {
          target.beginPath();
          target.moveTo(faceX + offset - markSize * 0.42, faceY - markSize * 0.42);
          target.lineTo(faceX + offset + markSize * 0.42, faceY + markSize * 0.42);
          target.moveTo(faceX + offset + markSize * 0.42, faceY - markSize * 0.42);
          target.lineTo(faceX + offset - markSize * 0.42, faceY + markSize * 0.42);
          target.stroke();
        }
        target.restore();
      }
      target.restore();

      // A quiet seated animal needs a readable weight cue even when the
      // source sheet only provides an upright idle frame. These restrained
      // haunch and tucked-paw marks sit under the silhouette's outline, so a
      // rabbit, elk, or wolf reads as settled on its haunches instead of a
      // standing sprite that simply stopped moving.
      if (sitting && pose.sitBlend > 0.02 && agent.opacity > 0.35) {
        const sit = pose.sitBlend;
        const h = desiredHeight;
        const seatX = x - facing * h * (kind === 'rabbit' ? 0.035 : 0.018);
        const seatY = y - h * (kind === 'rabbit' ? 0.16 : 0.11);
        const ink = kind === 'rabbit'
          ? 'rgba(100,73,62,0.48)'
          : kind === 'deer'
            ? 'rgba(92,70,52,0.34)'
            : 'rgba(40,53,70,0.38)';
        target.save();
        target.globalAlpha = agent.opacity * sit;
        target.lineCap = 'round';
        target.lineJoin = 'round';
        target.lineWidth = Math.max(0.8, h * 0.016);
        target.strokeStyle = ink;
        target.fillStyle = kind === 'rabbit' ? 'rgba(154,112,84,0.16)' : 'rgba(58,68,73,0.12)';
        target.beginPath();
        target.ellipse(
          seatX,
          seatY,
          h * (kind === 'rabbit' ? 0.19 : 0.27),
          h * (kind === 'rabbit' ? 0.12 : 0.14),
          facing * 0.08,
          0,
          Math.PI * 2,
        );
        target.fill();
        target.beginPath();
        target.moveTo(x + facing * h * 0.06, y - h * (kind === 'rabbit' ? 0.26 : 0.3));
        target.quadraticCurveTo(
          x + facing * h * (kind === 'rabbit' ? 0.12 : 0.16),
          y - h * 0.1,
          x + facing * h * 0.08,
          y - h * 0.015,
        );
        target.moveTo(x + facing * h * 0.13, y - h * (kind === 'rabbit' ? 0.25 : 0.28));
        target.quadraticCurveTo(
          x + facing * h * 0.19,
          y - h * 0.09,
          x + facing * h * 0.13,
          y - h * 0.01,
        );
        target.stroke();
        target.restore();
      }

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

      if ((visualMoving || running) && agent.opacity > 0.5) {
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

    const prepareFoliage = (w: number, h: number, elapsed: number): FoliageSprite[] => {
      const scale = Math.min(w / (manifest?.scene?.width ?? 2048), h / (manifest?.scene?.height ?? 1152));
      const sprites: FoliageSprite[] = generatedProps
        .filter((prop) => prop.id !== 'cloud' && !['grass-flowers', 'grass-daisies'].includes(prop.id))
        .map((prop, index) => {
        const [x, y] = PROP_ANCHORS[prop.id] ?? [0.5, 0.86];
        const plant = !['river-rocks', 'moss-rock'].includes(prop.id);
        return { id: prop.id, img: prop.img, x: x * w, y: y * h, width: prop.meta.width * scale * (PROP_SCALE[prop.id] ?? 1), height: prop.meta.height * scale * (PROP_SCALE[prop.id] ?? 1), sway: plant ? Math.sin(elapsed * 0.8 + index * 0.9) * 0.022 : 0 };
      });
      for (const patch of WILDLIFE_COVER_PATCHES) {
        const count = patch.id === 'left-tall-grass' ? 4 : 2;
        for (let i = 0; i < count; i++) {
          const offset = i / (count - 1) * 2 - 1;
          const prop = generatedProps.find((p) => p.id === 'reeds');
          const height = patch.height * h * (0.64 + (1 - Math.abs(offset)) * 0.45);
          const x = patch.x + patch.rx * offset * 0.86;
          const y = patch.y + patch.ry * (0.38 + 0.12 * Math.sin(i * 2.3));
          const visitor = wildlife.agents.find((agent) => Math.hypot(agent.x - x, (agent.y - y) * 0.5625) < 0.065);
          const rustle = visitor ? Math.min(1, Math.hypot(visitor.vx, visitor.vy) / 0.06) * Math.sin(elapsed * 9 + i) * 0.045 : 0;
          sprites.push({ id: `${patch.id}-${i}`, img: prop?.img, x: x * w, y: y * h, width: height * (prop ? prop.meta.width / prop.meta.height : 1.4), height, sway: Math.sin(elapsed * 1.1 + i * 0.7) * 0.028 + rustle });
        }
      }
      return sprites.sort((a, b) => a.y - b.y);
    };

    const drawWaterMotion = (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
      ctx.save();
      traceRiverRibbon(ctx, w, h);
      ctx.clip();
      drawSceneFish(ctx, w, h, elapsed, PANORAMA_FISH_ROUTES);
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = Math.max(0.8, h * 0.0024);
      for (let i = 0; i < 20; i++) {
        const unitX = (seeded(i, 901) + elapsed * (0.002 + (i % 4) * 0.0004)) % 1;
        const profile = riverProfileAt(unitX);
        const x = unitX * w;
        const y = (profile.center + (seeded(i, 902) - 0.5) * profile.halfWidth * 1.2) * h;
        const length = Math.max(9, w * (0.007 + seeded(i, 903) * 0.006));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + length * 0.5, y - 2, x + length, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawGeneratedWaterMotion = (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
      // The generated river already contains the bank, shallows and painted
      // current. Add only the animated biological layer here so it remains
      // aligned with the mirrored water artwork instead of repainting it with
      // a flat procedural ribbon.
      drawSceneFish(ctx, w, h, elapsed, PANORAMA_FISH_ROUTES);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = Math.max(0.7, h * 0.0018);
      PANORAMA_FISH_ROUTES.forEach((route, index) => {
        const position = fishPosition(route, elapsed + index * 0.08);
        const x = position.x * w;
        const y = position.y * h;
        const length = Math.max(8, w * (0.004 + (index % 3) * 0.001));
        ctx.beginPath();
        ctx.moveTo(x - length, y + h * 0.008);
        ctx.quadraticCurveTo(x, y + h * 0.004, x + length, y + h * 0.008);
        ctx.stroke();
      });
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
      const tierScale = s.campaign?.vegetation === 'lush'
        ? 1.2
        : s.campaign?.vegetation === 'recovering'
          ? 1.08
          : s.campaign?.vegetation === 'burned'
            ? 0.62
            : 0.9;
      let treeN = Math.min(
        PLANT_CAP.trees,
        Math.max(0, Math.ceil((s.shrubs / 450 + s.grass / 4000) * tierScale)),
      );
      let shrubN = Math.min(PLANT_CAP.shrubs, Math.max(0, Math.ceil((s.shrubs / 360) * tierScale)));
      let grassN = Math.min(PLANT_CAP.grass, Math.max(0, Math.ceil((s.grass / 500) * tierScale)));
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
      const campaignVegetation = s.campaign?.vegetation ?? 'stressed';
      const reducedMotion = motionQuery.matches;
      // Keep the ecological clock and the presentation clock separate. A
      // paused observation freezes population changes and scripted movement,
      // while breathing, water, clouds and idle sprite frames can continue
      // so the field does not look like a static screenshot.
      const motionScale = reducedMotion ? 0.28 : 1;
      const ambientDelta = !document.hidden ? delta * motionScale : 0;
      const motionDelta = !s.paused ? ambientDelta : 0;
      animationSeconds += ambientDelta;
      stepVisualSlice(wildlife, motionDelta, s);
      const requestedDayPhase = (s as EcosystemState & { dayPhase?: SceneDayPhase }).dayPhase;
      if (reducedMotion) {
        // Deliberate commands still need to be visible when the user asks for
        // reduced motion; only the interpolation itself is removed.
        visualSeason = seasonPosition(s.season);
        if (requestedDayPhase) visualDay = dayPhasePosition(requestedDayPhase);
        visualRain = s.rainfall;
        visualFire = s.fire ? 1 : 0;
      } else {
        visualSeason = advanceSeasonVisual(visualSeason, s.season, motionDelta);
        if (requestedDayPhase) {
          visualDay = advanceDayVisual(visualDay, requestedDayPhase, motionDelta);
        } else {
          // The core simulator has no clock field yet, so the scene carries a
          // quiet visual clock of its own. It starts at noon for a clear first
          // frame and takes roughly five minutes to visit every lighting phase.
          visualDay = (visualDay + motionDelta * 0.018) % 5;
        }
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
      const worldW = Math.max(w, w * WORLD_WIDTH_FACTOR);
      const maxCamera = Math.max(0, worldW - w);
      cameraRef.current = Math.max(0, Math.min(maxCamera, cameraRef.current));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const palette = environmentPaletteAt(visualSeason, visualDay);
      const dayPalette = dayPaletteAt(visualDay);
      const currentDayPhase = dayPhaseAt(visualDay);
      if (currentDayPhase !== lastDayPhase) {
        lastDayPhase = currentDayPhase;
        dayPhaseRef.current?.(currentDayPhase);
      }
      const rainOvercast = Math.max(0, Math.min(1, (visualRain - 0.45) / 0.55));
      const seasonCyclePosition = ((visualSeason % 4) + 4) % 4;
      const seasonalVegetationFilter = visualFire > 0.001
        ? `brightness(${1 - visualFire * 0.45}) sepia(${visualFire * 0.55}) saturate(${1 + visualFire * 0.2})`
        : palette.snow > 0.02
          ? `brightness(${1 + palette.snow * 0.08}) saturate(${1 - palette.snow * 0.5})`
          : seasonCyclePosition > 1.8 && seasonCyclePosition < 2.8
            ? 'sepia(0.18) hue-rotate(-12deg) saturate(1.05)'
            : seasonCyclePosition > 0.8 && seasonCyclePosition < 1.8
              ? 'brightness(1.06) saturate(1.15)'
              : '';
      const campaignVegetationFilter = campaignVegetation === 'lush'
        ? 'saturate(1.16) brightness(1.035)'
        : campaignVegetation === 'recovering'
          ? 'saturate(1.06)'
          : campaignVegetation === 'burned'
            ? 'sepia(.28) saturate(.72) brightness(.9)'
            : 'saturate(.94)';
      const vegetationFilter = [seasonalVegetationFilter, campaignVegetationFilter]
        .filter(Boolean)
        .join(' ');
      const ambientBrightness = 0.82 + dayPalette.ambientLight * 0.18;
      const ambientSaturation = 0.78 + dayPalette.ambientLight * 0.22;
      const landscapeFilter = `${vegetationFilter ? `${vegetationFilter} ` : ''}brightness(${ambientBrightness}) saturate(${ambientSaturation})`.trim();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      ctx.translate(-cameraRef.current, 0);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(palette.skyTop));
      g.addColorStop(1, rgba(palette.skyBottom));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, worldW, h);
      const generatedLandscape = Boolean(
        generatedLayers.mountains && generatedLayers.meadow && generatedLayers.river,
      );
      if (generatedLandscape) {
        // Use the approved Yellowstone art layers as the geographic anchor.
        // They are mirrored panel-by-panel so the river keeps its perspective
        // while the camera still has a genuinely wide field to explore.
        // The generated art is a painted source layer, so apply the same
        // seasonal and day-light exposure to every layer before adding the
        // procedural fish, snow, sun and cloud passes.
        ctx.save();
        ctx.filter = landscapeFilter;
        drawMirroredPanoramaLayer(ctx, generatedLayers.mountains, worldW, h, 0.96, h * 0.64);
        drawMirroredPanoramaLayer(ctx, generatedLayers.meadow, worldW, h, 0.9);
        drawMirroredPanoramaLayer(ctx, generatedLayers.forestBack, worldW, h, 0.72, h * 0.74);
        // The source river panel is mirrored only for the asset preview. In
        // the live panorama it would reverse the bend at the panel join, so
        // the river is drawn once as a continuous ribbon below.
        drawContinuousGeneratedRiver(ctx, worldW, h, elapsed);
        drawMirroredPanoramaLayer(ctx, generatedLayers.foreground, worldW, h, 0.88);
        ctx.restore();
        drawPanoramaDepthDetails(ctx, worldW, h, palette, elapsed);
        drawSeasonalSnowCover(ctx, worldW, h, palette.snow, elapsed);
        // The generated panels contain a static cloud pass; the living sky is
        // drawn last so the sun and cloud drift remain animated and pausable.
        drawSkyMotion(ctx, worldW, w, cameraRef.current, h, elapsed, rainOvercast, dayPalette);
      } else {
        drawSkyMotion(ctx, worldW, w, cameraRef.current, h, elapsed, rainOvercast, dayPalette);
        drawLamarLandscape(ctx, worldW, h, palette, s.grass, visualFire);
      }

      // Keep generated layers and procedural fallbacks in the same seasonal
      // atmosphere. The strength is continuous, so a forced season reads as
      // a slow change in light instead of a hard palette cut.
      if (palette.tintAlpha > 0.001 || visualFire > 0.001) {
        ctx.save();
        ctx.fillStyle = rgba(palette.tint);
        // Generated layers already carry their own seasonal light. Keep the
        // tint restrained there so the sun remains a readable, shared source
        // of light while the fallback scene still receives the full shift.
        ctx.globalAlpha = generatedLandscape ? palette.tintAlpha * 0.45 : palette.tintAlpha;
        ctx.fillRect(0, 0, worldW, h * 0.86);
        if (visualFire > 0.001) {
          ctx.fillStyle = '#5d4037';
          ctx.globalAlpha = visualFire * 0.16;
          ctx.fillRect(0, h * 0.42, worldW, h * 0.58);
        }
        ctx.restore();
      }
      if (dayPalette.shadow > 0.02) {
        // Generated Yellowstone layers are intentionally bright source art.
        // A shared low-opacity blue night veil keeps the valley, water and
        // animals under one consistent moonlit exposure.
        ctx.save();
        ctx.fillStyle = rgba(dayPalette.skyTop, Math.min(0.48, dayPalette.shadow * 0.42));
        ctx.fillRect(0, 0, worldW, h * 0.9);
        ctx.fillStyle = rgba(dayPalette.horizonGlow, Math.min(0.08, dayPalette.horizonGlowAlpha * 0.18));
        ctx.fillRect(0, h * 0.32, worldW, h * 0.58);
        ctx.restore();
      }
      if (generatedLandscape) drawGeneratedWaterMotion(ctx, worldW, h, elapsed);
      else drawWaterMotion(ctx, worldW, h, elapsed);

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
        const tx = 24 + seeded(i, 41) * (worldW - 48);
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
        const sx = 20 + seeded(i, 51) * (worldW - 40);
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
        const gx = 12 + seeded(i, 61) * (worldW - 24);
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
      const foliage = prepareFoliage(worldW, h, elapsed);
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
        if (
          agent.kind === 'wolf' &&
          agent.id.endsWith('-2') &&
          wildlife.agents.some((other) => (
            other.kind === 'wolf' &&
            other.id !== agent.id &&
            other.opacity >= 0.05 &&
            Math.hypot(other.x - agent.x, (other.y - agent.y) * 0.5625) < 0.18
          ))
        ) continue;
        const x = agent.x * worldW;
        const y = agent.y * h;
        const anchorScale = agent.id.endsWith('-2') ? 0.82 : 1;
        const drawnHeight = FRAME_HEIGHT[agent.kind] * anchorScale * Math.min(w / 700, 1.4) * (0.84 + (agent.y - 0.61) * 0.8);
        // Let a body enter the frame as a whole. This avoids a screenshot
        // catching half an elk at a camera boundary while still allowing the
        // same individual to walk naturally across the panorama during a
        // drag.
        // The source silhouettes are wider than their nominal frame height;
        // leave enough horizontal breathing room that a drag never exposes a
        // clipped antler, tail, or hind leg at the viewport edge.
        const edgeMargin = drawnHeight * (agent.kind === 'rabbit' ? 0.78 : 1.34);
        if (x < cameraRef.current + edgeMargin || x > cameraRef.current + w - edgeMargin) continue;
        hits.push({ agent, hitX: x, hitY: y - drawnHeight * 0.42, hitR: Math.max(9, drawnHeight * 0.4) });
        const target = animalCtx ?? ctx;
        const left = x - bufferW / 2;
        const top = y - bufferH * 0.84;
        if (animalCtx) {
          animalCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          animalCtx.clearRect(0, 0, bufferW, bufferH);
          animalCtx.translate(-left, -top);
        }
        if (!drawCritterSheet(target, agent, x, y, w, elapsed, ambientDelta)) {
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

      hitRef.current = {
        critters: hits.map((hit) => ({ ...hit, hitX: hit.hitX - cameraRef.current })),
        plants: plantTips.map((tip) => ({ ...tip, x: tip.x - cameraRef.current })),
      };
      if (now - lastUiUpdate > 200) {
        lastUiUpdate = now;
        const selected = hitRef.current.critters.find((hit) => hit.agent.id === selectedRef.current);
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
            scene: {
              visualMode: 'state-slice',
              representativeCap: 1,
              sun: true,
              clouds: CLOUDS.length,
              fish: PANORAMA_FISH_ROUTES.length,
              waterSource: generatedLandscape ? 'generated-river-mask-panorama' : 'lamar-panorama',
              cameraX: cameraRef.current,
              cameraProgress: cameraRef.current / Math.max(1, maxCamera),
              worldWidth: worldW,
              viewportWidth: w,
            },
            environment: {
              clouds: CLOUDS.map((_, index) => cloudPosition(index, elapsed)),
              fish: PANORAMA_FISH_ROUTES.map((route) => ({ ...fishPosition(route, elapsed), size: route.size })),
              time: elapsed,
              visualSeason,
              visualDay,
              dayPhase: Math.floor(((visualDay % 5) + 5) % 5),
              dayPhaseName: dayPhaseLabel(dayPhaseAt(visualDay)),
              visualRain,
              visualFire,
              rainStrength: Math.max(0, Math.min(1, (visualRain - 0.45) / 0.55)),
              snowStrength: palette.snow,
            },
            runtime: {
              paused: s.paused,
              reducedMotion,
              documentHidden: document.hidden,
              motionScale,
              ambientDelta,
              motionDelta,
            },
            campaign: {
              day: s.campaign?.day ?? 1,
              totalDays: s.campaign?.totalDays ?? 100,
              act: s.campaign?.act ?? 'alarm',
              vegetation: campaignVegetation,
              cascadeSafeDays: s.campaign?.cascadeSafeDays ?? 0,
              activeEvent: s.campaign?.activeEvent ?? null,
              outcome: s.campaign?.outcome ?? null,
            },
            poses: [...visualPoses.entries()].map(([id, pose]) => ({ id, action: pose.action, blend: pose.blend, frame: pose.frame })),
            agents: wildlife.agents.map(({ id, kind, x, y, vx, vy, facing, heading, targetHeading, activity, gait, opacity, cover }) => ({ id, kind, x, y, vx, vy, facing, heading, targetHeading, activity, gait, opacity, cover })),
            statuses: (['wolf', 'deer', 'rabbit'] as WildlifeKind[]).map((kind) => {
              const agent = wildlife.agents.find((candidate) => candidate.kind === kind);
              return { kind, label: WILDLIFE_LABELS[kind], activity: agent?.activity ?? 'rest' };
            }),
          });
        }
      }

      // The first moonlight wash tones the painted landscape. This smaller
      // finishing veil also reaches fish, foliage and animal sprites so the
      // night exposure reads as one scene instead of leaving bright cut-outs.
      if (dayPalette.shadow > 0.02) {
        ctx.save();
        ctx.fillStyle = rgba(dayPalette.skyTop, Math.min(0.16, dayPalette.shadow * 0.18));
        ctx.fillRect(0, 0, worldW, h * 0.9);
        ctx.restore();
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
        ctx.fillRect(0, h * 0.48, worldW, h * 0.52);
        for (let i = 0; i < 9; i++) {
          const baseX = worldW * (0.09 + seeded(i, 301) * 0.82);
          const baseY = h * (0.76 + seeded(i, 302) * 0.16);
          const flameH = h * (0.08 + seeded(i, 303) * 0.11) * Math.max(0.55, visualFire);
          const sway = Math.sin(elapsed * (3.4 + seeded(i, 304) * 1.8) + i) * worldW * 0.009;
          ctx.globalAlpha = visualFire * (0.48 + seeded(i, 305) * 0.3);
          ctx.fillStyle = i % 2 ? '#e85d2a' : '#f59e43';
          ctx.beginPath();
          ctx.moveTo(baseX - worldW * 0.012, baseY);
          ctx.quadraticCurveTo(baseX - worldW * 0.026, baseY - flameH * 0.42, baseX + sway, baseY - flameH);
          ctx.quadraticCurveTo(baseX + worldW * 0.023, baseY - flameH * 0.47, baseX + worldW * 0.012, baseY);
          ctx.fill();
          ctx.globalAlpha = visualFire * 0.58;
          ctx.fillStyle = '#ffe2a1';
          ctx.beginPath();
          ctx.ellipse(baseX + sway * 0.4, baseY - flameH * 0.27, worldW * 0.006, flameH * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = visualFire * 0.5;
        ctx.fillStyle = '#f6b34a';
        for (let i = 0; i < 12; i++) {
          const ex = worldW * (0.08 + seeded(i, 306) * 0.84);
          const ey = h * (0.64 + seeded(i, 307) * 0.27) - elapsed * (4 + i % 4);
          ctx.beginPath();
          ctx.arc(ex, ey % (h * 0.34) + h * 0.52, 1.1 + (i % 3) * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        // Smoke rises slowly and bends with the same paused clock.
        ctx.globalAlpha = visualFire * 0.12;
        ctx.fillStyle = '#5d514b';
        for (let i = 0; i < 4; i++) {
          const sx = worldW * (0.2 + i * 0.2) + Math.sin(elapsed * 0.4 + i) * worldW * 0.02;
          const sy = h * (0.58 - i * 0.07);
          ctx.beginPath();
          ctx.ellipse(sx, sy, worldW * (0.035 + i * 0.008), h * (0.022 + i * 0.006), 0, 0, Math.PI * 2);
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
          const rx = (seeded(i, 321) * worldW + elapsed * (38 + (i % 7) * 8)) % worldW;
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
      // The generated Yellowstone layer already carries a clear sky and
      // painted ground. A white particle field over that artwork reads as
      // dust or stars unless the procedural fallback is active, so winter in
      // the generated panorama is conveyed by the cool tint and ground wash.
      if (palette.snow > 0.005 && !generatedLandscape) {
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${0.2 + palette.snow * 0.65})`;
        const flakes = Math.round(8 + palette.snow * 40);
        for (let i = 0; i < flakes; i++) {
          const sx = (seeded(i, 200) * worldW + elapsed * (8 + (i % 5) * 2) + Math.sin(elapsed * 0.6 + i) * 5) % worldW;
          const sy = (seeded(i, 201) * h + elapsed * (20 + (i % 7)) * 8) % h;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore();
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
    if (dragRef.current.active) return;
    const tip = hitTest(e.clientX, e.clientY);
    selectedRef.current = tip?.id ?? null;
    setTooltip(tip);
  };
  const onClick = (e: MouseEvent) => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    const tip = hitTest(e.clientX, e.clientY);
    selectedRef.current = tip?.id ?? null;
    setTooltip(tip);
  };
  const onLeave = () => {
    if (dragRef.current.active) return;
    selectedRef.current = null;
    setTooltip(null);
  };

  const clampCamera = (next: number) => {
    const canvas = ref.current;
    if (!canvas) return 0;
    const width = canvas.getBoundingClientRect().width;
    return Math.max(0, Math.min(Math.max(0, width * (WORLD_WIDTH_FACTOR - 1)), next));
  };

  const setCamera = (next: number) => {
    cameraRef.current = clampCamera(next);
    const viewport = ref.current?.getBoundingClientRect().width ?? 1;
    setCameraProgress(Math.max(0, Math.min(1, cameraRef.current / Math.max(1, viewport * (WORLD_WIDTH_FACTOR - 1)))));
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus();
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startCamera: cameraRef.current,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    selectedRef.current = null;
    setTooltip(null);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > 3) drag.moved = true;
    setCamera(drag.startCamera - delta);
  };

  const endPointerDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const canvas = ref.current;
    const viewport = canvas?.getBoundingClientRect().width ?? 0;
    if (e.key === 'Home') setCamera(0);
    else if (e.key === 'End') setCamera(viewport * (WORLD_WIDTH_FACTOR - 1));
    else setCamera(cameraRef.current + (e.key === 'ArrowRight' ? viewport * 0.22 : -viewport * 0.22));
  };

  return (
    <div className="eco-scene-wrap" ref={wrapRef}>
      <canvas
        ref={ref}
        className="eco-scene-canvas"
        tabIndex={0}
        role="img"
        aria-label="阳光和流云下的黄石河谷，灰狼、美洲赤鹿与野兔穿过草丛，游鱼在水中摆尾"
        onMouseMove={onMove}
        onClick={onClick}
        onMouseLeave={onLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onKeyDown={onKeyDown}
      />
      <div className="eco-pan-hud" aria-hidden="true">
          <span className="eco-pan-hud__hint">拖动浏览拉马谷</span>
          <span className="eco-pan-hud__track">
            <span
              className="eco-pan-hud__thumb"
              style={{ left: `${cameraProgress * 100}%` }}
            />
          </span>
        <span className="eco-pan-hud__keys">← →</span>
      </div>
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
