import { useEffect, useRef } from 'react';
import {
  PLANET_EARTH,
  PIXEL_EARTH_FRAME_COUNT,
  loadImage,
  pixelEarthFrame,
} from '../assetsPaths';

interface Props {
  onEnterYellowstone: () => void;
}

/** Canvas 2D 扁平小地球：Kenney 贴图自转 + 黄石热点可点 */
export function GlobeCanvas({ onEnterYellowstone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const hoverHotRef = useRef(false);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let cancelled = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const kenney = { img: null as HTMLImageElement | null };
    const pixelFrames: HTMLImageElement[] = [];

    void (async () => {
      try {
        kenney.img = await loadImage(PLANET_EARTH);
      } catch {
        /* fallback below */
      }
      const loads = Array.from({ length: PIXEL_EARTH_FRAME_COUNT }, (_, i) =>
        loadImage(pixelEarthFrame(i + 1)).catch(() => null),
      );
      const imgs = await Promise.all(loads);
      for (const im of imgs) {
        if (im) pixelFrames.push(im);
      }
    })();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawProceduralFallback = (cx: number, cy: number, r: number) => {
      const ocean = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
      ocean.addColorStop(0, '#5ec8e8');
      ocean.addColorStop(1, '#2a6f9e');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const a = angleRef.current;
      const lands = [
        { dx: -0.35, dy: -0.1, rw: 0.45, rh: 0.35, color: '#7cbc4a' },
        { dx: 0.25, dy: 0.05, rw: 0.38, rh: 0.42, color: '#8fbf5a' },
        { dx: -0.05, dy: 0.35, rw: 0.5, rh: 0.28, color: '#6aa84f' },
        { dx: 0.4, dy: -0.35, rw: 0.25, rh: 0.2, color: '#9ccc65' },
      ];
      for (const land of lands) {
        const lx = cx + Math.cos(a) * land.dx * r * 2 + Math.sin(a) * land.dy * r * 0.3;
        const ly = cy + land.dy * r * 1.2;
        ctx.beginPath();
        ctx.ellipse(lx, ly, land.rw * r, land.rh * r, a * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = land.color;
        ctx.fill();
      }
      ctx.restore();
    };

    const drawEarth = (cx: number, cy: number, r: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      if (kenney.img?.complete && kenney.img.naturalWidth > 0) {
        ctx.translate(cx, cy);
        ctx.rotate(angleRef.current * 0.35);
        const size = r * 2.15;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(kenney.img, -size / 2, -size / 2, size, size);
      } else if (pixelFrames.length > 0) {
        const fi = Math.floor(frameRef.current) % pixelFrames.length;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pixelFrames[fi], cx - r, cy - r, r * 2, r * 2);
      } else {
        ctx.restore();
        drawProceduralFallback(cx, cy, r);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
      }

      const hotAngle = angleRef.current + 0.6;
      const visible = Math.cos(hotAngle) > -0.15;
      if (visible) {
        // 热点坐标基于未旋转的屏幕空间：取消旋转变换后画
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        const hx = cx + Math.sin(hotAngle) * r * 0.55;
        const hy = cy - r * 0.18;
        const pulse = 1 + Math.sin(performance.now() / 400) * 0.08;
        ctx.beginPath();
        ctx.arc(hx, hy, 10 * pulse * (hoverHotRef.current ? 1.25 : 1), 0, Math.PI * 2);
        ctx.fillStyle = hoverHotRef.current ? '#ff7043' : '#ff8a65';
        ctx.fill();
        ctx.strokeStyle = '#fff3e0';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = '#fff8e1';
        ctx.textAlign = 'center';
        ctx.fillText('Yellowstone', hx, hy - 16);
        ctx.fillText('点击进入', hx, hy + 26);
      }
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      if (cancelled) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2 - 10;
      const r = Math.min(w, h) * 0.32;

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const sx = (Math.sin(i * 12.3 + angleRef.current * 0.2) * 0.5 + 0.5) * w;
        const sy = (Math.cos(i * 7.1) * 0.5 + 0.5) * h;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.1})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx + 6, cy + 10, r * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();

      drawEarth(cx, cy, r);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#e8f4ff';
      ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('小地球', cx, 36);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#a8c0d8';
      ctx.fillText('我做了一个存活在电脑里的地球', cx, 56);

      angleRef.current += 0.008;
      frameRef.current += 0.12;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    const hitTest = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2 - 10;
      const r = Math.min(w, h) * 0.32;
      const hotAngle = angleRef.current + 0.6;
      const visible = Math.cos(hotAngle) > -0.15;
      if (!visible) return false;
      const hx = cx + Math.sin(hotAngle) * r * 0.55;
      const hy = cy - r * 0.18;
      const dx = x - hx;
      const dy = y - hy;
      return dx * dx + dy * dy < 22 * 22;
    };

    const onMove = (e: MouseEvent) => {
      hoverHotRef.current = hitTest(e.clientX, e.clientY);
      canvas.style.cursor = hoverHotRef.current ? 'pointer' : 'default';
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2 - 10;
      const r = Math.min(w, h) * 0.32;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r || hitTest(e.clientX, e.clientY)) {
        onEnterYellowstone();
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [onEnterYellowstone]);

  return (
    <div className="globe-wrap">
      <canvas ref={canvasRef} className="globe-canvas" />
      <div className="globe-actions">
        <p className="globe-hint">点击地球或橙色热点进入黄石生态区</p>
        <button type="button" className="enter-btn" onClick={onEnterYellowstone}>
          进入黄石生态区
        </button>
      </div>
    </div>
  );
}
