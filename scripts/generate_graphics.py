"""
Generate graph visualizations for Memory Reconstruction game.
Creates network graph images with nodes and edges as an alternative to placeholder sprites.
Modular and AI-friendly: assets are generated programmatically for reproducibility.
"""

from pathlib import Path
from PIL import Image, ImageDraw
import math
import random

BASE_DIR = Path(__file__).resolve().parent.parent / "assets" / "graphs"
ASSETS = {
    "player": ["graph1.png", "graph2.png", "graph3.png", "graph4.png"],
    "enemies": ["scavenger.png", "guardian.png", "echo.png"],
    "tilesets": ["ruins.png", "forest.png", "caves.png", "crystal.png", "void.png", "sanctuary.png"],
    "ui": ["health.png", "mana.png", "stamina.png"],
    "particles": ["spark.png", "smoke.png", "blood.png", "magic.png"]
}

# Color schemes for each category (R, G, B)
CATEGORY_COLORS = {
    "player": (100, 180, 255),
    "enemies": (255, 120, 100),
    "tilesets": (120, 180, 120),
    "ui": (255, 220, 100),
    "particles": (255, 200, 150)
}

# Graph node count per file index
NODE_COUNTS = {
    "player": [5, 7, 5, 6],
    "enemies": [4, 5, 4],
    "tilesets": [6, 6, 6, 6, 6, 6],
    "ui": [3, 3, 3],
    "particles": [4, 4, 4, 4]
}

def create_graph(path: Path, category: str, index: int, size=(128, 128)):
    """Create a network graph visualization with nodes and edges."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    w, h = size
    center_x, center_y = w // 2, h // 2
    radius = min(w, h) // 3 - 10
    
    # Get category color
    base_color = CATEGORY_COLORS.get(category, (150, 150, 150))
    # Add some variation for visual interest
    variation = random.randint(-20, 20)
    color = tuple(max(0, min(255, c + variation)) for c in base_color)
    
    # Determine number of nodes
    node_count = NODE_COUNTS.get(category, [5])[index % len(NODE_COUNTS.get(category, [5]))]
    
    # Calculate positions using a simple circular layout with some randomness
    nodes = []
    for i in range(node_count):
        angle = (2 * math.pi * i / node_count) + random.uniform(-0.3, 0.3)
        distance = radius * random.uniform(0.6, 1.0)
        x = center_x + distance * math.cos(angle)
        y = center_y + distance * math.sin(angle)
        nodes.append((x, y))
    
    # Draw edges between consecutive nodes (and last to first)
    for i in range(node_count):
        j = (i + 1) % node_count
        # Draw edge line
        x1, y1 = nodes[i]
        x2, y2 = nodes[j]
        draw.line([(x1, y1), (x2, y2)], fill=color, width=3)
    
    # Draw nodes as filled circles
    for x, y in nodes:
        node_radius = 8 + random.randint(-2, 2)
        # Outer circle with category color
        draw.ellipse([x - node_radius, y - node_radius, x + node_radius, y + node_radius], 
                     fill=color)
        # Inner highlight
        highlight_color = tuple(min(c + 50, 255) for c in color)
        draw.ellipse([x - node_radius // 2, y - node_radius // 2, x + node_radius // 2, y + node_radius // 2],
                     fill=(*highlight_color, 180))
    
    # Add a central node or identifier
    central_x, central_y = w // 2, h // 2
    central_radius = 6
    draw.ellipse([central_x - central_radius, central_y - central_radius, 
                  central_x + central_radius, central_y + central_radius],
                  fill=(255, 255, 255, 200))
    
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(f"Created graph {path} (category: {category}, nodes: {node_count})")

def main():
    for category, files in ASSETS.items():
        for idx, fname in enumerate(files):
            path = BASE_DIR / category / fname
            create_graph(path, category, idx)

if __name__ == "__main__":
    main()
