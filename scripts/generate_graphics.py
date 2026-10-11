"""
Generate placeholder 2.5D graphics assets for Memory Reconstruction game.
Creates aesthetic placeholder sprites with distinct colors and shapes.
Modular and AI-friendly: assets are generated programmatically for reproducibility.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import random

BASE_DIR = Path("C:/Users/Yunus-Emre/Desktop/Game/assets/sprites")
ASSETS = {
    "player": ["idle.png", "walk.png", "attack.png", "dash.png"],
    "enemies": ["scavenger.png", "guardian.png", "echo.png"],
    "tilesets": ["ruins.png", "forest.png", "caves.png", "crystal.png", "void.png", "sanctuary.png"],
    "ui": ["health.png", "mana.png", "stamina.png"],
    "particles": ["spark.png", "smoke.png", "blood.png", "magic.png"]
}

COLORS = {
    "player": (100, 180, 255),
    "enemies": (255, 120, 100),
    "tilesets": (120, 180, 120),
    "ui": (255, 220, 100),
    "particles": (255, 200, 150)
}

def create_sprite(path: Path, size=(256, 256), color=(200,200,200), label=""):
    img = Image.new("RGBA", size, (0,0,0,0))
    draw = ImageDraw.Draw(img)
    # Background rounded rect
    w, h = size
    radius = 20
    draw.rounded_rectangle([16,16,w-16,h-16], radius=radius, fill=color, outline=(255,255,255,200), width=4)
    # Simple 2.5D silhouette
    cx, cy = w//2, h//2
    draw.ellipse([cx-40, cy-20, cx+40, cy+80], fill=tuple(min(c+40,255) for c in color))
    draw.ellipse([cx-30, cy-70, cx+30, cy-10], fill=tuple(min(c+30,255) for c in color))
    draw.ellipse([cx-20, cy-50, cx-5, cy-35], fill=(255,255,255,120))
    
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(f"Created {path}")

def main():
    for category, files in ASSETS.items():
        base_color = COLORS.get(category, (200,200,200))
        for fname in files:
            variation = random.randint(-30, 30)
            color = tuple(max(0, min(255, c + variation)) for c in base_color)
            path = BASE_DIR / category / fname
            create_sprite(path, size=(256,256), color=color)

if __name__ == "__main__":
    main()
