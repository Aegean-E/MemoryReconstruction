# Graphics System - Memory Reconstruction

## Art Direction: Memory Light

Memory Reconstruction is a fragmented world rebuilt from remembered light. The
visual language contrasts **weathered matter** with **luminous memory**:

| Element | Palette | Meaning |
|---|---|---|
| Void | `#0A0A14`, `#1F2442` | erased history, deep shadow |
| Memory cyan | `#6FE7FF` | fragments, echoes, player light |
| Pale gold | `#FFD98A` | sanctuary, UI, recovered truth |
| Lavender | `#B89CFF` | crystal and echo magic |
| Ember | `#FF6B6B` | corruption, hazards, lost life |
| Sanctuary ivory | `#FFF4D0` | reconstruction, endings |

The Memory Walker is a hooded figure in indigo cloth with a cyan scarf, a gold
memory core and a shard blade. Enemies are readable silhouettes first: hunched
scavengers, stone constructs, drifting echoes, forest beasts, crystal duelists,
void wraiths and the radiant Keeper.

## Generated Asset Pipeline

All art is deterministic and regenerated with Pillow from the project root:

```bash
python scripts/generate_art_assets.py
```

The generator writes:

```text
assets/
  manifest.json                  runtime texture/shaders/data manifest
  data/sprite_atlas.json         frame, origin, animation and tile metadata
  data/graphics.assets.json      human-readable asset catalogue
  banner.png
  sprites/player/                idle, walk, attack, dash strips
  sprites/enemies/               4x4 sheets: idle, walk, attack, death
  sprites/tilesets/              4 variants x 9 tile rows per biome
  sprites/backgrounds/           parallax backdrop per biome
  sprites/props/                 fountains, statues, doors, rifts, chests
  sprites/ui/                    health, mana, stamina, memory icons
  sprites/particles/             spark, smoke, blood, magic
```

### Atlas model

`sprite_atlas.json` is the single source of truth for presentation:

- `player.animations[state]` - texture strip, frame count, FPS, loop flag.
- `enemies[id]` - 64x64 grid, 4 columns, 4 rows, origin and animation rows.
- `tilesets[biome]` - 32px tiles, 4 variants, row map for
  `empty/floor/wall/platform/hazard/water/ladder/door/secret`.
- `backgrounds`, `props`, `ui`, `particles` - texture paths used by the HUD
  and future scene decoration.

The atlas is bundled at build time, while the images are served from the
`assets` public directory. Both development and production use the same
`resolveAssetUrl` helper, so relative paths work under `base: './'`.

## Runtime

- **RenderSystem** loads tileset atlases and biome backdrops, renders a
  camera-aware tiling backdrop, and exposes `getTileTexture()`.
- **WorldSystem** generates 32px tiles and draws each tile from the biome
  atlas, clamping variant indices safely.
- **ActorRenderer** loads player strips and enemy sheets, animates actors from
  gameplay state, flips them by facing, follows the player with the camera, and
  draws a themed health/mana/stamina HUD on the UI layer.
- **Layers**: background(0) -> midground(100) -> foreground(200) ->
  effects(300) -> ui(1000), with a backdrop at z-index -1000.
- **Post-processing** remains bloom, vignette and color grading.

## Characters

| Asset | Silhouette | Motion |
|---|---|---|
| Memory Walker | hood, scarf, shard blade | bob, walk, slash arc, dash streaks |
| Scavenger | hunched rags, bone mask, claws | lope, lunge |
| Guardian | blocky stone, cyan core | heavy march, slam |
| Memory Echo | floating tatters, two eyes | drift, pulse |
| Wildling | antlered forest beast | prowl |
| Spirit | antlered wisp | float |
| Cave Dweller | low body, large ears | scuttle |
| Crystal Golem | faceted mass, crystal growths | stomp |
| Shadow | tall void silhouette | phase drift |
| Crystal Guardian | slim armor, rapier | duelist sweep |
| Prism Entity | geometric shards | orbit |
| Void Walker | elongated rift | glide |
| The Forgotten | broken armor, empty helm | relentless |
| The Keeper | gold robe, halo, staff | judgment |

## Biomes

Ruins use sandstone and memory dust; the forest adds emerald canopy and spores;
caves use slate and cyan veins; crystal gardens use violet facets; the void is
near-black with cyan rifts; the sanctuary is ivory and gold.

## Verification

- `npm test` checks that the atlas references real generated files.
- `npm run build` copies `assets/` into `dist/` and bundles the atlas metadata.
- `docs/performance_guidelines.md` covers frame-budget expectations.
