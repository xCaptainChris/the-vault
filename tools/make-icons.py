#!/usr/bin/env python3
"""Render The Vault app icons with Pillow (dev only; outputs are committed).

    python3 tools/make-icons.py

Artwork: vault door on #101014 with a green→cyan ring and a spoked handle.
icons/icon.svg is the matching vector source for reference.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
BG = (16, 16, 20, 255)
CARD = (35, 35, 43, 255)
GREEN = (76, 217, 100)
CYAN = (0, 210, 255)
SS = 4  # supersampling factor


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_ring(size, cx, cy, r_out, r_in):
    """Diagonal green→cyan gradient clipped to an annulus."""
    grad = Image.new("RGBA", (size, size))
    gp = grad.load()
    for y in range(size):
        for x in range(size):
            t = max(0.0, min(1.0, ((x - (cx - r_out)) + (y - (cy - r_out))) / (4 * r_out)))
            gp[x, y] = lerp(GREEN, CYAN, t) + (255,)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=255)
    md.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=0)
    return grad, mask


def draw_mark(img, cx, cy, R):
    """Vault door centred at (cx, cy) with outer radius R (in img pixels)."""
    size = img.size[0]
    d = ImageDraw.Draw(img)
    # door face
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=CARD)
    # gradient ring
    grad, mask = gradient_ring(size, cx, cy, R, R * 0.80)
    img.paste(grad, (0, 0), mask)
    # bolts around the inside of the ring
    for i in range(8):
        a = math.pi / 8 + i * math.pi / 4
        bx, by = cx + math.cos(a) * R * 0.68, cy + math.sin(a) * R * 0.68
        br = R * 0.045
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=(138, 138, 150, 255))
    # handle: three spokes through the hub
    w = max(2, round(R * 0.09))
    for i in range(3):
        a = -math.pi / 2 + i * math.pi / 3
        x1, y1 = cx + math.cos(a) * R * 0.46, cy + math.sin(a) * R * 0.46
        x2, y2 = cx - math.cos(a) * R * 0.46, cy - math.sin(a) * R * 0.46
        d.line([x1, y1, x2, y2], fill=(242, 242, 245, 255), width=w)
        for (ex, ey) in ((x1, y1), (x2, y2)):
            er = w * 0.95
            d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=(242, 242, 245, 255))
    # hub
    hr = R * 0.17
    hub, hmask = gradient_ring(size, cx, cy, hr, 0)
    img.paste(hub, (0, 0), hmask)
    ir = R * 0.07
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=BG)


def render(px, maskable=False, rounded=True):
    S = px * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or not rounded:
        d.rectangle([0, 0, S, S], fill=BG)       # full bleed
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * 0.22), fill=BG)
    # maskable: keep artwork inside the central 80% safe circle (radius 0.4·S)
    R = S * (0.30 if maskable else 0.36)
    draw_mark(img, S / 2, S / 2, R)
    return img.resize((px, px), Image.LANCZOS)


def small(img):
    """256-colour palette: ~4x smaller files, no visible difference at icon sizes."""
    return img.convert("RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)


def main():
    OUT.mkdir(exist_ok=True)
    small(render(192)).save(OUT / "icon-192.png", optimize=True)
    small(render(512)).save(OUT / "icon-512.png", optimize=True)
    small(render(512, maskable=True)).save(OUT / "icon-maskable-512.png", optimize=True)
    # iOS applies its own corner mask, so the touch icon is full-bleed and opaque.
    small(render(180, rounded=False).convert("RGB")).save(OUT / "apple-touch-icon.png", optimize=True)
    small(render(32)).save(OUT / "favicon-32.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
