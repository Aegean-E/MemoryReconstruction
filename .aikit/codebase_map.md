# Codebase Map & Symbol Catalog 🗺️

> **AUTO-GENERATED & VERIFIED BY `scripts/update_knowledge_base.py`**
> This document provides an automated, up-to-date registry of all modules, classes, and exported functions across this repository.

---

## 📊 Codebase Metrics
- **Total Python Modules**: `7`
- **Total Classes**: `0`
- **Total Top-Level Functions**: `28`
- **Total Class Methods**: `0`
- **Total Source Lines**: `776`

---

## 📦 Modules & Exported Symbols

### [`scripts/generate_graphics.py`](scripts/generate_graphics.py)
> *Generate graph visualizations for Memory Reconstruction game.*

**Size**: `103` lines (`3770` bytes)

**Functions:**
- `def create_graph(path, category, index, size)` - *Create a network graph visualization with nodes and edges.*
- `def main()`

---

### [`scripts/generate_handpainted_sprites.py`](scripts/generate_handpainted_sprites.py)
**Size**: `75` lines (`2649` bytes)

**Functions:**
- `def hand_paint(img_size)`
- `def make_sprite(path, palette)`

---

### [`scripts/generate_octopath_sprites.py`](scripts/generate_octopath_sprites.py)
**Size**: `92` lines (`3141` bytes)

**Functions:**
- `def new_img()`
- `def draw_octopath_sprite(draw, palette, shape)`
- `def make_sprite(path, palette, shape)`

---

### [`scripts/generate_proper_graphics.py`](scripts/generate_proper_graphics.py)
> *Generate proper 2.5D-style sprites for Memory Reconstruction game.*

**Size**: `280` lines (`10540` bytes)

**Functions:**
- `def draw_gradient(draw, size, colors)`
- `def add_outline(draw, bbox, color, width)`
- `def create_player_sprite(state, palette)`
- `def create_enemy_sprite(name, palette)`
- `def create_tileset_sprite(name, palette)`
- `def create_ui_icon(name, palette)`
- `def create_particle_sprite(name, palette)`
- `def main()`

---

### [`scripts/generate_realistic_sprites.py`](scripts/generate_realistic_sprites.py)
**Size**: `149` lines (`4539` bytes)

**Functions:**
- `def blank()`
- `def draw_player_idle()`
- `def draw_player_walk()`
- `def draw_player_attack()`
- `def draw_player_dash()`
- `def draw_enemy(name)`
- `def draw_tileset(name)`
- `def draw_ui(name)`
- `def draw_particle(name)`
- `def save(path, img)`

---

### [`scripts/resize_sprites.py`](scripts/resize_sprites.py)
> *Resize every PNG sprite under a folder to 256x256 in place.*

**Size**: `31` lines (`1055` bytes)

**Functions:**
- `def main(argv)`

---

### [`src/tools/performance_benchmark.py`](src/tools/performance_benchmark.py)
> *Performance benchmark for Stellar Drift.*

**Size**: `46` lines (`1355` bytes)

**Functions:**
- `def bench(name, fn)`
- `def main()`

---
