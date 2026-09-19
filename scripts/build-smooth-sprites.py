#!/usr/bin/env python3
"""Build smoother local sprite sheets from existing transparent key poses.

The generated frames keep every original key pose exactly at indices 0, 4, 8...
and fill the in-between frames with source-prioritized, alpha-aware optical-flow
warps. This is an offline asset processor; the app gains no runtime dependency.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw


ANIMATIONS: tuple[tuple[str, str], ...] = (
    ("wolf", "walk"),
    ("wolf", "run"),
    ("wolf", "howl"),
    ("elk", "walk"),
    ("elk", "run"),
    ("elk", "graze"),
    ("rabbit", "hop"),
    ("rabbit", "run"),
    ("rabbit", "alert"),
)

ORIGINAL_FPS: dict[tuple[str, str], float] = {
    ("wolf", "walk"): 10,
    ("wolf", "run"): 14,
    ("wolf", "howl"): 6,
    ("elk", "walk"): 10,
    ("elk", "run"): 14,
    ("elk", "graze"): 6,
    ("rabbit", "hop"): 10,
    ("rabbit", "run"): 14,
    ("rabbit", "alert"): 6,
}

STEPS_PER_KEY = 4
FRAME_W = 384
FRAME_H = 256


@dataclass(frozen=True)
class AnimationResult:
    animal: str
    action: str
    output: str
    frames: int
    fps: float
    dimensions: tuple[int, int]
    unique_frames: int
    keyframes_exact: bool
    min_adjacent_delta: float
    mean_adjacent_delta: float
    alpha_fringe_pixels: int


def read_rgba(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    arr = np.asarray(image, dtype=np.uint8)
    if arr.shape != (FRAME_H, FRAME_W, 4):
        raise ValueError(f"{path} has {arr.shape[1]}x{arr.shape[0]}, expected {FRAME_W}x{FRAME_H}")
    return arr


def write_rgba(path: Path, arr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr.astype(np.uint8), "RGBA").save(path)


def split_sheet(path: Path, frame_count: int) -> list[np.ndarray]:
    sheet = Image.open(path).convert("RGBA")
    if sheet.height != FRAME_H or sheet.width != FRAME_W * frame_count:
        raise ValueError(f"{path} has {sheet.width}x{sheet.height}, expected {FRAME_W * frame_count}x{FRAME_H}")
    arr = np.asarray(sheet, dtype=np.uint8)
    return [arr[:, i * FRAME_W : (i + 1) * FRAME_W, :].copy() for i in range(frame_count)]


def save_sheet(path: Path, frames: list[np.ndarray]) -> None:
    sheet = Image.new("RGBA", (FRAME_W * len(frames), FRAME_H), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(Image.fromarray(frame.astype(np.uint8), "RGBA"), (i * FRAME_W, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def premultiply(frame: np.ndarray) -> np.ndarray:
    rgba = frame.astype(np.float32) / 255.0
    rgba[..., :3] *= rgba[..., 3:4]
    return rgba


def unpremultiply(frame: np.ndarray) -> np.ndarray:
    out = np.zeros_like(frame, dtype=np.float32)
    alpha = np.clip(frame[..., 3:4], 0.0, 1.0)
    out[..., 3:4] = alpha
    out[..., :3] = np.where(alpha > 1e-4, frame[..., :3] / np.maximum(alpha, 1e-4), 0.0)
    return np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


def flow_input(frame: np.ndarray) -> np.ndarray:
    rgba = frame.astype(np.float32) / 255.0
    alpha = rgba[..., 3]
    rgb = rgba[..., :3] * alpha[..., None] + (1.0 - alpha[..., None])
    gray = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    mask = (alpha * 255).astype(np.uint8)
    gray = cv2.addWeighted(gray, 0.78, cv2.GaussianBlur(mask, (0, 0), 2.0), 0.22, 0)
    return gray


def dense_flow(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return cv2.calcOpticalFlowFarneback(
        flow_input(a),
        flow_input(b),
        None,
        pyr_scale=0.5,
        levels=5,
        winsize=29,
        iterations=5,
        poly_n=7,
        poly_sigma=1.5,
        flags=cv2.OPTFLOW_FARNEBACK_GAUSSIAN,
    )


def remap_float(image: np.ndarray, flow: np.ndarray, scale: float) -> np.ndarray:
    h, w = image.shape[:2]
    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x = grid_x - flow[..., 0].astype(np.float32) * scale
    map_y = grid_y - flow[..., 1].astype(np.float32) * scale
    channels = [
        cv2.remap(
            image[..., channel],
            map_x,
            map_y,
            interpolation=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0,
        )
        for channel in range(image.shape[2])
    ]
    return np.stack(channels, axis=-1)


def signed_distance(alpha: np.ndarray) -> np.ndarray:
    mask = (alpha > 20).astype(np.uint8)
    inside = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    outside = cv2.distanceTransform(1 - mask, cv2.DIST_L2, 5)
    return inside - outside


def morphed_silhouette(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    sdf = signed_distance(a[..., 3]) * (1.0 - t) + signed_distance(b[..., 3]) * t
    soft = np.clip((sdf + 2.5) / 5.0, 0.0, 1.0)
    soft = cv2.GaussianBlur(soft.astype(np.float32), (0, 0), 0.7)
    return np.clip(soft, 0.0, 1.0)[..., None]


def interpolate_pair(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    if t <= 0:
        return a.copy()
    if t >= 1:
        return b.copy()

    flow_ab = dense_flow(a, b)
    flow_ba = dense_flow(b, a)
    a_pm = premultiply(a)
    b_pm = premultiply(b)
    warped_a = remap_float(a_pm, flow_ab, t)
    warped_b = remap_float(b_pm, flow_ba, 1.0 - t)

    blend = t * t * (3.0 - 2.0 * t)
    mixed = warped_a * (1.0 - blend) + warped_b * blend

    # Use signed-distance silhouette interpolation to keep one clean animal
    # outline. This lets the middle frame actually move toward the next pose
    # without reintroducing faint duplicate legs from disjoint alpha regions.
    silhouette = morphed_silhouette(a, b, t)
    stronger = np.where(warped_a[..., 3:4] >= warped_b[..., 3:4], warped_a, warped_b)
    has_mixed_color = mixed[..., 3:4] > 0.02
    mixed = np.where(has_mixed_color, mixed, stronger)
    mixed[..., 3:4] = np.minimum(mixed[..., 3:4], silhouette)
    mixed[..., :3] = np.minimum(mixed[..., :3], mixed[..., 3:4])

    result = unpremultiply(mixed)

    # Remove sub-pixel haze and thin optical-flow tails in generated frames.
    # Original key poses are inserted directly and do not pass through this.
    alpha = result[..., 3]
    strong = (alpha > 34).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    cleaned = cv2.morphologyEx(strong, cv2.MORPH_CLOSE, kernel, iterations=1)
    components, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    keep = np.zeros_like(cleaned, dtype=bool)
    if components > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        largest = int(areas.max())
        for label in range(1, components):
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area >= max(18, largest * 0.004):
                keep |= labels == label
    result[~keep] = 0
    result[..., 3] = np.where(keep, np.clip(result[..., 3], 0, 255), 0).astype(np.uint8)
    return result


def build_frames(keyframes: list[np.ndarray]) -> list[np.ndarray]:
    out: list[np.ndarray] = []
    total = len(keyframes)
    for index, frame in enumerate(keyframes):
        next_frame = keyframes[(index + 1) % total]
        for step in range(STEPS_PER_KEY):
            if step == 0:
                out.append(frame.copy())
            else:
                out.append(interpolate_pair(frame, next_frame, step / STEPS_PER_KEY))
    return out


def frame_hash(frame: np.ndarray) -> str:
    return hashlib.sha256(frame.tobytes()).hexdigest()


def frame_delta(a: np.ndarray, b: np.ndarray) -> float:
    alpha = np.maximum(a[..., 3], b[..., 3]).astype(np.float32) / 255.0
    if float(alpha.sum()) < 1.0:
        return 0.0
    rgb_delta = np.abs(a[..., :3].astype(np.int16) - b[..., :3].astype(np.int16)).mean(axis=2)
    alpha_delta = np.abs(a[..., 3].astype(np.int16) - b[..., 3].astype(np.int16))
    return float(((rgb_delta * alpha) + alpha_delta * 0.35).sum() / alpha.sum())


def alpha_fringe_count(frames: list[np.ndarray]) -> int:
    total = 0
    for frame in frames:
        alpha = frame[..., 3]
        transparent_rgb = frame[..., :3].max(axis=2)
        total += int(((alpha < 3) & (transparent_rgb > 0)).sum())
        total += int(((alpha > 0) & (alpha < 18) & (transparent_rgb > 245)).sum())
    return total


def verify_frames(keyframes: list[np.ndarray], frames: list[np.ndarray]) -> tuple[bool, int, float, float, int]:
    exact = all(np.array_equal(frames[i * STEPS_PER_KEY], keyframes[i]) for i in range(len(keyframes)))
    unique = len({frame_hash(frame) for frame in frames})
    deltas = [frame_delta(frames[i], frames[(i + 1) % len(frames)]) for i in range(len(frames))]
    return exact, unique, min(deltas), float(np.mean(deltas)), alpha_fringe_count(frames)


def load_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_manifest(manifest_path: Path, results: list[AnimationResult]) -> None:
    manifest = load_manifest(manifest_path)
    animals = manifest["animals"]
    result_map = {(r.animal, r.action): r for r in results}
    for animal, action in ANIMATIONS:
        result = result_map[(animal, action)]
        entry = animals[animal][action]
        original_src = f"animals/{animal}-{action}.png"
        original_frames = 8
        original_fps = ORIGINAL_FPS[(animal, action)]
        entry["src"] = result.output.replace("\\", "/")
        entry["frames"] = result.frames
        entry["fps"] = result.fps
        entry["method"] = "Source-prioritized optical-flow interpolation from 8 original key poses; every fourth frame preserves the original pose exactly"
        entry["source"] = {
            "src": original_src,
            "frames": original_frames,
            "fps": original_fps,
            "method": "original generated key-pose sheet",
        }
    save_manifest(manifest_path, manifest)


def make_contact_sheet(results: list[AnimationResult], asset_root: Path, output_path: Path) -> None:
    cell_w = 192
    cell_h = 128
    label_h = 22
    cols = 8
    rows_per_action = 1
    canvas = Image.new("RGBA", (cols * cell_w, len(results) * (cell_h + label_h)), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    for row, result in enumerate(results):
        sheet_path = asset_root / result.output
        frames = split_sheet(sheet_path, result.frames)
        sample_indices = [0, 1, 2, 3, 4, 7, 11, 15]
        y = row * (cell_h + label_h)
        draw.text((6, y + 3), f"{result.animal}-{result.action}  {result.frames}f @ {result.fps:g}fps", fill=(20, 20, 20))
        for col, frame_index in enumerate(sample_indices):
            frame = Image.fromarray(frames[frame_index], "RGBA").resize((cell_w, cell_h), Image.Resampling.LANCZOS)
            canvas.alpha_composite(frame, (col * cell_w, y + label_h))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, quality=92)


def make_keyframe_comparison(results: list[AnimationResult], asset_root: Path, output_path: Path) -> None:
    cell_w = 192
    cell_h = 128
    cols = 8
    pair_h = cell_h * 2 + 30
    canvas = Image.new("RGBA", (cols * cell_w, len(results) * pair_h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    for row, result in enumerate(results):
        original_path = asset_root / "animals" / f"{result.animal}-{result.action}.png"
        smooth_path = asset_root / result.output
        original = split_sheet(original_path, 8)
        smooth = split_sheet(smooth_path, result.frames)
        y = row * pair_h
        draw.text((6, y + 3), f"{result.animal}-{result.action}: original above, smooth every fourth below", fill=(20, 20, 20))
        for col in range(cols):
            top = Image.fromarray(original[col], "RGBA").resize((cell_w, cell_h), Image.Resampling.LANCZOS)
            bottom = Image.fromarray(smooth[col * STEPS_PER_KEY], "RGBA").resize((cell_w, cell_h), Image.Resampling.LANCZOS)
            canvas.alpha_composite(top, (col * cell_w, y + 20))
            canvas.alpha_composite(bottom, (col * cell_w, y + 20 + cell_h))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, quality=92)


def build_animation(repo_root: Path, animal: str, action: str) -> AnimationResult:
    asset_root = repo_root / "public" / "assets" / "ecosystem-v1"
    frame_dir = asset_root / "animals" / "frames" / f"{animal}-{action}"
    if frame_dir.exists():
        keyframes = [read_rgba(frame_dir / f"{index:02d}.png") for index in range(8)]
    else:
        keyframes = split_sheet(asset_root / "animals" / f"{animal}-{action}.png", 8)

    frames = build_frames(keyframes)
    output_rel = Path("animals-smooth") / f"{animal}-{action}.png"
    output_path = asset_root / output_rel
    save_sheet(output_path, frames)

    exact, unique, min_delta, mean_delta, fringe = verify_frames(keyframes, frames)
    if not exact:
        raise RuntimeError(f"{animal}-{action} did not preserve exact keyframes")
    if unique < len(frames):
        raise RuntimeError(f"{animal}-{action} has duplicate frames: {unique}/{len(frames)} unique")

    with Image.open(output_path) as sheet:
        dimensions = (sheet.width, sheet.height)

    old_fps = ORIGINAL_FPS[(animal, action)]
    return AnimationResult(
        animal=animal,
        action=action,
        output=output_rel.as_posix(),
        frames=len(frames),
        fps=old_fps * STEPS_PER_KEY,
        dimensions=dimensions,
        unique_frames=unique,
        keyframes_exact=exact,
        min_adjacent_delta=min_delta,
        mean_adjacent_delta=mean_delta,
        alpha_fringe_pixels=fringe,
    )


def write_report(results: list[AnimationResult], output_path: Path) -> None:
    payload = {
        "stepsPerKey": STEPS_PER_KEY,
        "frameSize": [FRAME_W, FRAME_H],
        "method": "source-prioritized alpha-aware optical-flow interpolation from 8 original key poses",
        "results": [
            {
                "animal": r.animal,
                "action": r.action,
                "output": r.output,
                "frames": r.frames,
                "fps": r.fps,
                "dimensions": list(r.dimensions),
                "uniqueFrames": r.unique_frames,
                "keyframesExact": r.keyframes_exact,
                "minAdjacentDelta": round(r.min_adjacent_delta, 3),
                "meanAdjacentDelta": round(r.mean_adjacent_delta, 3),
                "alphaFringePixels": r.alpha_fringe_pixels,
            }
            for r in results
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--report-dir", type=Path, default=Path("output/playwright/smooth-assets"))
    parser.add_argument("--update-manifest", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    report_dir = (repo_root / args.report_dir).resolve()
    asset_root = repo_root / "public" / "assets" / "ecosystem-v1"

    results = [build_animation(repo_root, animal, action) for animal, action in ANIMATIONS]
    if args.update_manifest:
        update_manifest(asset_root / "manifest.json", results)

    write_report(results, report_dir / "smooth-sprite-report.json")
    make_contact_sheet(results, asset_root, report_dir / "smooth-sprite-contact.jpg")
    make_keyframe_comparison(results, asset_root, report_dir / "smooth-keyframe-comparison.jpg")

    print(json.dumps({"generated": len(results), "reportDir": str(report_dir)}, indent=2))


if __name__ == "__main__":
    main()
