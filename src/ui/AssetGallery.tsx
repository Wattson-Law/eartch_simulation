import { useEffect, useMemo, useRef, useState } from 'react';
import {
  drawEarthAtlasFrame,
  drawSheetFrameAnchored,
  loadEcosystemManifest,
  loadImage,
  type EcosystemAction,
  type EcosystemAnimal,
  type EcosystemManifest,
  type SceneLayerKey,
  type SheetMeta,
} from '../assetsPaths';
import './AssetGallery.css';

interface Props {
  onBack: () => void;
}

const ANIMALS: EcosystemAnimal[] = ['wolf', 'elk', 'rabbit'];
const ACTIONS: EcosystemAction[] = ['idle', 'walk', 'run', 'howl', 'graze', 'hop', 'alert'];
const ACTION_LABELS: Record<EcosystemAction, string> = {
  idle: '待机',
  walk: '行走',
  run: '奔跑',
  howl: '嚎叫',
  graze: '吃草',
  hop: '跳跃',
  alert: '警觉',
};
const ANIMAL_LABELS: Record<EcosystemAnimal, string> = {
  wolf: '灰狼',
  elk: '美洲赤鹿',
  rabbit: '野兔',
};
const LAYER_LABELS: Record<SceneLayerKey, string> = {
  sky: '天空',
  mountains: '远山',
  meadow: '草甸',
  forestBack: '森林后景',
  river: '河流',
  foreground: '前景',
};
const LAYER_ORDER: SceneLayerKey[] = ['sky', 'mountains', 'meadow', 'forestBack', 'river', 'foreground'];

const PROP_ANCHORS: Record<string, [number, number]> = {
  'pine-cluster': [0.11, 0.68],
  pine: [0.86, 0.69],
  aspen: [0.29, 0.67],
  'golden-shrub': [0.76, 0.79],
  willow: [0.61, 0.77],
  'distant-pines': [0.47, 0.53],
  'river-rocks': [0.59, 0.91],
  'moss-rock': [0.72, 0.91],
  'grass-daisies': [0.24, 0.91],
  reeds: [0.66, 0.84],
  'grass-flowers': [0.41, 0.91],
  cloud: [0.75, 0.23],
};

