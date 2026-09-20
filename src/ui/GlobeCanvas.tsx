import { useEffect, useRef, useState } from 'react';
import { assetUrl, loadImage } from '../assetsPaths';
import { createGlobeLookup, projectLocation, renderGlobeTexture, TAU, wrapAngle, YELLOWSTONE } from './globeProjection';
import { drawSpaceBackdrop, SPACE_STAR_COUNT, SPACE_STAR_LAYERS } from './spaceBackdrop';

interface Props { onEnterYellowstone: () => void }
interface GlobeControls { toggle: () => void; locate: () => void }

const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 512;
const AUTO_SPEED = 0.09;

/** A painted fallback stays rotatable when the optional artwork is unavailable. */
function fallbackMap(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#69b9c5';
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const continents = [
    [[-168,66],[-143,70],[-125,58],[-106,72],[-61,54],[-82,23],[-99,16],[-122,33],[-133,55]],
    [[-80,10],[-61,10],[-36,-7],[-51,-24],[-69,-55],[-77,-22]],
    [[-53,83],[-20,77],[-43,59],[-61,66]],
    [[-11,36],[-9,57],[25,71],[54,58],[101,76],[178,61],[145,42],[119,19],[105,-7],[77,8],[48,30]],
    [[-17,34],[12,37],[36,29],[50,10],[31,-34],[16,-35],[-4,4],[-17,14]],
    [[112,-22],[132,-11],[153,-24],[146,-39],[116,-34]],
    [[-180,-72],[-100,-76],[0,-71],[90,-77],[180,-73],[180,-90],[-180,-90]],
  ];
  continents.forEach((points, index) => {
    ctx.beginPath();
    points.forEach(([longitude, latitude], i) => {
      const x = (longitude + 180) / 360 * TEXTURE_WIDTH;
      const y = (90 - latitude) / 180 * TEXTURE_HEIGHT;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = index === 2 || index === 6 ? '#f6efd8' : '#afc47e';
    ctx.strokeStyle = '#385960';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
  });
}

/** Continuous orthographic projection on Canvas 2D; no 3D scene or frame atlas. */
export function GlobeCanvas({ onEnterYellowstone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<GlobeControls | null>(null);
  const [autoRotate, setAutoRotate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = media.matches;
    let spinning = !reducedMotion;
    let longitude = YELLOWSTONE.longitude + 0.2;
    let velocity = 0;
    let target: number | null = null;
    let time = 0;
    let previousNow = performance.now();
    let raf = 0;
    let disposed = false;
    let width = 0, height = 0, cx = 0, cy = 0, radius = 0;
    let hoverHot = false;
    let textureSource = 'painted-fallback';
    let lastRenderedLongitude = NaN;
    let drag: { id: number; startX: number; startY: number; lastX: number; lastAt: number; moved: boolean; startedOnHotspot: boolean } | null = null;
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = TEXTURE_WIDTH; mapCanvas.height = TEXTURE_HEIGHT;
    const mapCtx = mapCanvas.getContext('2d', { willReadFrequently: true })!;
    fallbackMap(mapCtx);
    let texture = mapCtx.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data;
    const sphere = document.createElement('canvas');
    const sphereCtx = sphere.getContext('2d')!;
    let lookup = createGlobeLookup(320, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    let pixels = new ImageData(lookup.size, lookup.size);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = width / 2; cy = height * 0.475;
      radius = Math.min(width * 0.36, height * 0.395);
      const size = Math.min(560, Math.max(240, Math.round(radius * 2 * dpr / 8) * 8));
      if (sphere.width !== size) {
        sphere.width = sphere.height = size;
        lookup = createGlobeLookup(size, TEXTURE_WIDTH, TEXTURE_HEIGHT);
        pixels = new ImageData(size, size);
      }
      lastRenderedLongitude = NaN;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const installTexture = (image: HTMLImageElement) => {
      if (disposed) return;
      mapCtx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      mapCtx.drawImage(image, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      texture = mapCtx.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data;
      textureSource = 'storybook-map';
      lastRenderedLongitude = NaN;
    };
    void loadImage(assetUrl('assets/ecosystem-v1/earth/map.png')).then(installTexture).catch(() => { /* keep painted fallback */ });

    const hotspot = () => {
      const point = projectLocation(YELLOWSTONE.longitude, YELLOWSTONE.latitude, longitude);
      return { x: cx + point.x * radius, y: cy + point.y * radius, visible: point.z > 0.07, depth: point.z };
    };
    const localPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const overHotspot = (x: number, y: number) => {
      const hot = hotspot();
      return hot.visible && Math.hypot(x - hot.x, y - hot.y) < 22;
    };
    const toggle = () => {
      spinning = !spinning; velocity = 0; target = null;
      setAutoRotate(spinning);
    };
    const locate = () => {
      spinning = false; velocity = 0; setAutoRotate(false);
      if (reducedMotion) { longitude = YELLOWSTONE.longitude; target = null; }
      else target = YELLOWSTONE.longitude;
    };
    controlsRef.current = { toggle, locate };

    const draw = (now: number) => {
      if (disposed) return;
      const delta = document.hidden ? 0 : Math.min(0.05, Math.max(0, (now - previousNow) / 1000));
      previousNow = now;
      if (!drag) {
        if (target !== null) {
          const difference = wrapAngle(target - longitude);
          longitude = wrapAngle(longitude + difference * (1 - Math.exp(-delta * 6)));
          if (Math.abs(difference) < 0.0001) { longitude = target; target = null; }
        } else {
          const decay = Math.exp(-4 * delta);
          longitude = wrapAngle(longitude + velocity * (1 - decay) / 4 + (spinning ? AUTO_SPEED * delta : 0));
          velocity *= decay;
          if (Math.abs(velocity) < 0.0001) velocity = 0;
        }
      }
      if (spinning && !drag) time += delta;
      if (width && height) {
        ctx.clearRect(0, 0, width, height);
        drawSpaceBackdrop(ctx, width, height, time, longitude);

        const atmosphere = ctx.createRadialGradient(cx - radius * .18, cy - radius * .2, radius * .82, cx, cy, radius * 1.16);
        atmosphere.addColorStop(0, 'rgba(94, 194, 216, 0)');
        atmosphere.addColorStop(.83, 'rgba(103, 208, 224, 0.04)');
        atmosphere.addColorStop(1, 'rgba(105, 200, 222, 0.22)');
        ctx.fillStyle = atmosphere;
        ctx.beginPath(); ctx.arc(cx, cy, radius * 1.16, 0, TAU); ctx.fill();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.18);
        ctx.strokeStyle = 'rgba(185, 217, 225, 0.11)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.34, radius * .4, 0, 0, TAU); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(178, 227, 230, 0.38)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(cx, cy, radius + 6, 0, TAU); ctx.stroke();
        if (!Number.isFinite(lastRenderedLongitude) || Math.abs(longitude - lastRenderedLongitude) > 0.000001) {
          renderGlobeTexture(pixels.data, texture, lookup, longitude);
          sphereCtx.putImageData(pixels, 0, 0);
          lastRenderedLongitude = longitude;
        }
        ctx.drawImage(sphere, cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.strokeStyle = '#314e59'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(cx, cy, radius - .5, 0, TAU); ctx.stroke();
        const hot = hotspot();
        if (hot.visible) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (hot.depth - .07) / .14);
          ctx.fillStyle = 'rgba(255,242,206,0.48)';
          ctx.beginPath(); ctx.arc(hot.x, hot.y, 13 + Math.sin(time * 2) * 1.5, 0, TAU); ctx.fill();
          ctx.fillStyle = hoverHot ? '#c97742' : '#de9452'; ctx.strokeStyle = '#fff9e7'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(hot.x, hot.y, hoverHot ? 7.5 : 6, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.font = '600 12px "Microsoft YaHei", system-ui, sans-serif'; ctx.textAlign = 'center';
          const labelX = Math.max(48, Math.min(width - 48, hot.x));
          ctx.fillStyle = '#fff8e5'; ctx.strokeStyle = '#9caa88'; ctx.lineWidth = .8;
          ctx.beginPath(); ctx.roundRect(labelX - 41, hot.y - 37, 82, 24, 12); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#425441'; ctx.fillText('黄石国家公园', labelX, hot.y - 21);
          ctx.restore();
        }
        const degrees = Math.round(longitude * 180 / Math.PI);
        canvas.setAttribute('aria-valuenow', String(degrees));
        canvas.setAttribute('aria-valuetext', `朝向${Math.abs(degrees)}度${degrees < 0 ? '西经' : '东经'}`);
        if (import.meta.env.DEV) canvas.dataset.globe = JSON.stringify({ longitude, velocity, time, spinning, dragging: !!drag, targeting: target !== null, source: textureSource, backdrop: 'layered-space', spaceLayers: SPACE_STAR_LAYERS.length, stars: SPACE_STAR_COUNT, hotspot: hot, radius, cx, cy, renderSize: lookup.size });
      }
      raf = requestAnimationFrame(draw);
    };

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      const point = localPoint(event);
      if (Math.hypot(point.x - cx, point.y - cy) > radius + 10) return;
      canvas.focus({ preventScroll: true });
      target = null; velocity = 0;
      drag = { id: event.pointerId, startX: point.x, startY: point.y, lastX: point.x, lastAt: event.timeStamp, moved: false, startedOnHotspot: overHotspot(point.x, point.y) };
      canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
    };
    const onMove = (event: PointerEvent) => {
      const point = localPoint(event);
      if (drag?.id === event.pointerId) {
        if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 6) drag.moved = true;
        if (drag.moved) {
          const change = -(point.x - drag.lastX) / radius;
          longitude = wrapAngle(longitude + change);
          const seconds = Math.max(.008, (event.timeStamp - drag.lastAt) / 1000);
          velocity = reducedMotion ? 0 : Math.max(-3, Math.min(3, velocity * .4 + change / seconds * .6));
        }
        drag.lastX = point.x; drag.lastAt = event.timeStamp;
      } else {
        hoverHot = overHotspot(point.x, point.y);
        canvas.style.cursor = hoverHot ? 'pointer' : Math.hypot(point.x - cx, point.y - cy) <= radius ? 'grab' : 'default';
      }
    };
    const onUp = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      const point = localPoint(event);
      const enter = !drag.moved && drag.startedOnHotspot && overHotspot(point.x, point.y);
      if (event.timeStamp - drag.lastAt > 120 || !drag.moved) velocity = 0;
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = 'grab';
      if (enter) onEnterYellowstone();
    };
    const onCancel = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag = null; velocity = 0; hoverHot = false; canvas.style.cursor = 'grab';
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); target = null; velocity = 0;
        longitude = wrapAngle(longitude + (event.key === 'ArrowRight' ? .15 : -.15));
      } else if (event.key === 'Home') { event.preventDefault(); locate(); }
      else if (event.key === ' ') { event.preventDefault(); toggle(); }
      else if (event.key === 'Enter') { event.preventDefault(); onEnterYellowstone(); }
    };
    const onMotionPreference = () => {
      reducedMotion = media.matches;
      if (reducedMotion) { spinning = false; velocity = 0; target = null; setAutoRotate(false); }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', onCancel);
    canvas.addEventListener('keydown', onKey);
    media.addEventListener('change', onMotionPreference);
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); controlsRef.current = null;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('lostpointercapture', onCancel);
      canvas.removeEventListener('keydown', onKey);
      media.removeEventListener('change', onMotionPreference);
    };
  }, [onEnterYellowstone]);

  return (
    <div className="globe-wrap">
      <div className="globe-heading">
        <span className="globe-eyebrow">OUR LIVING EARTH</span>
        <h2>从小地球，走进黄石</h2>
        <p>转动世界，寻找森林、河流与它们的居民。</p>
      </div>
      <canvas ref={canvasRef} className="globe-canvas" role="slider" tabIndex={0} aria-label="旋转地球" aria-valuemin={-180} aria-valuemax={180} aria-valuenow={-99} aria-describedby="globe-help" />
      <div className="globe-actions">
        <p className="globe-hint" id="globe-help">左右拖动旋转 · 点击黄石标记进入<span className="globe-keyboard-hint">方向键旋转，空格暂停，Home 定位，Enter 进入</span></p>
        <div className="globe-controls">
          <button type="button" className="globe-control" aria-pressed={!autoRotate} onClick={() => controlsRef.current?.toggle()}>{autoRotate ? '暂停自转' : '继续自转'}</button>
          <button type="button" className="globe-control" onClick={() => controlsRef.current?.locate()}>定位黄石</button>
          <button type="button" className="enter-btn" onClick={onEnterYellowstone}>进入黄石生态区 <span aria-hidden="true">↗</span></button>
        </div>
      </div>
    </div>
  );
}
