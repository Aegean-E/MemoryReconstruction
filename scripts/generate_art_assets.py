"""Generate the Memory Reconstruction art set.

Theme: a shattered world rebuilt from memory-light. The palette moves from
weathered sandstone and deep indigo through emerald, crystal violet and void
black toward radiant sanctuary gold.

Run from the project root:
    python scripts/generate_art_assets.py

The generator is deterministic (fixed seeds), dependency-free beyond Pillow,
and writes every frame, tile, icon and atlas description used by the runtime.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SPRITES = ASSETS / "sprites"

SS = 4
PLAYER_CELL = 64
ENEMY_CELL = 64
TILE = 32
TILE_COLUMNS = 4
TILE_ROWS = ["empty", "floor", "wall", "platform", "hazard", "water", "ladder", "door", "secret"]
TILE_ROW_INDEX = {name: index for index, name in enumerate(TILE_ROWS)}

Outline = (9, 10, 18, 255)
Shadow = (4, 5, 12, 95)

PLAYER = {
    "outline": (10, 11, 22, 255),
    "cloak_dark": (31, 36, 66, 255),
    "cloak": (52, 62, 108, 255),
    "cloak_light": (86, 104, 166, 255),
    "scarf_dark": (42, 148, 178, 255),
    "scarf": (111, 231, 255, 255),
    "scarf_light": (204, 250, 255, 255),
    "gold": (255, 217, 138, 255),
    "skin": (233, 198, 160, 255),
    "skin_shadow": (173, 132, 105, 255),
    "boot": (23, 25, 40, 255),
    "blade": (205, 238, 255, 255),
    "blade_core": (255, 255, 255, 255),
    "eye": (150, 247, 255, 255),
}

ENEMY_STYLES = {
    "scavenger": {
        "kind": "hunched",
        "body": (78, 58, 52, 255),
        "light": (132, 98, 80, 255),
        "cloth": (103, 78, 62, 255),
        "accent": (255, 166, 83, 255),
        "eye": (255, 108, 60, 255),
        "scale": 0.9,
    },
    "guardian": {
        "kind": "construct",
        "body": (74, 74, 88, 255),
        "light": (122, 122, 140, 255),
        "cloth": (96, 82, 62, 255),
        "accent": (111, 231, 255, 255),
        "eye": (170, 250, 255, 255),
        "scale": 1.0,
    },
    "echo": {
        "kind": "wisp",
        "body": (112, 104, 176, 255),
        "light": (190, 178, 246, 255),
        "cloth": (72, 62, 126, 255),
        "accent": (220, 206, 255, 255),
        "eye": (250, 250, 255, 255),
        "scale": 0.92,
    },
    "wildling": {
        "kind": "beast",
        "body": (56, 96, 60, 255),
        "light": (112, 164, 98, 255),
        "cloth": (40, 68, 44, 255),
        "accent": (190, 255, 144, 255),
        "eye": (255, 226, 106, 255),
        "scale": 0.95,
    },
    "spirit": {
        "kind": "wisp",
        "body": (72, 132, 122, 255),
        "light": (160, 226, 198, 255),
        "cloth": (44, 84, 82, 255),
        "accent": (210, 255, 222, 255),
        "eye": (250, 255, 228, 255),
        "scale": 1.0,
        "antlers": True,
    },
    "caveDweller": {
        "kind": "hunched",
        "body": (116, 112, 122, 255),
        "light": (174, 168, 180, 255),
        "cloth": (78, 76, 88, 255),
        "accent": (124, 216, 255, 255),
        "eye": (222, 248, 255, 255),
        "scale": 0.86,
        "ears": True,
    },
    "crystalGolem": {
        "kind": "construct",
        "body": (104, 72, 168, 255),
        "light": (176, 140, 240, 255),
        "cloth": (56, 40, 96, 255),
        "accent": (116, 244, 255, 255),
        "eye": (236, 255, 255, 255),
        "scale": 1.08,
        "crystals": True,
    },
    "shadow": {
        "kind": "wisp",
        "body": (26, 24, 42, 255),
        "light": (62, 52, 92, 255),
        "cloth": (16, 15, 28, 255),
        "accent": (166, 104, 255, 255),
        "eye": (214, 170, 255, 255),
        "scale": 1.04,
    },
    "crystalGuardian": {
        "kind": "duelist",
        "body": (118, 88, 190, 255),
        "light": (204, 178, 255, 255),
        "cloth": (72, 50, 122, 255),
        "accent": (255, 132, 232, 255),
        "eye": (255, 244, 255, 255),
        "scale": 1.0,
    },
    "prismEntity": {
        "kind": "wisp",
        "body": (114, 140, 240, 255),
        "light": (188, 220, 255, 255),
        "cloth": (72, 76, 160, 255),
        "accent": (255, 160, 236, 255),
        "eye": (255, 255, 255, 255),
        "scale": 0.94,
        "shards": True,
    },
    "voidWalker": {
        "kind": "wisp",
        "body": (18, 18, 30, 255),
        "light": (54, 50, 82, 255),
        "cloth": (10, 10, 20, 255),
        "accent": (74, 226, 255, 255),
        "eye": (255, 70, 110, 255),
        "scale": 1.12,
        "rift": True,
    },
    "forgotten": {
        "kind": "construct",
        "body": (54, 52, 64, 255),
        "light": (102, 98, 116, 255),
        "cloth": (38, 36, 48, 255),
        "accent": (134, 120, 160, 255),
        "eye": (226, 212, 255, 255),
        "scale": 1.16,
        "broken": True,
    },
    "keeper": {
        "kind": "keeper",
        "body": (232, 208, 148, 255),
        "light": (255, 245, 208, 255),
        "cloth": (188, 154, 84, 255),
        "accent": (255, 226, 128, 255),
        "eye": (255, 255, 240, 255),
        "scale": 1.18,
    },
}

BIOME_ART = {
    "ruins": {
        "dark": (58, 48, 42, 255),
        "base": (116, 94, 78, 255),
        "light": (188, 158, 126, 255),
        "accent": (242, 208, 150, 255),
        "hazard": (198, 72, 58, 255),
        "water": (64, 102, 116, 255),
        "foliage": (112, 138, 84, 255),
    },
    "forest": {
        "dark": (20, 46, 28, 255),
        "base": (52, 94, 54, 255),
        "light": (122, 174, 92, 255),
        "accent": (196, 255, 154, 255),
        "hazard": (214, 92, 62, 255),
        "water": (44, 110, 112, 255),
        "foliage": (80, 150, 78, 255),
    },
    "caves": {
        "dark": (32, 32, 46, 255),
        "base": (72, 72, 92, 255),
        "light": (146, 146, 174, 255),
        "accent": (124, 216, 255, 255),
        "hazard": (255, 122, 62, 255),
        "water": (52, 78, 110, 255),
        "foliage": (104, 138, 122, 255),
    },
    "crystal": {
        "dark": (60, 38, 102, 255),
        "base": (126, 78, 186, 255),
        "light": (224, 172, 255, 255),
        "accent": (255, 148, 232, 255),
        "hazard": (255, 104, 176, 255),
        "water": (94, 98, 188, 255),
        "foliage": (128, 214, 216, 255),
    },
    "void": {
        "dark": (8, 8, 16, 255),
        "base": (34, 32, 56, 255),
        "light": (98, 94, 136, 255),
        "accent": (96, 236, 255, 255),
        "hazard": (255, 58, 92, 255),
        "water": (38, 42, 78, 255),
        "foliage": (62, 56, 96, 255),
    },
    "sanctuary": {
        "dark": (112, 86, 36, 255),
        "base": (196, 160, 94, 255),
        "light": (255, 244, 208, 255),
        "accent": (255, 224, 124, 255),
        "hazard": (255, 168, 94, 255),
        "water": (178, 214, 230, 255),
        "foliage": (224, 214, 144, 255),
    },
}

BACKGROUND_ART = {
    "ruins": dict(top=(16, 18, 34), bottom=(74, 62, 52), silhouette=(42, 38, 40), accent=(242, 196, 128)),
    "forest": dict(top=(9, 24, 28), bottom=(38, 74, 52), silhouette=(18, 42, 34), accent=(168, 255, 156)),
    "caves": dict(top=(10, 12, 24), bottom=(50, 50, 66), silhouette=(24, 24, 36), accent=(118, 220, 255)),
    "crystal": dict(top=(22, 12, 42), bottom=(104, 56, 152), silhouette=(48, 28, 76), accent=(255, 148, 232)),
    "void": dict(top=(3, 3, 9), bottom=(24, 22, 40), silhouette=(8, 8, 16), accent=(92, 232, 255)),
    "sanctuary": dict(top=(32, 28, 48), bottom=(180, 144, 84), silhouette=(104, 82, 42), accent=(255, 236, 166)),
}


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------


def rgba(color: tuple[int, int, int], alpha: int = 255) -> tuple[int, int, int, int]:
    return (color[0], color[1], color[2], alpha)


def blank(cell: int) -> Image.Image:
    return Image.new("RGBA", (cell * SS, cell * SS), (0, 0, 0, 0))


def ellipse(draw: ImageDraw.ImageDraw, cell: int, x0: float, y0: float, x1: float, y1: float,
            fill=None, outline=None, width: int = 2) -> None:
    size = cell * SS
    draw.ellipse(
        [int(x0 * size), int(y0 * size), int(x1 * size), int(y1 * size)],
        fill=fill,
        outline=outline,
        width=max(1, width * SS),
    )


def rect(draw: ImageDraw.ImageDraw, cell: int, x0: float, y0: float, x1: float, y1: float,
         fill=None, outline=None, width: int = 2, radius: float = 0.0) -> None:
    size = cell * SS
    coords = [int(x0 * size), int(y0 * size), int(x1 * size), int(y1 * size)]
    if radius > 0:
        draw.rounded_rectangle(
            coords,
            radius=int(radius * size),
            fill=fill,
            outline=outline,
            width=max(1, width * SS),
        )
    else:
        draw.rectangle(coords, fill=fill, outline=outline, width=max(1, width * SS))


def poly(draw: ImageDraw.ImageDraw, cell: int, points: list[tuple[float, float]],
         fill=None, outline=None, width: int = 2) -> None:
    size = cell * SS
    coords = [(int(x * size), int(y * size)) for x, y in points]
    draw.polygon(coords, fill=fill, outline=outline, width=max(1, width * SS))


def line(draw: ImageDraw.ImageDraw, cell: int, points: list[tuple[float, float]],
         fill, width: int = 2) -> None:
    size = cell * SS
    coords = [(int(x * size), int(y * size)) for x, y in points]
    draw.line(coords, fill=fill, width=max(1, width * SS), joint="curve")


def glow(img: Image.Image, paint, blur: float = 3.0) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    paint(ImageDraw.Draw(layer))
    layer = layer.filter(ImageFilter.GaussianBlur(blur * SS))
    img.alpha_composite(layer)


def downsample(img: Image.Image, cell: int) -> Image.Image:
    return img.resize((cell, cell), Image.LANCZOS)


def save_cell(img: Image.Image, cell: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    downsample(img, cell).save(path)


def mix(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, ...]:
    length = min(len(a), len(b))
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(length))


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------


def player_scarf(state: str, t: float, bob: float) -> list[tuple[float, float]]:
    sway = math.sin(t * math.tau) * 0.025
    if state == "dash":
        return [(0.42, 0.41), (0.24, 0.44), (0.09, 0.49), (0.0, 0.45)]
    if state == "attack":
        return [(0.43, 0.41), (0.31, 0.48 + sway), (0.20, 0.55), (0.12, 0.52 + sway)]
    return [(0.43, 0.41 + bob), (0.31, 0.47 + sway), (0.21, 0.53 - sway), (0.13, 0.49)]


def player_frame(state: str, frame: int, frames: int) -> Image.Image:
    cell = PLAYER_CELL
    img = blank(cell)
    draw = ImageDraw.Draw(img)
    pal = PLAYER
    t = frame / frames
    cycle = math.sin(t * math.tau)
    bob = cycle * 0.008 if state in ("idle", "attack") else abs(cycle) * 0.012
    lean = 0.035 if state == "dash" else 0.0
    step = math.sin(t * math.tau) if state == "walk" else 0.0

    def paint_glow(g: ImageDraw.ImageDraw) -> None:
        line(g, cell, player_scarf(state, t, bob), pal["scarf"], 5)
        ellipse(g, cell, 0.465, 0.39 + bob, 0.535, 0.46 + bob, fill=pal["eye"])
        ellipse(g, cell, 0.50, 0.28 + bob, 0.55, 0.33 + bob, fill=pal["eye"])

    ellipse(draw, cell, 0.25, 0.84, 0.74, 0.93, fill=Shadow)
    glow(img, paint_glow, 3.0)

    # Scarf tail behind the body.
    line(draw, cell, player_scarf(state, t, bob), pal["scarf_dark"], 4)
    line(draw, cell, player_scarf(state, t, bob), pal["scarf"], 2)

    # Legs and boots.
    left_x = 0.43 + step * 0.025
    right_x = 0.55 - step * 0.025
    if state == "dash":
        left_x, right_x = 0.39, 0.49
    rect(draw, cell, left_x - 0.045, 0.66 + bob, left_x + 0.035, 0.85, fill=pal["cloak_dark"], outline=pal["outline"], width=2, radius=0.02)
    rect(draw, cell, right_x - 0.035, 0.66 + bob, right_x + 0.045, 0.85, fill=pal["cloak_dark"], outline=pal["outline"], width=2, radius=0.02)
    rect(draw, cell, left_x - 0.055, 0.81, left_x + 0.045, 0.88, fill=pal["boot"], outline=pal["outline"], width=2, radius=0.018)
    rect(draw, cell, right_x - 0.045, 0.81, right_x + 0.055, 0.88, fill=pal["boot"], outline=pal["outline"], width=2, radius=0.018)

    # Cloak and torso.
    cloak = [
        (0.37 + lean, 0.35 + bob),
        (0.63 + lean, 0.35 + bob),
        (0.72, 0.78),
        (0.63, 0.86),
        (0.55, 0.79),
        (0.49, 0.87),
        (0.42, 0.80),
        (0.29, 0.78),
    ]
    poly(draw, cell, cloak, fill=pal["cloak"], outline=pal["outline"], width=3)
    poly(draw, cell, [(0.40 + lean, 0.37 + bob), (0.55 + lean, 0.36 + bob), (0.51, 0.72), (0.43, 0.76)],
         fill=pal["cloak_light"])
    rect(draw, cell, 0.37, 0.62, 0.63, 0.66, fill=pal["gold"], outline=pal["outline"], width=1, radius=0.01)
    # Memory core.
    poly(draw, cell, [(0.51, 0.46), (0.55, 0.50), (0.51, 0.55), (0.47, 0.50)], fill=pal["scarf_light"], outline=pal["outline"], width=1)

    # Arms.
    if state == "attack":
        line(draw, cell, [(0.42, 0.42), (0.55, 0.47), (0.67, 0.48)], pal["cloak_dark"], 6)
        line(draw, cell, [(0.42, 0.42), (0.55, 0.47), (0.67, 0.48)], pal["cloak_light"], 3)
    else:
        line(draw, cell, [(0.40, 0.43), (0.34, 0.56), (0.36 + step * 0.01, 0.66)], pal["cloak_dark"], 5)
        line(draw, cell, [(0.61, 0.43), (0.68, 0.55), (0.66 - step * 0.01, 0.65)], pal["cloak_dark"], 5)

    # Hood and face.
    ellipse(draw, cell, 0.38, 0.20 + bob, 0.62, 0.45 + bob, fill=pal["cloak_dark"], outline=pal["outline"], width=3)
    poly(draw, cell, [(0.39, 0.29 + bob), (0.36, 0.18 + bob), (0.50, 0.13 + bob), (0.64, 0.20 + bob), (0.61, 0.30 + bob)],
         fill=pal["cloak"], outline=pal["outline"], width=2)
    ellipse(draw, cell, 0.43, 0.27 + bob, 0.58, 0.40 + bob, fill=pal["skin_shadow"])
    ellipse(draw, cell, 0.455, 0.30 + bob, 0.515, 0.365 + bob, fill=pal["skin"])
    ellipse(draw, cell, 0.515, 0.305 + bob, 0.548, 0.34 + bob, fill=pal["eye"])

    # Blade and slash arc.
    if state in ("idle", "walk", "attack"):
        angle = -1.18 + (2.3 * t if state == "attack" else -0.18)
        hand = (0.64, 0.53)
        length = 0.30 if state == "attack" else 0.25
        tip = (hand[0] + math.cos(angle) * length, hand[1] + math.sin(angle) * length)
        dx, dy = tip[0] - hand[0], tip[1] - hand[1]
        px, py = -dy * 0.018, dx * 0.018
        poly(draw, cell, [(hand[0] + px, hand[1] + py), (tip[0] + px, tip[1] + py),
                          (tip[0] - px, tip[1] - py), (hand[0] - px, hand[1] - py)],
             fill=pal["blade"], outline=pal["outline"], width=1)
        line(draw, cell, [hand, tip], pal["blade_core"], 1)
        rect(draw, cell, hand[0] - 0.035, hand[1] - 0.018, hand[0] + 0.035, hand[1] + 0.018,
             fill=pal["gold"], outline=pal["outline"], width=1, radius=0.01)
        if state == "attack" and t > 0.2:
            size = cell * SS
            box = [int(0.34 * size), int(0.16 * size), int(0.98 * size), int(0.84 * size)]
            draw.arc(box, start=-104 + t * 80, end=8 + t * 60, fill=pal["scarf"], width=max(1, 2 * SS))

    # Dash afterimages.
    if state == "dash":
        for i, alpha in enumerate((120, 80, 45)):
            line(draw, cell, [(0.36 - i * 0.07, 0.42 + i * 0.04), (0.08 - i * 0.04, 0.45 + i * 0.05)],
                 rgba(pal["scarf"][:3], alpha), 2)

    return img


# ---------------------------------------------------------------------------
# Enemies
# ---------------------------------------------------------------------------


def _enemy_common(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> tuple[float, float]:
    cycle = math.sin(t * math.tau)
    bob = cycle * 0.008
    if row == 3:
        bob += (frame + 1) / 4 * 0.16
    lunge = 0.05 if row == 2 and t > 0.35 else 0.0
    step = math.sin(t * math.tau) if row == 1 else 0.0
    ellipse(draw, cell, 0.24, 0.86, 0.76, 0.95, fill=Shadow)
    return bob, step + lunge


def _construct(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> None:
    bob, march = _enemy_common(draw, cell, style, row, frame, t)
    dark = mix(style["body"], style["cloth"], 0.45)
    body = style["body"]
    light = style["light"]
    accent = style["accent"]
    lean = march * 0.015
    scale = style.get("scale", 1.0)
    top = 0.18 + (1 - scale) * 0.15 + bob
    left = 0.5 - 0.24 * scale + lean
    right = 0.5 + 0.24 * scale + lean
    bottom = 0.88
    rect(draw, cell, left, top + 0.16, right, bottom, fill=body, outline=Outline, width=3, radius=0.04)
    rect(draw, cell, left + 0.03, top + 0.19, right - 0.03, bottom - 0.08, fill=mix(body, light, 0.25))
    # Shoulders / head.
    poly(draw, cell, [(left - 0.04, top + 0.23), (left + 0.05, top + 0.08), (right - 0.05, top + 0.08), (right + 0.04, top + 0.23)],
         fill=dark, outline=Outline, width=3)
    rect(draw, cell, 0.42 + lean, top - 0.01, 0.58 + lean, top + 0.15, fill=body, outline=Outline, width=3, radius=0.03)
    rect(draw, cell, 0.45 + lean, top + 0.045, 0.55 + lean, top + 0.075, fill=accent)
    # Core.
    ellipse(draw, cell, 0.44 + lean, top + 0.30, 0.56 + lean, top + 0.42, fill=accent, outline=Outline, width=2)
    # Arms.
    swing = march * 0.04
    rect(draw, cell, left - 0.075, top + 0.23 - swing, left + 0.015, top + 0.60, fill=dark, outline=Outline, width=2, radius=0.025)
    rect(draw, cell, right - 0.015, top + 0.23 + swing, right + 0.075, top + 0.60, fill=dark, outline=Outline, width=2, radius=0.025)
    # Legs.
    rect(draw, cell, 0.39, bottom - 0.12, 0.48, bottom + 0.05 + abs(march) * 0.02, fill=dark, outline=Outline, width=2, radius=0.02)
    rect(draw, cell, 0.52, bottom - 0.12, 0.61, bottom + 0.05, fill=dark, outline=Outline, width=2, radius=0.02)
    # Cracks.
    line(draw, cell, [(0.48 + lean, top + 0.20), (0.54 + lean, top + 0.28), (0.50 + lean, top + 0.38)], style["accent"], 1)
    if style.get("crystals"):
        for x, y, s in ((0.28, 0.35, 0.06), (0.69, 0.50, 0.05), (0.36, 0.20, 0.04)):
            poly(draw, cell, [(x, y - s), (x + s, y), (x, y + s * 1.4), (x - s, y)], fill=accent, outline=Outline, width=1)
    if style.get("broken"):
        line(draw, cell, [(0.38, 0.43), (0.30, 0.51)], dark, 3)
        line(draw, cell, [(0.62, 0.49), (0.70, 0.57)], dark, 3)


def _hunched(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> None:
    bob, lunge = _enemy_common(draw, cell, style, row, frame, t)
    body = style["body"]
    light = style["light"]
    cloth = style["cloth"]
    accent = style["accent"]
    sway = math.sin(t * math.tau) * 0.015
    cx = 0.50 + lunge
    # Ragged cloak.
    poly(draw, cell, [(cx - 0.20, 0.40 + bob), (cx - 0.08, 0.28 + bob), (cx + 0.17, 0.33 + bob),
                      (cx + 0.24, 0.72), (cx + 0.13, 0.82), (cx + 0.06, 0.74), (cx - 0.03, 0.85),
                      (cx - 0.12, 0.75), (cx - 0.24, 0.80)], fill=cloth, outline=Outline, width=3)
    ellipse(draw, cell, cx - 0.17, 0.36 + bob, cx + 0.18, 0.70, fill=body, outline=Outline, width=2)
    # Head and bone mask.
    ellipse(draw, cell, cx - 0.12, 0.22 + bob, cx + 0.13, 0.42 + bob, fill=light, outline=Outline, width=3)
    poly(draw, cell, [(cx - 0.10, 0.29 + bob), (cx, 0.25 + bob), (cx + 0.10, 0.29 + bob), (cx + 0.03, 0.37 + bob), (cx - 0.03, 0.37 + bob)],
         fill=(222, 214, 190, 255), outline=Outline, width=2)
    ellipse(draw, cell, cx + 0.015, 0.295 + bob, cx + 0.055, 0.325 + bob, fill=style["eye"])
    ellipse(draw, cell, cx - 0.055, 0.295 + bob, cx - 0.015, 0.325 + bob, fill=style["eye"])
    # Claws and legs.
    line(draw, cell, [(cx - 0.16, 0.48), (cx - 0.28, 0.61), (cx - 0.31 + sway, 0.68)], body, 4)
    line(draw, cell, [(cx + 0.17, 0.48), (cx + 0.29, 0.58), (cx + 0.32 - sway, 0.67)], body, 4)
    for sign in (-1, 1):
        line(draw, cell, [(cx + sign * 0.28, 0.66), (cx + sign * 0.34, 0.73)], accent, 2)
    rect(draw, cell, cx - 0.12, 0.72, cx - 0.03, 0.91, fill=body, outline=Outline, width=2, radius=0.02)
    rect(draw, cell, cx + 0.04, 0.72, cx + 0.13, 0.91, fill=body, outline=Outline, width=2, radius=0.02)
    if style.get("ears"):
        poly(draw, cell, [(cx - 0.12, 0.28 + bob), (cx - 0.24, 0.18 + bob), (cx - 0.15, 0.36 + bob)], fill=light, outline=Outline, width=2)
        poly(draw, cell, [(cx + 0.12, 0.28 + bob), (cx + 0.24, 0.18 + bob), (cx + 0.15, 0.36 + bob)], fill=light, outline=Outline, width=2)
    if row == 2:
        line(draw, cell, [(cx + 0.22, 0.40), (cx + 0.38, 0.36)], accent, 3)


def _wisp(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> None:
    bob, lunge = _enemy_common(draw, cell, style, row, frame, t)
    body = style["body"]
    light = style["light"]
    cloth = style["cloth"]
    accent = style["accent"]
    cx = 0.50 + lunge
    sway = math.sin(t * math.tau) * 0.025
    # Trailing tatters.
    poly(draw, cell, [(cx - 0.17, 0.38 + bob), (cx + 0.15, 0.36 + bob), (cx + 0.20, 0.72),
                      (cx + 0.09, 0.82 + sway), (cx + 0.02, 0.73), (cx - 0.07, 0.88 - sway),
                      (cx - 0.15, 0.74), (cx - 0.23, 0.79)], fill=cloth, outline=Outline, width=3)
    ellipse(draw, cell, cx - 0.15, 0.24 + bob, cx + 0.16, 0.52 + bob, fill=body, outline=Outline, width=2)
    ellipse(draw, cell, cx - 0.10, 0.25 + bob, cx + 0.11, 0.44 + bob, fill=cloth)
    ellipse(draw, cell, cx + 0.01, 0.30 + bob, cx + 0.055, 0.345 + bob, fill=style["eye"])
    ellipse(draw, cell, cx - 0.057, 0.30 + bob, cx - 0.012, 0.345 + bob, fill=style["eye"])
    # Ribbon arms.
    line(draw, cell, [(cx - 0.12, 0.47), (cx - 0.27, 0.55 + sway), (cx - 0.32, 0.48)], body, 3)
    line(draw, cell, [(cx + 0.12, 0.47), (cx + 0.27, 0.55 - sway), (cx + 0.32, 0.48)], body, 3)
    for i in range(3):
        ellipse(draw, cell, cx - 0.05 + i * 0.06, 0.63 + i * 0.05 + sway, cx - 0.015 + i * 0.06, 0.66 + i * 0.05 + sway,
                fill=accent)
    if style.get("antlers"):
        for sign in (-1, 1):
            line(draw, cell, [(cx + sign * 0.08, 0.25 + bob), (cx + sign * 0.16, 0.14 + bob), (cx + sign * 0.24, 0.12 + bob)], accent, 2)
            line(draw, cell, [(cx + sign * 0.16, 0.14 + bob), (cx + sign * 0.21, 0.20 + bob)], accent, 1)
    if style.get("shards"):
        for x, y in ((0.24, 0.35), (0.76, 0.44), (0.31, 0.22)):
            poly(draw, cell, [(x, y - 0.05), (x + 0.04, y), (x, y + 0.07), (x - 0.04, y)], fill=accent, outline=Outline, width=1)
    if style.get("rift"):
        poly(draw, cell, [(cx - 0.025, 0.46), (cx + 0.03, 0.52), (cx - 0.01, 0.63), (cx - 0.045, 0.57)], fill=accent, outline=Outline, width=1)


def _beast(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> None:
    bob, lunge = _enemy_common(draw, cell, style, row, frame, t)
    body = style["body"]
    light = style["light"]
    cloth = style["cloth"]
    accent = style["accent"]
    cx = 0.50 + lunge
    step = math.sin(t * math.tau) * 0.03 if row == 1 else 0.0
    ellipse(draw, cell, cx - 0.26, 0.45 + bob, cx + 0.23, 0.76 + bob, fill=body, outline=Outline, width=3)
    ellipse(draw, cell, cx - 0.20, 0.49 + bob, cx + 0.15, 0.70 + bob, fill=mix(body, light, 0.28))
    ellipse(draw, cell, cx + 0.13, 0.30 + bob, cx + 0.38, 0.55 + bob, fill=light, outline=Outline, width=3)
    ellipse(draw, cell, cx + 0.18, 0.34 + bob, cx + 0.34, 0.48 + bob, fill=cloth)
    ellipse(draw, cell, cx + 0.29, 0.36 + bob, cx + 0.335, 0.395 + bob, fill=style["eye"])
    # Antlers.
    for sign in (-1, 1):
        line(draw, cell, [(cx + 0.23, 0.32 + bob), (cx + 0.20 + sign * 0.03, 0.19 + bob), (cx + 0.15 + sign * 0.10, 0.13 + bob)], accent, 2)
    # Legs.
    for i, x in enumerate((-0.17, -0.02, 0.12)):
        rect(draw, cell, cx + x - 0.035, 0.69, cx + x + 0.035, 0.91 + (step if i % 2 else -step), fill=cloth, outline=Outline, width=2, radius=0.02)
    line(draw, cell, [(cx - 0.24, 0.52), (cx - 0.34, 0.46 + math.sin(t * math.tau) * 0.03)], cloth, 3)


def _duelist(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> None:
    bob, lunge = _enemy_common(draw, cell, style, row, frame, t)
    body = style["body"]
    light = style["light"]
    cloth = style["cloth"]
    accent = style["accent"]
    cx = 0.50 + lunge
    rect(draw, cell, cx - 0.12, 0.34 + bob, cx + 0.12, 0.74, fill=body, outline=Outline, width=3, radius=0.03)
    poly(draw, cell, [(cx - 0.16, 0.38 + bob), (cx - 0.24, 0.31 + bob), (cx - 0.13, 0.27 + bob), (cx + 0.13, 0.27 + bob), (cx + 0.24, 0.31 + bob), (cx + 0.16, 0.38 + bob)],
         fill=cloth, outline=Outline, width=2)
    ellipse(draw, cell, cx - 0.09, 0.18 + bob, cx + 0.09, 0.34 + bob, fill=light, outline=Outline, width=3)
    rect(draw, cell, cx - 0.07, 0.235 + bob, cx + 0.07, 0.27 + bob, fill=accent)
    rect(draw, cell, cx - 0.08, 0.70, cx - 0.01, 0.91, fill=cloth, outline=Outline, width=2, radius=0.02)
    rect(draw, cell, cx + 0.01, 0.70, cx + 0.08, 0.91, fill=cloth, outline=Outline, width=2, radius=0.02)
    angle = -0.9 + (1.8 * t if row == 2 else 0.0)
    tip = (cx + math.cos(angle) * 0.36, 0.48 + math.sin(angle) * 0.30)
    line(draw, cell, [(cx + 0.10, 0.49), tip], (232, 238, 255, 255), 2)
    line(draw, cell, [(cx + 0.10, 0.49), tip], accent, 1)
    # Cape.
    poly(draw, cell, [(cx - 0.13, 0.38), (cx - 0.28, 0.48), (cx - 0.19, 0.80), (cx - 0.06, 0.70)],
         fill=cloth, outline=Outline, width=2)


def _keeper(draw: ImageDraw.ImageDraw, cell: int, style: dict, row: int, frame: int, t: float) -> None:
    bob, lunge = _enemy_common(draw, cell, style, row, frame, t)
    body = style["body"]
    light = style["light"]
    cloth = style["cloth"]
    accent = style["accent"]
    cx = 0.50 + lunge
    # Halo.
    ellipse(draw, cell, cx - 0.22, 0.08 + bob, cx + 0.22, 0.22 + bob, outline=accent, width=2)
    # Robe.
    poly(draw, cell, [(cx - 0.14, 0.27 + bob), (cx + 0.14, 0.27 + bob), (cx + 0.29, 0.90), (cx - 0.29, 0.90)],
         fill=cloth, outline=Outline, width=3)
    poly(draw, cell, [(cx - 0.10, 0.31 + bob), (cx + 0.10, 0.31 + bob), (cx + 0.16, 0.84), (cx - 0.16, 0.84)],
         fill=body)
    rect(draw, cell, cx - 0.15, 0.48, cx + 0.15, 0.52, fill=accent)
    ellipse(draw, cell, cx - 0.08, 0.18 + bob, cx + 0.08, 0.33 + bob, fill=light, outline=Outline, width=2)
    ellipse(draw, cell, cx + 0.00, 0.235 + bob, cx + 0.04, 0.27 + bob, fill=style["eye"])
    # Staff.
    line(draw, cell, [(cx + 0.20, 0.22), (cx + 0.20, 0.90)], cloth, 3)
    ellipse(draw, cell, cx + 0.15, 0.13, cx + 0.25, 0.23, fill=accent, outline=Outline, width=2)
    line(draw, cell, [(cx + 0.20, 0.52), (cx + 0.31, 0.48)], accent, 2)


ENEMY_DRAW = {
    "construct": _construct,
    "hunched": _hunched,
    "wisp": _wisp,
    "beast": _beast,
    "duelist": _duelist,
    "keeper": _keeper,
}


def enemy_frame(kind: str, row: int, frame: int, frames: int) -> Image.Image:
    cell = ENEMY_CELL
    img = blank(cell)
    draw = ImageDraw.Draw(img)
    style = ENEMY_STYLES[kind]
    t = frame / frames
    bob, _ = _enemy_common(draw, cell, style, row, frame, t)
    # Redraw shadow once over the base after the common helper.
    if row == 3:
        draw.rectangle((0, 0, cell * SS, cell * SS), fill=(0, 0, 0, 0))
        _enemy_common(draw, cell, style, row, frame, t)
    glow(img, lambda g: ellipse(g, cell, 0.42, 0.26 + bob, 0.58, 0.42 + bob, fill=style["accent"], ), 2.4)
    ENEMY_DRAW[style["kind"]](draw, cell, style, row, frame, t)
    if row == 3:
        alpha = max(60, 255 - frame * 50)
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        overlay.alpha_composite(img)
        img = overlay
        img.putalpha(img.getchannel("A").point(lambda value: min(value, alpha)))
    return img


# ---------------------------------------------------------------------------
# Tiles
# ---------------------------------------------------------------------------


def tile_image(biome: str, tile_type: str, variant: int) -> Image.Image:
    cell = TILE
    img = Image.new("RGBA", (cell * SS, cell * SS), (0, 0, 0, 0))
    if tile_type == "empty":
        return img
    draw = ImageDraw.Draw(img)
    art = BIOME_ART[biome]
    rng = random.Random(f"{biome}:{tile_type}:{variant}")
    dark, base, light, accent = art["dark"], art["base"], art["light"], art["accent"]

    if tile_type in ("floor", "wall", "hazard", "secret"):
        rect(draw, cell, 0, 0, 1, 1, fill=dark)
    if tile_type == "floor":
        rect(draw, cell, 0, 0, 1, 1, fill=base)
        rect(draw, cell, 0, 0, 1, 0.28, fill=light)
        rect(draw, cell, 0, 0.24, 1, 0.30, fill=mix(light, accent, 0.4))
        for _ in range(3 + variant):
            x = rng.uniform(0.08, 0.9)
            y = rng.uniform(0.35, 0.9)
            line(draw, cell, [(x, y), (x + rng.uniform(-0.12, 0.12), y + rng.uniform(0.08, 0.22))], dark, 1)
        if biome in ("forest", "sanctuary"):
            for _ in range(2 + variant):
                x = rng.uniform(0.1, 0.85)
                ellipse(draw, cell, x, 0.02, x + 0.07, 0.09, fill=art["foliage"])
    elif tile_type == "wall":
        rect(draw, cell, 0, 0, 1, 1, fill=base)
        for row in range(3):
            y = row / 3
            line(draw, cell, [(0, y), (1, y)], dark, 2)
            offset = 0.5 if row % 2 else 0.0
            for col in range(2):
                x = (col + offset) / 2
                line(draw, cell, [(x, y), (x, y + 1 / 3)], dark, 2)
        rect(draw, cell, 0, 0, 1, 0.07, fill=light)
        if biome == "crystal":
            for _ in range(2 + variant):
                x = rng.uniform(0.1, 0.8)
                y = rng.uniform(0.15, 0.75)
                poly(draw, cell, [(x, y), (x + 0.08, y + 0.04), (x + 0.05, y + 0.16), (x - 0.03, y + 0.12)], fill=accent, outline=dark, width=1)
    elif tile_type == "platform":
        rect(draw, cell, 0.02, 0.18, 0.98, 0.44, fill=base, outline=Outline, width=1, radius=0.02)
        rect(draw, cell, 0.02, 0.18, 0.98, 0.28, fill=light)
        rect(draw, cell, 0.12, 0.42, 0.22, 0.82, fill=dark)
        rect(draw, cell, 0.78, 0.42, 0.88, 0.82, fill=dark)
        line(draw, cell, [(0.03, 0.44), (0.97, 0.44)], accent, 1)
    elif tile_type == "hazard":
        rect(draw, cell, 0, 0.35, 1, 1, fill=dark)
        for i in range(4):
            x = 0.08 + i * 0.24 + variant * 0.01
            poly(draw, cell, [(x, 0.72), (x + 0.10, 0.18), (x + 0.20, 0.72)], fill=art["hazard"], outline=Outline, width=1)
            line(draw, cell, [(x + 0.10, 0.24), (x + 0.10, 0.62)], accent, 1)
    elif tile_type == "water":
        rect(draw, cell, 0, 0.1, 1, 1, fill=art["water"])
        for i in range(4):
            y = 0.18 + i * 0.2
            line(draw, cell, [(0, y), (0.25, y - 0.04), (0.5, y), (0.75, y - 0.04), (1, y)], mix(art["water"], light, 0.55), 1)
            line(draw, cell, [(0, y + 0.05), (0.3, y + 0.01), (0.6, y + 0.05), (1, y + 0.02)], rgba(light[:3], 100), 1)
    elif tile_type == "ladder":
        rect(draw, cell, 0.22, 0, 0.29, 1, fill=art["foliage"] if biome == "forest" else mix(base, light, 0.3))
        rect(draw, cell, 0.70, 0, 0.77, 1, fill=art["foliage"] if biome == "forest" else mix(base, light, 0.3))
        for i in range(4):
            y = 0.12 + i * 0.24
            rect(draw, cell, 0.20, y, 0.79, y + 0.07, fill=light, outline=Outline, width=1)
    elif tile_type == "door":
        rect(draw, cell, 0, 0, 1, 1, fill=dark)
        rect(draw, cell, 0.12, 0.16, 0.88, 1, fill=base, outline=Outline, width=2, radius=0.10)
        rect(draw, cell, 0.20, 0.24, 0.80, 1, fill=mix(art["water"], dark, 0.55), outline=light, width=1, radius=0.08)
        ellipse(draw, cell, 0.32, 0.30, 0.44, 0.42, outline=accent, width=1)
        line(draw, cell, [(0.38, 0.31), (0.44, 0.37)], accent, 1)
        ellipse(draw, cell, 0.70, 0.56, 0.75, 0.61, fill=accent)
    elif tile_type == "secret":
        rect(draw, cell, 0, 0, 1, 1, fill=base)
        line(draw, cell, [(0.08, 0.05), (0.25, 0.38), (0.18, 0.70), (0.36, 0.96)], dark, 2)
        line(draw, cell, [(0.62, 0.06), (0.72, 0.31), (0.60, 0.55), (0.78, 0.80)], dark, 2)
        poly(draw, cell, [(0.42, 0.36), (0.58, 0.36), (0.62, 0.52), (0.50, 0.66), (0.38, 0.52)], fill=None, outline=accent, width=2)
        line(draw, cell, [(0.5, 0.41), (0.5, 0.59)], accent, 1)
    return img


# ---------------------------------------------------------------------------
# Backgrounds, props, UI, particles
# ---------------------------------------------------------------------------


def background_image(biome: str) -> Image.Image:
    art = BACKGROUND_ART[biome]
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)
    top, bottom = art["top"], art["bottom"]
    for y in range(size):
        t = y / size
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
        draw.line([(0, y), (size, y)], fill=color)
    rng = random.Random(f"background:{biome}")
    for _ in range(150):
        x, y = rng.randrange(size), rng.randrange(size)
        radius = rng.choice((1, 1, 1, 2))
        alpha = rng.randrange(30, 150)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=art["accent"] + (alpha,))
    # Distant fog.
    fog = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fog_draw = ImageDraw.Draw(fog)
    for _ in range(7):
        x = rng.randrange(-100, size)
        y = rng.randrange(80, size - 60)
        w = rng.randrange(120, 320)
        h = rng.randrange(24, 70)
        fog_draw.ellipse((x, y, x + w, y + h), fill=art["accent"] + (18,))
    fog = fog.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(fog)
    # Silhouettes.
    sil = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sil)
    color = art["silhouette"] + (255,)
    if biome in ("ruins", "sanctuary"):
        for i in range(5):
            x = 20 + i * 105 + rng.randrange(-15, 15)
            w = rng.randrange(48, 90)
            h = rng.randrange(130, 300)
            sd.rectangle((x, size - h, x + w, size), fill=color)
            if biome == "sanctuary":
                sd.arc((x - 10, size - h - 35, x + w + 10, size - h + 60), 180, 360, fill=color, width=18)
            else:
                sd.polygon([(x, size - h), (x + w / 2, size - h - 32), (x + w, size - h)], fill=color)
    elif biome == "forest":
        for i in range(11):
            x = i * 52 + rng.randrange(-12, 12)
            trunk = max(8, 22 - i % 3 * 4)
            height = rng.randrange(170, 330)
            sd.rectangle((x, size - height, x + trunk, size), fill=color)
            sd.ellipse((x - 55, size - height - 60, x + trunk + 55, size - height + 60), fill=color)
    elif biome == "caves":
        for i in range(12):
            x = i * 48 + rng.randrange(-10, 10)
            width = rng.randrange(18, 42)
            height = rng.randrange(60, 180)
            sd.polygon([(x, 0), (x + width, 0), (x + width / 2, height)], fill=color)
            sd.polygon([(x, size), (x + width, size), (x + width / 2, size - height * 0.7)], fill=color)
    elif biome == "crystal":
        for i in range(12):
            x = rng.randrange(0, size)
            y = size - rng.randrange(80, 280)
            w = rng.randrange(18, 52)
            h = rng.randrange(70, 220)
            sd.polygon([(x, y), (x + w, y + h * 0.25), (x + w * 0.6, y + h), (x - w * 0.2, y + h * 0.55)], fill=color)
            sd.line([(x + w * 0.3, y + 12), (x + w * 0.4, y + h * 0.7)], art["accent"] + (80,), width=2)
    elif biome == "void":
        for i in range(5):
            x = 40 + i * 105
            sd.polygon([(x, size), (x + 24, size * 0.25), (x + 12, size * 0.55), (x + 52, 0), (x + 66, size)], fill=color)
        sd.ellipse((190, 150, 330, 290), outline=art["accent"] + (130,), width=2)
        sd.ellipse((214, 174, 306, 266), outline=art["accent"] + (70,), width=1)
    sil = sil.filter(ImageFilter.GaussianBlur(1.2))
    img.alpha_composite(sil)
    return img


def prop_image(kind: str) -> Image.Image:
    cell = 96
    img = blank(cell)
    draw = ImageDraw.Draw(img)
    palette = {
        "memory_fountain": ((92, 88, 112), (166, 160, 188), (111, 231, 255)),
        "statue": ((104, 92, 78), (178, 158, 128), (255, 217, 138)),
        "crystal_cluster": ((78, 52, 128), (196, 144, 255), (116, 244, 255)),
        "ancient_tree": ((52, 74, 48), (112, 152, 86), (198, 255, 156)),
        "ruins_door": ((90, 74, 60), (160, 132, 104), (255, 217, 138)),
        "sanctuary_altar": ((126, 100, 52), (232, 204, 138), (255, 244, 196)),
        "void_rift": ((16, 16, 28), (64, 56, 92), (92, 232, 255)),
        "memory_chest": ((80, 60, 44), (146, 112, 70), (255, 217, 138)),
    }[kind]
    dark, light, accent = palette
    ellipse(draw, cell, 0.18, 0.82, 0.82, 0.94, fill=Shadow)
    if kind == "memory_fountain":
        ellipse(draw, cell, 0.16, 0.62, 0.84, 0.86, fill=dark, outline=Outline, width=2)
        ellipse(draw, cell, 0.22, 0.64, 0.78, 0.78, fill=light)
        rect(draw, cell, 0.32, 0.70, 0.68, 0.94, fill=dark, outline=Outline, width=2)
        line(draw, cell, [(0.50, 0.66), (0.50, 0.30)], accent, 3)
        for i in range(4):
            ellipse(draw, cell, 0.38 + i * 0.06, 0.28 - i * 0.02, 0.44 + i * 0.06, 0.34 - i * 0.02, fill=accent)
    elif kind == "statue":
        rect(draw, cell, 0.30, 0.72, 0.70, 0.92, fill=dark, outline=Outline, width=2)
        rect(draw, cell, 0.38, 0.44, 0.62, 0.74, fill=light, outline=Outline, width=2)
        ellipse(draw, cell, 0.40, 0.28, 0.60, 0.48, fill=light, outline=Outline, width=2)
        line(draw, cell, [(0.38, 0.50), (0.22, 0.62)], light, 4)
        line(draw, cell, [(0.62, 0.50), (0.78, 0.62)], light, 4)
    elif kind == "crystal_cluster":
        for i, (x, h) in enumerate(((0.34, 0.62), (0.50, 0.80), (0.66, 0.52))):
            poly(draw, cell, [(x, 0.90 - h), (x + 0.10, 0.90 - h * 0.55), (x + 0.05, 0.92), (x - 0.07, 0.92), (x - 0.11, 0.90 - h * 0.62)],
                 fill=light if i == 1 else dark, outline=Outline, width=2)
            line(draw, cell, [(x + 0.01, 0.92 - h * 0.7), (x + 0.01, 0.88)], accent, 1)
    elif kind == "ancient_tree":
        rect(draw, cell, 0.43, 0.34, 0.57, 0.94, fill=dark, outline=Outline, width=2)
        ellipse(draw, cell, 0.16, 0.12, 0.84, 0.56, fill=light, outline=Outline, width=3)
        ellipse(draw, cell, 0.28, 0.08, 0.72, 0.42, fill=mix(light, accent, 0.25))
        line(draw, cell, [(0.50, 0.54), (0.62, 0.44), (0.68, 0.30)], accent, 2)
    elif kind == "ruins_door":
        rect(draw, cell, 0.16, 0.16, 0.84, 0.94, fill=dark, outline=Outline, width=3, radius=0.28)
        rect(draw, cell, 0.24, 0.26, 0.76, 0.94, fill=light, outline=Outline, width=2, radius=0.22)
        ellipse(draw, cell, 0.44, 0.42, 0.56, 0.54, fill=accent, outline=Outline, width=1)
        line(draw, cell, [(0.50, 0.46), (0.50, 0.56)], dark, 1)
    elif kind == "sanctuary_altar":
        rect(draw, cell, 0.18, 0.68, 0.82, 0.92, fill=light, outline=Outline, width=2, radius=0.05)
        rect(draw, cell, 0.28, 0.52, 0.72, 0.72, fill=dark, outline=Outline, width=2)
        ellipse(draw, cell, 0.38, 0.18, 0.62, 0.42, fill=accent, outline=Outline, width=2)
        line(draw, cell, [(0.50, 0.02), (0.50, 0.16)], accent, 2)
    elif kind == "void_rift":
        poly(draw, cell, [(0.46, 0.10), (0.64, 0.35), (0.56, 0.55), (0.70, 0.84), (0.50, 0.70), (0.40, 0.92), (0.32, 0.60), (0.38, 0.34)],
             fill=dark, outline=accent, width=2)
        ellipse(draw, cell, 0.42, 0.34, 0.56, 0.54, fill=accent)
    elif kind == "memory_chest":
        rect(draw, cell, 0.20, 0.48, 0.80, 0.88, fill=dark, outline=Outline, width=3, radius=0.04)
        rect(draw, cell, 0.20, 0.38, 0.80, 0.56, fill=light, outline=Outline, width=3, radius=0.10)
        rect(draw, cell, 0.46, 0.48, 0.54, 0.62, fill=accent, outline=Outline, width=1)
        rect(draw, cell, 0.20, 0.57, 0.80, 0.61, fill=accent)
    return img


def ui_image(kind: str) -> Image.Image:
    cell = 64
    img = blank(cell)
    draw = ImageDraw.Draw(img)
    accent = {
        "health": ((228, 72, 82), (255, 158, 156)),
        "mana": ((92, 176, 255), (206, 240, 255)),
        "stamina": ((226, 190, 92), (255, 244, 194)),
        "memory_fragment": ((150, 120, 255), (228, 214, 255)),
        "fragment_shard": ((112, 231, 255), (216, 252, 255)),
    }[kind]
    dark, light = accent
    ellipse(draw, cell, 0.08, 0.08, 0.92, 0.92, fill=(16, 16, 30, 235), outline=(255, 217, 138, 255), width=3)
    ellipse(draw, cell, 0.15, 0.15, 0.85, 0.85, outline=(80, 68, 48, 255), width=2)
    if kind == "health":
        poly(draw, cell, [(0.50, 0.78), (0.22, 0.48), (0.23, 0.31), (0.36, 0.24), (0.50, 0.36), (0.64, 0.24), (0.77, 0.31), (0.78, 0.48)],
             fill=dark, outline=Outline, width=2)
        ellipse(draw, cell, 0.31, 0.28, 0.45, 0.40, fill=light)
    elif kind == "mana":
        poly(draw, cell, [(0.50, 0.16), (0.72, 0.52), (0.50, 0.84), (0.28, 0.52)], fill=dark, outline=Outline, width=2)
        poly(draw, cell, [(0.50, 0.24), (0.62, 0.51), (0.50, 0.72)], fill=light)
    elif kind == "stamina":
        poly(draw, cell, [(0.62, 0.18), (0.36, 0.52), (0.50, 0.52), (0.38, 0.84), (0.68, 0.45), (0.54, 0.45)],
             fill=dark, outline=Outline, width=2)
    else:
        poly(draw, cell, [(0.50, 0.16), (0.74, 0.46), (0.50, 0.84), (0.26, 0.46)], fill=dark, outline=Outline, width=2)
        poly(draw, cell, [(0.50, 0.26), (0.63, 0.46), (0.50, 0.70), (0.37, 0.46)], fill=light)
    return img


def particle_image(kind: str) -> Image.Image:
    cell = 64
    img = blank(cell)
    draw = ImageDraw.Draw(img)
    rng = random.Random(f"particle:{kind}")
    layers = {
        "spark": (255, 228, 132),
        "smoke": (150, 140, 170),
        "blood": (172, 36, 52),
        "magic": (156, 112, 255),
    }
    color = layers[kind]
    if kind == "smoke":
        for _ in range(7):
            x, y = rng.uniform(0.25, 0.75), rng.uniform(0.25, 0.75)
            r = rng.uniform(0.10, 0.24)
            ellipse(draw, cell, x - r, y - r, x + r, y + r, fill=rgba(color, rng.randrange(30, 70)))
    elif kind == "spark":
        for i in range(12):
            angle = i / 12 * math.tau
            length = rng.uniform(0.18, 0.36)
            line(draw, cell, [(0.5, 0.5), (0.5 + math.cos(angle) * length, 0.5 + math.sin(angle) * length)], rgba(color, 190), 1)
        ellipse(draw, cell, 0.42, 0.42, 0.58, 0.58, fill=(255, 255, 255, 255))
    elif kind == "blood":
        for _ in range(6):
            x, y = rng.uniform(0.32, 0.68), rng.uniform(0.32, 0.68)
            r = rng.uniform(0.04, 0.11)
            ellipse(draw, cell, x - r, y - r, x + r, y + r, fill=rgba(color, 220))
        poly(draw, cell, [(0.5, 0.18), (0.62, 0.46), (0.5, 0.78), (0.38, 0.46)], fill=rgba(color, 235))
    else:
        for i in range(8):
            angle = i / 8 * math.tau
            x = 0.5 + math.cos(angle) * 0.28
            y = 0.5 + math.sin(angle) * 0.28
            ellipse(draw, cell, x - 0.05, y - 0.05, x + 0.05, y + 0.05, fill=rgba(color, 210))
        ellipse(draw, cell, 0.38, 0.38, 0.62, 0.62, fill=(220, 250, 255, 240))
    return img


def banner_image() -> Image.Image:
    width, height = 1200, 300
    img = Image.new("RGBA", (width, height), (9, 9, 18, 255))
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / height
        color = (int(9 + t * 38), int(9 + t * 26), int(18 + t * 62), 255)
        draw.line([(0, y), (width, y)], fill=color)
    rng = random.Random("banner")
    for _ in range(160):
        x, y = rng.randrange(width), rng.randrange(height)
        r = rng.choice((1, 1, 2))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(111, 231, 255, rng.randrange(30, 130)))
    for i in range(9):
        x = 80 + i * 132
        y = 40 + (i % 3) * 22
        draw.polygon([(x, y), (x + 18, y + 32), (x, y + 64), (x - 18, y + 32)], fill=(150, 120, 255, 55), outline=(180, 230, 255, 120), width=2)
    font_path = None
    for candidate in ("C:/Windows/Fonts/georgia.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        if Path(candidate).exists():
            font_path = candidate
            break
    title_font = ImageFont.truetype(font_path, 64) if font_path else ImageFont.load_default()
    sub_font = ImageFont.truetype(font_path, 22) if font_path else ImageFont.load_default()
    draw.text((width / 2, 132), "MEMORY RECONSTRUCTION", font=title_font, fill=(255, 226, 174, 255), anchor="mm")
    draw.text((width / 2, 192), "Every fragment remembers a world", font=sub_font, fill=(192, 212, 232, 255), anchor="mm")
    return img


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def build() -> None:
    SPRITES.mkdir(parents=True, exist_ok=True)
    rng = random.Random(20261020)

    # Player animation strips.
    player_meta = {
        "frameSize": {"width": PLAYER_CELL, "height": PLAYER_CELL},
        "origin": {"x": 0.5, "y": 0.88},
        "animations": {},
    }
    player_anims = {"idle": (4, 6, True), "walk": (6, 10, True), "attack": (5, 13, False), "dash": (4, 14, False)}
    for state, (frames, fps, loop) in player_anims.items():
        sheet = Image.new("RGBA", (PLAYER_CELL * frames, PLAYER_CELL), (0, 0, 0, 0))
        for frame in range(frames):
            sheet.alpha_composite(downsample(player_frame(state, frame, frames), PLAYER_CELL), (frame * PLAYER_CELL, 0))
        path = SPRITES / "player" / f"{state}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(path)
        player_meta["animations"][state] = {
            "texture": f"sprites/player/{state}.png",
            "frames": frames,
            "fps": fps,
            "loop": loop,
        }
        print(f"player/{state}.png ({frames} frames)")

    # Enemy sheets: 4 columns x 4 rows (idle, walk, attack, death).
    enemy_meta = {}
    for kind in ENEMY_STYLES:
        sheet = Image.new("RGBA", (ENEMY_CELL * 4, ENEMY_CELL * 4), (0, 0, 0, 0))
        for row in range(4):
            for frame in range(4):
                cell_img = downsample(enemy_frame(kind, row, frame, 4), ENEMY_CELL)
                sheet.alpha_composite(cell_img, (frame * ENEMY_CELL, row * ENEMY_CELL))
        path = SPRITES / "enemies" / f"{kind}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(path)
        enemy_meta[kind] = {
            "texture": f"sprites/enemies/{kind}.png",
            "frameWidth": ENEMY_CELL,
            "frameHeight": ENEMY_CELL,
            "columns": 4,
            "rows": 4,
            "origin": {"x": 0.5, "y": 0.90},
            "animations": {
                "idle": {"row": 0, "frames": 4, "fps": 5, "loop": True},
                "walk": {"row": 1, "frames": 4, "fps": 9, "loop": True},
                "attack": {"row": 2, "frames": 4, "fps": 12, "loop": False},
                "death": {"row": 3, "frames": 4, "fps": 6, "loop": False},
            },
        }
        print(f"enemies/{kind}.png")

    # Tilesets.
    tileset_meta = {}
    for biome in BIOME_ART:
        atlas = Image.new("RGBA", (TILE * TILE_COLUMNS, TILE * len(TILE_ROWS)), (0, 0, 0, 0))
        for row, tile_type in enumerate(TILE_ROWS):
            for variant in range(TILE_COLUMNS):
                tile = downsample(tile_image(biome, tile_type, variant), TILE)
                atlas.alpha_composite(tile, (variant * TILE, row * TILE))
        path = SPRITES / "tilesets" / f"{biome}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(path)
        tileset_meta[biome] = {
            "texture": f"sprites/tilesets/{biome}.png",
            "tileSize": TILE,
            "columns": TILE_COLUMNS,
            "rows": len(TILE_ROWS),
            "rowMap": {name: index for index, name in enumerate(TILE_ROWS)},
        }
        print(f"tilesets/{biome}.png")

    # Backgrounds.
    background_meta = {}
    for biome in BACKGROUND_ART:
        path = SPRITES / "backgrounds" / f"{biome}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        background_image(biome).save(path)
        background_meta[biome] = f"sprites/backgrounds/{biome}.png"
        print(f"backgrounds/{biome}.png")

    # Props.
    props = ["memory_fountain", "statue", "crystal_cluster", "ancient_tree", "ruins_door", "sanctuary_altar", "void_rift", "memory_chest"]
    prop_meta = {}
    for prop in props:
        path = SPRITES / "props" / f"{prop}.png"
        save_cell(prop_image(prop), 96, path)
        prop_meta[prop] = f"sprites/props/{prop}.png"
        print(f"props/{prop}.png")

    # UI icons.
    ui = ["health", "mana", "stamina", "memory_fragment", "fragment_shard"]
    ui_meta = {}
    for icon in ui:
        path = SPRITES / "ui" / f"{icon}.png"
        save_cell(ui_image(icon), 64, path)
        ui_meta[icon] = f"sprites/ui/{icon}.png"
        print(f"ui/{icon}.png")

    # Particles.
    particle_meta = {}
    for particle in ["spark", "smoke", "blood", "magic"]:
        path = SPRITES / "particles" / f"{particle}.png"
        save_cell(particle_image(particle), 64, path)
        particle_meta[particle] = f"sprites/particles/{particle}.png"
        print(f"particles/{particle}.png")

    banner_image().save(ASSETS / "banner.png")

    atlas = {
        "version": "2.0.0",
        "theme": {
            "name": "Memory Light",
            "description": "Weathered matter lit by remembered light: indigo shadow, cyan memory, gold sanctuary.",
            "palette": {
                "void": "#0A0A14",
                "indigo": "#1F2442",
                "memoryCyan": "#6FE7FF",
                "paleGold": "#FFD98A",
                "lavender": "#B89CFF",
                "ember": "#FF6B6B",
                "sanctuary": "#FFF4D0",
            },
        },
        "player": player_meta,
        "enemies": enemy_meta,
        "tilesets": tileset_meta,
        "backgrounds": background_meta,
        "props": prop_meta,
        "ui": ui_meta,
        "particles": particle_meta,
    }
    atlas_path = ASSETS / "data" / "sprite_atlas.json"
    atlas_path.parent.mkdir(parents=True, exist_ok=True)
    atlas_path.write_text(json.dumps(atlas, indent=2) + "\n", encoding="utf-8")

    graphics_assets = {
        "version": "2.0.0",
        "generated": "2026-10-20",
        "atlas": "data/sprite_atlas.json",
        "assets": {
            "player": {state: meta["texture"] for state, meta in player_meta["animations"].items()},
            "enemies": {kind: meta["texture"] for kind, meta in enemy_meta.items()},
            "tilesets": {biome: meta["texture"] for biome, meta in tileset_meta.items()},
            "backgrounds": background_meta,
            "props": prop_meta,
            "ui": ui_meta,
            "particles": particle_meta,
        },
        "notes": "Hand-painted 2.5D sprite sheets and tile atlases for the Memory Light art direction.",
    }
    (ASSETS / "data" / "graphics.assets.json").write_text(json.dumps(graphics_assets, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "version": "2.0.0",
        "generated": "2026-10-20",
        "textures": {
            **{f"player_{state}": meta["texture"] for state, meta in player_meta["animations"].items()},
            **{f"enemy_{kind}": meta["texture"] for kind, meta in enemy_meta.items()},
            **{f"tileset_{biome}": meta["texture"] for biome, meta in tileset_meta.items()},
            **{f"background_{biome}": path for biome, path in background_meta.items()},
            **{f"prop_{prop}": path for prop, path in prop_meta.items()},
            **{f"ui_{icon}": path for icon, path in ui_meta.items()},
            **{f"particle_{particle}": path for particle, path in particle_meta.items()},
        },
        "audio": {},
        "shaders": {
            "sprite": "shaders/sprite.wgsl",
            "sprite_lit": "shaders/sprite_lit.wgsl",
            "post_bloom": "shaders/post_bloom.wgsl",
            "post_vignette": "shaders/post_vignette.wgsl",
            "post_crt": "shaders/post_crt.wgsl",
            "post_colorgrading": "shaders/post_colorgrading.wgsl",
            "particle": "shaders/particle.wgsl",
            "light": "shaders/light.wgsl",
        },
        "data": {
            "graphics": "data/graphics.config.json",
            "audio": "data/audio.config.json",
            "gameplay": "data/gameplay.config.json",
            "ai": "data/ai.config.json",
            "sprite_atlas": "data/sprite_atlas.json",
            "graphics_assets": "data/graphics.assets.json",
            "items": "data/items.json",
            "enemies": "data/enemies.json",
            "abilities": "data/abilities.json",
            "biomes": "data/biomes.json",
            "dialogue": "data/dialogue.json",
            "lore": "data/lore.json",
        },
    }
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"sprite atlas: {atlas_path.relative_to(ROOT)}")
    print("asset generation complete")


if __name__ == "__main__":
    build()
