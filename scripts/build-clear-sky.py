from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/ecosystem-v1/layers/sky.png"
TARGET = ROOT / "public/assets/ecosystem-v1/layers/sky-clear.png"


def add_soft_cloud_mask(mask: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = ImageDraw.Draw(mask)
    x0, y0, x1, y1 = box
    w = x1 - x0
    h = y1 - y0
    ellipses = [
        (x0 + int(w * 0.02), y0 + int(h * 0.34), x0 + int(w * 0.36), y0 + int(h * 0.82)),
        (x0 + int(w * 0.18), y0 + int(h * 0.12), x0 + int(w * 0.58), y0 + int(h * 0.78)),
        (x0 + int(w * 0.48), y0 + int(h * 0.22), x0 + int(w * 0.86), y0 + int(h * 0.9)),
        (x0 + int(w * 0.67), y0 + int(h * 0.38), x1, y0 + int(h * 0.86)),
        (x0, y0 + int(h * 0.45), x1, y1),
    ]
    for ellipse in ellipses:
        draw.ellipse(ellipse, fill=255)
    draw.rounded_rectangle((x0 + int(w * 0.04), y0 + int(h * 0.47), x1 - int(w * 0.04), y1), radius=int(h * 0.22), fill=255)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    mask = Image.new("L", source.size, 0)

    # These are intentionally wider than the visible baked clouds so inpaint
    # samples clean sky texture, not the bright fringe around the original art.
    add_soft_cloud_mask(mask, (405, 105, 810, 315))
    add_soft_cloud_mask(mask, (1465, 185, 1765, 355))
    mask = mask.filter(ImageFilter.GaussianBlur(6))

    src = cv2.cvtColor(np.array(source), cv2.COLOR_RGB2BGR)
    m = np.array(mask)
    repaired = cv2.inpaint(src, m, 9, cv2.INPAINT_TELEA)

    # Blend very lightly with a local median to keep the watercolor texture
    # calm at scene scale while avoiding a plasticky flat patch.
    smooth = cv2.medianBlur(repaired, 9)
    feather = (cv2.GaussianBlur(m, (0, 0), 12).astype(np.float32) / 255.0)[..., None]
    out = repaired.astype(np.float32) * (1 - feather * 0.18) + smooth.astype(np.float32) * (feather * 0.18)
    Image.fromarray(cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)).save(TARGET)
    print(TARGET)


if __name__ == "__main__":
    main()
