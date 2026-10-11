# Graphics System - Memory Reconstruction

## Overview
2.5D graphics pipeline built on PixiJS v8 with WebGPU/WebGL backend. Designed for human-liked aesthetics, modular expansion, and RLM compatibility.

## Principles
- **Modular**: Layers, shaders, post-processing are swappable modules
- **AI-Compatible**: Asset generation is programmatic, configs are validated with Zod
- **RLM-Friendly**: Graphics state serializable via ConfigManager, token-budgeted
- **Human-Liked**: Parallax, dynamic lighting, bloom, color grading, vignette

## Architecture
- **Layers**: background(0) → midground(100) → foreground(200) → effects(300) → ui(1000)
- **Parallax**: 5 layers with configurable factors
- **Post-Processing**: Bloom, vignette, color grading, CRT (optional)
- **Particles**: GPU-accelerated with object pooling, max 10k particles
- **Lighting**: Dynamic point/spot lights with normal mapping

## Assets
Generated placeholder sprites for initial development:
- `assets/sprites/player/` - idle, walk, attack, dash
- `assets/sprites/enemies/` - scavenger, guardian, echo
- `assets/sprites/tilesets/` - ruins, forest, caves, crystal, void, sanctuary
- `assets/sprites/ui/` - health, mana, stamina
- `assets/sprites/particles/` - spark, smoke, blood, magic

Generation script: `scripts/generate_graphics.py`
Run: `python scripts/generate_graphics.py`

## Configuration
`assets/data/graphics.config.json`
- Resolution, rendering options, layers, parallax, post-processing, particles

## Shaders
`assets/shaders/` - WGSL shaders for sprites, lighting, particles, post-processing

## UI Aesthetics
Loading screen uses Cinzel + Inter fonts with gradient shimmer, dark theme #0a0a0f → #1a1a2e
Human-liked color palette: gold/orange accents, soft blues for player

## Testing
- Visual regression via TestingHarness
- Headless rendering mode for AI testing
- Performance metrics: FPS, draw calls, particles

## Extension
Add new render effect implementing `IPostProcessEffect`
Add new layer via RenderSystem.createLayers()
