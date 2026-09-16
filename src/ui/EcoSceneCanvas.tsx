import { useEffect, useRef } from 'react';
import type { EcosystemState } from '../sim/types';

interface Props {
  state: EcosystemState;
}

/** 扁平插画风黄石场景（Canvas 2D） */
export function EcoSceneCanvas({ state }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;

      // 天空随季节
      const skies: Record<string, [string, string]> = {
        spring: ['#b3e5fc', '#e8f5e9'],
        summer: ['#81d4fa', '#fff9c4'],
        autumn: ['#ffe0b2', '#ffccbc'],
        winter: ['#e3f2fd', '#eceff1'],
      };
      const [c1, c2] = skies[state.season];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 远山
      ctx.fillStyle = state.season === 'winter' ? '#90a4ae' : '#81c784';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.45);
      ctx.lineTo(w * 0.2, h * 0.28);
      ctx.lineTo(w * 0.4, h * 0.42);
      ctx.lineTo(w * 0.55, h * 0.25);
      ctx.lineTo(w * 0.75, h * 0.4);
      ctx.lineTo(w, h * 0.3);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      // 草地
      ctx.fillStyle = state.fire ? '#8d6e63' : state.season === 'winter' ? '#cfd8dc' : '#aed581';
      ctx.fillRect(0, h * 0.55, w, h * 0.45);

      // 河流
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.moveTo(w * 0.55, h * 0.55);
      ctx.quadraticCurveTo(w * 0.5, h * 0.7, w * 0.62, h);
      ctx.lineTo(w * 0.72, h);
      ctx.quadraticCurveTo(w * 0.58, h * 0.7, w * 0.65, h * 0.55);
      ctx.fill();

      // 简单物种图标密度
      const drawCritter = (x: number, y: number, emoji: string, size: number) => {
        ctx.font = `${size}px serif`;
        ctx.fillText(emoji, x, y);
      };

      const rabbitN = Math.min(12, Math.ceil(state.rabbits / 50));
      const elkN = Math.min(8, Math.ceil(state.elk / 40));
      const wolfN = Math.min(6, Math.ceil(state.wolves / 8));
      const shrubN = Math.min(10, Math.ceil(state.shrubs / 400));

      for (let i = 0; i < shrubN; i++) {
        drawCritter(30 + i * 40, h * 0.62 + (i % 3) * 12, '🌳', 18);
      }
      for (let i = 0; i < rabbitN; i++) {
        drawCritter(40 + i * 36, h * 0.78 + (i % 2) * 10, '🐇', 16);
      }
      for (let i = 0; i < elkN; i++) {
        drawCritter(w * 0.15 + i * 50, h * 0.68 + (i % 2) * 14, '🦌', 20);
      }
      for (let i = 0; i < wolfN; i++) {
        drawCritter(w * 0.7 + i * 28, h * 0.72 + (i % 2) * 8, '🐺', 18);
      }

      if (state.fire) {
        ctx.fillStyle = 'rgba(255,87,34,0.35)';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '28px serif';
        for (let i = 0; i < 5; i++) {
          ctx.fillText('🔥', 60 + i * 70, h * 0.5 + (i % 2) * 20);
        }
      }

      // 降雨示意
      if (state.rainfall > 0.55) {
        ctx.strokeStyle = 'rgba(100,180,255,0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
          const rx = (i * 37 + state.tick * 3) % w;
          const ry = (i * 53 + state.tick * 5) % (h * 0.55);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + 2, ry + 8);
          ctx.stroke();
        }
      }
    };

    paint();
    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [state]);

  return <canvas ref={ref} className="eco-scene-canvas" />;
}
