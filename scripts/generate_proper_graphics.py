"""
Generate proper 2.5D-style sprites for Memory Reconstruction game.
Replaces placeholder graphics with programmatically generated, project-compatible assets.
Style: Octopath Traveler inspired hand-painted look using PIL.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import random
import math

BASE_DIR = Path(__file__).resolve().parent.parent / "assets" / "sprites"
SIZE = (256, 256)

# Color palettes
PALETTES = {
    "player": [(80, 140, 255), (120, 180, 255), (255, 240, 200)],
    "enemies": {
        "scavenger": [(180, 100, 80), (220, 140, 120), (80, 60, 50)],
        "guardian": [(120, 100, 180), (160, 140, 220), (200, 200, 240)],
        "echo": [(150, 150, 200), (190, 190, 240), (240, 240, 255)]
    },
    "tilesets": {
        "ruins": [(160, 130, 110), (200, 170, 150), (240, 220, 200)],
        "forest": [(70, 130, 90), (110, 180, 130), (180, 220, 180)],
        "caves": [(90, 90, 110), (130, 130, 160), (180, 180, 210)],
        "crystal": [(120, 180, 255), (170, 220, 255), (230, 250, 255)],
        "void": [(30, 20, 50), (60, 40, 90), (100, 80, 140)],
        "sanctuary": [(200, 180, 120), (240, 220, 170), (255, 250, 230)]
    },
    "ui": [(255, 200, 80), (255, 240, 180), (255, 255, 255)],
    "particles": {
        "spark": [(255, 220, 100), (255, 255, 180), (255, 255, 255)],
        "smoke": [(120, 120, 120), (170, 170, 170), (220, 220, 220)],
        "blood": [(180, 40, 40), (220, 80, 80), (255, 150, 150)],
        "magic": [(150, 100, 255), (200, 150, 255), (240, 210, 255)]
    }
}

def draw_gradient(draw, size, colors):
    w, h = size
    for y in range(h):
        t = y / h
        c = [
            int(colors[0][i] * (1 - t) + colors[1][i] * t)
            for i in range(3)
        ]
        draw.line([(0, y), (w, y)], fill=tuple(c))

def add_outline(draw, bbox, color, width=3):
    x0, y0, x1, y1 = bbox
    for i in range(width):
        draw.rectangle([x0-i, y0-i, x1+i, y1+i], outline=color, width=1)

def create_player_sprite(state, palette):
    img = Image.new("RGBA", SIZE, (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE[0]//2, SIZE[1]//2
    
    # Body
    body_w, body_h = 80, 100
    body_box = [cx - body_w//2, cy - body_h//2 + 20, cx + body_w//2, cy + body_h//2 + 20]
    draw.rounded_rectangle(body_box, radius=15, fill=palette[0])
    draw.rounded_rectangle(body_box, radius=15, outline=(40,40,60), width=3)
    
    # Head
    head_r = 35
    draw.ellipse([cx-head_r, cy - body_h//2 - head_r, cx+head_r, cy - body_h//2 + head_r], fill=palette[2])
    draw.ellipse([cx-head_r, cy - body_h//2 - head_r, cx+head_r, cy - body_h//2 + head_r], outline=(40,40,60), width=3)
    
    # Hair
    hair_r = 38
    draw.ellipse([cx-hair_r, cy - body_h//2 - hair_r -5, cx+hair_r, cy - body_h//2 + head_r -5], fill=(60,40,30))
    
    # Legs
    leg_w, leg_h = 28, 50
    for dx in (-30, 30):
        leg_box = [cx+dx - leg_w//2, cy + body_h//2 + 20, cx+dx + leg_w//2, cy + body_h//2 + 20 + leg_h]
        draw.rectangle(leg_box, fill=palette[0])
        draw.rectangle(leg_box, outline=(40,40,60), width=2)
    
    if state == "walk":
        # Motion lines
        for i in range(3):
            draw.line([cx-100, cy+50+i*10, cx-40, cy+50+i*10], fill=(255,255,255,100), width=2)
    elif state == "attack":
        # Sword
        sword_box = [cx+60, cy-20, cx+130, cy+20]
        draw.rectangle(sword_box, fill=(220,220,230))
        draw.rectangle(sword_box, outline=(100,100,120), width=2)
    elif state == "dash":
        # Speed lines
        for i in range(5):
            angle = i * math.pi/5
            x1 = cx + int(20*math.cos(angle))
            y1 = cy + int(20*math.sin(angle))
            x2 = cx + int(80*math.cos(angle))
            y2 = cy + int(80*math.sin(angle))
            draw.line([x1,y1,x2,y2], fill=(255,255,255,150), width=3)
    
    return img

def create_enemy_sprite(name, palette):
    img = Image.new("RGBA", SIZE, (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE[0]//2, SIZE[1]//2
    
    if name == "scavenger":
        # Hunchback creature
        body_box = [cx-60, cy-30, cx+60, cy+80]
        draw.ellipse([cx-70, cy-40, cx+70, cy+90], fill=palette[0])
        # Head
        draw.ellipse([cx-40, cy-80, cx+40, cy-20], fill=palette[1])
        # Claws
        for dx in (-50, 50):
            draw.polygon([(cx+dx, cy+60), (cx+dx-15, cy+100), (cx+dx+15, cy+100)], fill=palette[2])
    elif name == "guardian":
        # Armored
        draw.rounded_rectangle([cx-70, cy-80, cx+70, cy+70], radius=30, fill=palette[0])
        draw.rounded_rectangle([cx-60, cy-70, cx+60, cy+60], radius=25, fill=palette[1])
        # Glow
        draw.ellipse([cx-20, cy-100, cx+20, cy-60], fill=palette[2])
    else:  # echo
        # Ghostly
        for i in range(3):
            offset = i*10
            draw.ellipse([cx-50+offset, cy-50+offset, cx+50+offset, cy+50+offset], fill=palette[i%3], outline=(255,255,255,80))
    
    # Outline
    add_outline(draw, [cx-80, cy-100, cx+80, cy+100], (20,20,30), 4)
    return img

def create_tileset_sprite(name, palette):
    img = Image.new("RGBA", SIZE, (0,0,0,0))
    draw = ImageDraw.Draw(img)
    
    # Base gradient
    draw_gradient(draw, SIZE, palette)
    
    # Pattern
    if name == "ruins":
        for i in range(0, SIZE[0], 32):
            draw.line([i,0,i,SIZE[1]], fill=(80,60,50,100), width=2)
    elif name == "forest":
        for i in range(10):
            x = random.randint(0, SIZE[0])
            y = random.randint(0, SIZE[1])
            draw.ellipse([x-15, y-15, x+15, y+15], fill=palette[0])
    elif name == "caves":
        for i in range(20):
            x = random.randint(0, SIZE[0])
            y = random.randint(0, SIZE[1])
            draw.rectangle([x-10, y-10, x+10, y+10], fill=(40,40,60,150))
    elif name == "crystal":
        for i in range(15):
            cx = random.randint(50, SIZE[0]-50)
            cy = random.randint(50, SIZE[1]-50)
            draw.polygon([(cx,cy-30),(cx+25,cy),(cx,cy+30),(cx-25,cy)], fill=palette[1])
    elif name == "void":
        for i in range(30):
            x = random.randint(0, SIZE[0])
            y = random.randint(0, SIZE[1])
            draw.point((x,y), fill=(255,255,255,30))
    else:  # sanctuary
        draw.ellipse([50,50,200,200], fill=palette[1], outline=palette[0])
    
    return img

def create_ui_icon(name, palette):
    img = Image.new("RGBA", SIZE, (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE[0]//2, SIZE[1]//2
    
    if name == "health":
        # Heart
        draw.polygon([(cx,cy-40),(cx-40,cy-10),(cx-20,cy-20),(cx,cy+30),(cx+20,cy-20),(cx+40,cy-10)], fill=palette[0])
    elif name == "mana":
        # Star
        points = []
        for i in range(10):
            angle = i * math.pi/5 - math.pi/2
            r = 50 if i%2==0 else 25
            points.append((cx + r*math.cos(angle), cy + r*math.sin(angle)))
        draw.polygon(points, fill=palette[0])
    else:  # stamina
        draw.rounded_rectangle([cx-60, cy-40, cx+60, cy+40], radius=20, fill=palette[0])
        for i in range(5):
            draw.rectangle([cx-50+i*20, cy-30, cx-30+i*20, cy+30], fill=palette[1])
    
    add_outline(draw, [cx-70, cy-70, cx+70, cy+70], (60,40,20), 4)
    return img

def create_particle_sprite(name, palette):
    img = Image.new("RGBA", SIZE, (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE[0]//2, SIZE[1]//2
    
    if name == "spark":
        for i in range(8):
            angle = i * math.pi/4
            x = cx + 40*math.cos(angle)
            y = cy + 40*math.sin(angle)
            draw.line([cx,cy,x,y], fill=palette[0], width=3)
        draw.ellipse([cx-15,cy-15,cx+15,cy+15], fill=palette[2])
    elif name == "smoke":
        for i in range(5):
            r = 30 + i*10
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=palette[i%3], outline=None)
    elif name == "blood":
        draw.ellipse([cx-30,cy-30,cx+30,cy+30], fill=palette[0])
        draw.polygon([(cx,cy-40),(cx-20,cy),(cx,cy+40),(cx+20,cy)], fill=palette[1])
    else:  # magic
        for i in range(6):
            angle = i * math.pi/3
            x = cx + 50*math.cos(angle)
            y = cy + 50*math.sin(angle)
            draw.ellipse([x-10,y-10,x+10,y+10], fill=palette[0])
        draw.ellipse([cx-20,cy-20,cx+20,cy+20], fill=palette[2])
    
    return img

def main():
    random.seed(42)
    
    # Player
    player_dir = BASE_DIR / "player"
    player_dir.mkdir(parents=True, exist_ok=True)
    palette = PALETTES["player"]
    for state in ["idle","walk","attack","dash"]:
        img = create_player_sprite(state, palette)
        img.save(player_dir / f"{state}.png")
        print(f"Created player/{state}.png")
    
    # Enemies
    enemy_dir = BASE_DIR / "enemies"
    enemy_dir.mkdir(parents=True, exist_ok=True)
    for name in ["scavenger","guardian","echo"]:
        palette = PALETTES["enemies"][name]
        img = create_enemy_sprite(name, palette)
        img.save(enemy_dir / f"{name}.png")
        print(f"Created enemies/{name}.png")
    
    # Tilesets
    tiles_dir = BASE_DIR / "tilesets"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    for name in ["ruins","forest","caves","crystal","void","sanctuary"]:
        palette = PALETTES["tilesets"][name]
        img = create_tileset_sprite(name, palette)
        img.save(tiles_dir / f"{name}.png")
        print(f"Created tilesets/{name}.png")
    
    # UI
    ui_dir = BASE_DIR / "ui"
    ui_dir.mkdir(parents=True, exist_ok=True)
    palette = PALETTES["ui"]
    for name in ["health","mana","stamina"]:
        img = create_ui_icon(name, palette)
        img.save(ui_dir / f"{name}.png")
        print(f"Created ui/{name}.png")
    
    # Particles
    part_dir = BASE_DIR / "particles"
    part_dir.mkdir(parents=True, exist_ok=True)
    for name in ["spark","smoke","blood","magic"]:
        palette = PALETTES["particles"][name]
        img = create_particle_sprite(name, palette)
        img.save(part_dir / f"{name}.png")
        print(f"Created particles/{name}.png")
    
    # Banner for README
    banner = Image.new("RGBA", (1200, 300), (10,10,20,255))
    draw = ImageDraw.Draw(banner)
    draw_gradient(draw, (1200,300), [(10,10,40),(30,30,80)])
    draw.text((600,150), "Memory Reconstruction", fill=(255,220,180), anchor="mm")
    banner_path = Path(__file__).resolve().parent.parent / "assets" / "banner.png"
    banner.save(banner_path)
    print(f"Created banner.png")

if __name__ == "__main__":
    main()