function useLoadedImage(src: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let active = true;
    if (!src) return () => {
      active = false;
    };
    void loadImage(src)
      .then((loaded) => {
        if (active) setImage(loaded);
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [src]);
  return image;
}

function EarthPreview({ meta }: { meta: NonNullable<EcosystemManifest['earth']> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const image = useLoadedImage(meta.atlas);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(Math.round(meta.fps ?? 8));
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let previous = performance.now();
    let active = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = (now: number) => {
      if (!active) return;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const delta = Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (!paused) elapsedRef.current += delta;
      const nextFrame = paused ? frameRef.current : Math.floor(elapsedRef.current * fps) % Math.max(1, meta.frames);
      frameRef.current = nextFrame;
      setFrame((current) => (current === nextFrame ? current : nextFrame));
      ctx.clearRect(0, 0, width, height);
      const size = Math.min(width, height) * 0.8;
      ctx.imageSmoothingEnabled = true;
      drawEarthAtlasFrame(ctx, image, meta, nextFrame, (width - size) / 2, (height - size) / 2, size, size);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [fps, image, meta, paused]);

  const step = (amount: number) => {
    const next = (frameRef.current + amount + meta.frames) % Math.max(1, meta.frames);
    frameRef.current = next;
    elapsedRef.current = next / Math.max(1, fps);
    setFrame(next);
  };

  return (
    <section className="asset-card asset-earth-card">
      <div className="asset-card-heading">
        <div>
          <h3>伪 3D 地球自转</h3>
          <p>8 列 × 6 行图集 · {meta.frames} 帧 · {meta.frameW}×{meta.frameH}</p>
        </div>
        <span className="asset-pill">earth</span>
      </div>
      <canvas ref={canvasRef} className="asset-earth-canvas" aria-label="地球旋转预览" />
      <div className="asset-controls">
        <button type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? '播放' : '暂停'}
        </button>
        <button type="button" onClick={() => step(-1)} aria-label="上一帧">‹</button>
        <button type="button" onClick={() => step(1)} aria-label="下一帧">›</button>
        <label>
          FPS
          <input type="number" min={1} max={30} value={fps} onChange={(event) => setFps(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />
        </label>
        <span className="asset-frame-readout">帧 {frame + 1}/{meta.frames}</span>
      </div>
    </section>
  );
}

function SheetPreview({ meta, label }: { meta: SheetMeta; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const image = useLoadedImage(meta.src);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(Math.round(meta.fps ?? 8));
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let previous = performance.now();
    let active = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const draw = (now: number) => {
      if (!active) return;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const delta = Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (!paused) elapsedRef.current += delta;
      const nextFrame = paused ? frameRef.current : Math.floor(elapsedRef.current * fps) % Math.max(1, meta.frames);
      frameRef.current = nextFrame;
      setFrame((current) => (current === nextFrame ? current : nextFrame));
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min((width * 0.88) / meta.frameW, (height * 0.84) / meta.frameH);
      drawSheetFrameAnchored(ctx, image, meta, nextFrame, width / 2, height * 0.9, scale, false);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [fps, image, meta, paused]);

  const step = (amount: number) => {
    const next = (frameRef.current + amount + meta.frames) % Math.max(1, meta.frames);
    frameRef.current = next;
    elapsedRef.current = next / Math.max(1, fps);
    setFrame(next);
  };

  return (
    <div className="asset-sheet-preview">
      <div className="asset-sheet-title">
        <strong>{label}</strong>
        <span>{meta.frameW}×{meta.frameH} · {meta.frames} 帧</span>
      </div>
      <canvas ref={canvasRef} className="asset-sheet-canvas" aria-label={`${label}动画预览`} />
      <div className="asset-controls asset-controls--compact">
        <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? '播放' : '暂停'}</button>
        <button type="button" onClick={() => step(-1)} aria-label={`${label}上一帧`}>‹</button>
        <button type="button" onClick={() => step(1)} aria-label={`${label}下一帧`}>›</button>
        <label>
          FPS
          <input type="number" min={1} max={30} value={fps} onChange={(event) => setFps(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />
        </label>
        <span className="asset-frame-readout">{frame + 1}/{meta.frames}</span>
      </div>
    </div>
  );
}

function ScenePreview({ manifest }: { manifest: EcosystemManifest }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = manifest.scene;
  const layerEntries = useMemo(() => {
    if (!scene) return [] as [SceneLayerKey, { src: string }][];
    return LAYER_ORDER.filter((key) => scene.layers[key]).map((key) => [key, scene.layers[key]!] as [SceneLayerKey, { src: string }]);
  }, [scene]);
  const [enabledLayers, setEnabledLayers] = useState<Partial<Record<SceneLayerKey, boolean>>>({});
  const [images, setImages] = useState<Partial<Record<SceneLayerKey, HTMLImageElement>>>({});
  const [props, setProps] = useState<{ id: string; src: string; width: number; height: number; image: HTMLImageElement }[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      layerEntries.map(async ([key, meta]) => {
        try {
          return [key, await loadImage(meta.src)] as const;
        } catch {
          return null;
        }
      }),
    ).then((loaded) => {
      if (!active) return;
      setImages(Object.fromEntries(loaded.filter((entry): entry is readonly [SceneLayerKey, HTMLImageElement] => entry != null)));
    });
    const propEntries = Object.entries(manifest.props ?? {});
    void Promise.all(
      propEntries.map(async ([id, meta]) => {
        try {
          return { id, ...meta, image: await loadImage(meta.src) };
        } catch {
          return null;
        }
      }),
    ).then((loaded) => {
      if (active) setProps(loaded.filter((entry): entry is { id: string; src: string; width: number; height: number; image: HTMLImageElement } => entry != null));
    });
    return () => {
      active = false;
    };
  }, [layerEntries, manifest.props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let active = true;
    let phase = 0;
    let previous = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const draw = (now: number) => {
      if (!active) return;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      phase += Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#d7ecf0';
      ctx.fillRect(0, 0, width, height);
      const scale = Math.min(width / scene.width, height / scene.height);
      const drawW = scene.width * scale;
      const drawH = scene.height * scale;
      const offsetX = (width - drawW) / 2;
      const offsetY = (height - drawH) / 2;
      for (const key of LAYER_ORDER) {
        if (enabledLayers[key] === false) continue;
        const image = images[key];
        if (image) ctx.drawImage(image, offsetX, offsetY, drawW, drawH);
      }
      for (const prop of props) {
        const anchor = PROP_ANCHORS[prop.id] ?? [0.5, 0.86];
        const propW = prop.width * scale;
        const propH = prop.height * scale;
        ctx.drawImage(prop.image, offsetX + anchor[0] * drawW - propW / 2, offsetY + anchor[1] * drawH - propH, propW, propH);
      }
      if (enabledLayers.river !== false && images.river) {
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const y = offsetY + drawH * (0.58 + ((i * 0.043 + phase * 0.025) % 0.34));
          const x = offsetX + drawW * (0.49 + ((i * 0.071 + phase * 0.018) % 0.2));
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + drawW * 0.025, y - 2, x + drawW * 0.05, y);
          ctx.stroke();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [enabledLayers, images, props, scene]);

  if (!scene) {
    return <section className="asset-card"><p className="asset-empty">manifest 没有 scene 项目。</p></section>;
  }

  return (
    <section className="asset-card asset-scene-card">
      <div className="asset-card-heading">
        <div>
          <h3>黄石生态分层合成</h3>
          <p>{scene.width}×{scene.height} · 仅显示 manifest 中实际存在的图层与 props</p>
        </div>
        <span className="asset-pill">scene</span>
      </div>
      <canvas ref={canvasRef} className="asset-scene-canvas" aria-label="黄石生态场景分层预览" />
      <div className="asset-layer-controls">
        {layerEntries.map(([key]) => (
          <label key={key} className="asset-toggle">
            <input
              type="checkbox"
              checked={enabledLayers[key] !== false}
              onChange={(event) => setEnabledLayers((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {LAYER_LABELS[key]}
            {!images[key] && <span className="asset-missing">未加载</span>}
          </label>
        ))}
      </div>
      <p className="asset-prop-note">Props：{props.length > 0 ? props.map((prop) => prop.id).join(' · ') : 'manifest 中暂无可加载项目'}</p>
    </section>
  );
}

function AnimalGallery({ manifest }: { manifest: EcosystemManifest }) {
  const animals = ANIMALS.filter((animal) => Object.keys(manifest.animals[animal] ?? {}).length > 0);
  return (
    <section className="asset-card asset-animals-card">
      <div className="asset-card-heading">
        <div>
          <h3>动物动画帧</h3>
          <p>选择动作检查帧间一致性；每个预览独立控制 FPS、暂停和逐帧。</p>
        </div>
        <span className="asset-pill">animals</span>
      </div>
      <div className="asset-animals-grid">
        {animals.map((animal) => (
          <AnimalCard key={animal} animal={animal} actions={ACTIONS.filter((action) => manifest.animals[animal]?.[action])} manifest={manifest} />
        ))}
      </div>
      {animals.length === 0 && <p className="asset-empty">manifest 没有可加载的动物动作。</p>}
    </section>
  );
}

function AnimalCard({ animal, actions, manifest }: { animal: EcosystemAnimal; actions: EcosystemAction[]; manifest: EcosystemManifest }) {
  const [action, setAction] = useState<EcosystemAction | undefined>(actions[0]);
  const selectedAction = action && actions.includes(action) ? action : actions[0];
  const meta = selectedAction ? manifest.animals[animal]?.[selectedAction] : undefined;
  return (
    <div className="asset-animal-card">
      <div className="asset-animal-heading">
        <strong>{ANIMAL_LABELS[animal]}</strong>
        <select value={selectedAction ?? ''} onChange={(event) => setAction(event.target.value as EcosystemAction)} aria-label={`${ANIMAL_LABELS[animal]}动作`}>
          {actions.map((item) => <option key={item} value={item}>{ACTION_LABELS[item]}</option>)}
        </select>
      </div>
      {meta ? <SheetPreview key={`${animal}:${selectedAction}`} meta={meta} label={`${ANIMAL_LABELS[animal]} · ${ACTION_LABELS[selectedAction!]}`} /> : <p className="asset-empty">没有可用动作。</p>}
    </div>
  );
}

export function AssetGallery({ onBack }: Props) {
  const [manifest, setManifest] = useState<EcosystemManifest | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void loadEcosystemManifest().then((loaded) => {
      if (active) setManifest(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="asset-gallery">
      <div className="asset-gallery-toolbar">
        <button type="button" className="asset-back-button" onClick={onBack}>← 返回黄石生态区</button>
        <div>
          <h2>生态素材预览</h2>
          <p>逐项核对地球、动物动画、分层背景与 props</p>
        </div>
        {manifest && <span className="asset-version">manifest {manifest.version}</span>}
      </div>
      {manifest === undefined && <div className="asset-loading">正在读取 ecosystem-v1/manifest.json…</div>}
      {manifest === null && <div className="asset-error">未找到可用 manifest。预览页不会生成占位图，请先放入完整素材包。</div>}
      {manifest && (
        <div className="asset-gallery-content">
          {manifest.earth ? <EarthPreview meta={manifest.earth} /> : <section className="asset-card"><p className="asset-empty">manifest 没有 earth 图集。</p></section>}
          <AnimalGallery manifest={manifest} />
          <ScenePreview manifest={manifest} />
        </div>
      )}
    </div>
  );
}
