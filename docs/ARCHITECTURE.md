# Architecture Documentation - Memory Reconstruction

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GAME APPLICATION                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   Core       │  │   Engine     │  │  Graphics    │  │  Audio     │  │
│  │  Systems     │  │  Systems     │  │  Systems     │  │  Systems   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                 │         │
│         └─────────────────┼─────────────────┼─────────────────┘         │
│                           ▼                 ▼                           │
│                  ┌─────────────────────────────────┐                    │
│                  │         EVENT BUS               │ ◄── Decoupled      │
│                  │    (Typed, Traced, History)     │      Communication │
│                  └──────────────┬──────────────────┘                    │
│                                 │                                      │
│         ┌───────────────────────┼───────────────────────┐              │
│         ▼                       ▼                       ▼              │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐        │
│  │  Gameplay   │        │     AI      │        │  Testing    │        │
│  │  Modules    │        │   Layer     │        │  Framework  │        │
│  └─────────────┘        └─────────────┘        └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Layer

### EventBus (`src/core/EventBus.ts`)
- **Purpose**: Central nervous system for all inter-module communication
- **Features**: Typed events, middleware, history, wildcard subscriptions
- **Key Types**: `EventHandler<T>`, `EventSubscription`, `EventMetadata`
- **Standard Events**: `GameEvents` enum with 40+ event types

### ModuleRegistry (`src/core/ModuleRegistry.ts`)
- **Purpose**: Lifecycle management, dependency resolution, RLM state serialization
- **Features**: Topological sort for init order, token budgeting, shared state
- **Contract**: `IGameModule` interface (name, version, deps, tokenBudget, init/update/shutdown/serialize/deserialize)

### ConfigManager (`src/core/ConfigManager.ts`)
- **Purpose**: Type-safe configuration with Zod validation, hot-reload support
- **Schemas**: Graphics, Audio, Gameplay, AI configs with defaults
- **Features**: Patch updates, watchers, export/import for RLM

### GameApplication (`src/core/GameApplication.ts`)
- **Purpose**: Main game loop, fixed/variable timestep, pause/resume, serialization
- **Loop**: Fixed timestep (60Hz) for simulation, variable for rendering
- **RLM**: `serialize()`/`deserialize()` for full state snapshots
- **Headless**: `runHeadless(steps)` for AI testing

## Engine Layer

### AssetManager (`src/engine/AssetManager.ts`)
- **Purpose**: Centralized asset loading with progress tracking
- **Types**: Textures, Audio, Shaders, Data (JSON)
- **Features**: Caching, preloading, blob URL management, manifest-driven

### InputSystem (`src/engine/InputSystem.ts`)
- **Purpose**: Unified keyboard, mouse, gamepad input with action mapping
- **Features**: Action registry, just-pressed/released detection, movement vectors
- **Actions**: moveUp/Down/Left/Right, attack, dash, interact, pause

## Graphics Layer

### RenderSystem (`src/graphics/RenderSystem.ts`)
- **Engine**: PixiJS v8 with WebGPU/WebGL backend
- **Layers**: background(0) → midground(100) → foreground(200) → effects(300) → ui(1000)
- **Camera**: Position, zoom, rotation, screen shake
- **Parallax**: 5 layers with configurable factors
- **Lighting**: Dynamic point/spot lights with normal mapping
- **Particles**: GPU-accelerated with object pooling
- **Post-Processing**: Bloom, vignette, color grading, CRT (configurable)

### Shaders (`assets/shaders/`)
- `sprite.wgsl` - Basic textured sprite
- `sprite_lit.wgsl` - Normal mapped with PBR lighting
- `post_bloom.wgsl` - Bright extraction + blur
- `post_vignette.wgsl` - Edge darkening
- `post_crt.wgsl` - Scanlines, curvature, chromatic aberration
- `post_colorgrading.wgsl` - LUT, lift/gamma/gain, film grain
- `particle.wgsl` - GPU particle simulation + rendering
- `light.wgsl` - Deferred light volume rendering

## Audio Layer

### AudioSystem (`src/audio/AudioSystem.ts`)
- **Engine**: Web Audio API
- **Architecture**: Master → [Music, SFX, Voice] gains
- **Adaptive Music**: Vertical layering (ambient, melody, percussion, intensity, choir)
- **Intensity System**: 0-1 crossfades layers based on gameplay
- **Spatial Audio**: HRTF panning, distance attenuation
- **Pooling**: SFX source pooling for performance

## Gameplay Layer

### WorldSystem (`src/gameplay/WorldSystem.ts`)
- **World**: Infinite 2D, chunked (512px), deterministic generation
- **Biomes**: 6 types (ruins, forest, caves, crystal, void, sanctuary)
- **Generation**: Multi-octave noise for terrain, structure, detail
- **Entities**: Spawn tables per biome with depth constraints
- **Streaming**: Load/unload based on view distance (3 chunks)

### PlayerSystem (`src/gameplay/PlayerSystem.ts`)
- **Stats**: Health, mana, stamina, base stats (str/dex/int/vit), derived stats
- **State**: Position, velocity, facing, grounded, dashing, attacking, invincible
- **Abilities**: 7 abilities (dash, slash, heal, shield, ultimate + 2 passives)
- **Progression**: Level/XP curve, stat points, memory fragments, run tracking
- **Inventory**: Typed items with rarity, stacking, stats

### CombatSystem (`src/gameplay/CombatSystem.ts`)
- **Entities**: Full stat blocks, AI state machines, hitboxes, status effects
- **Damage**: Physical/magical/true, armor/resistance, crit, knockback
- **Status Effects**: Stun, freeze, burn, poison, slow, silence
- **Projectiles**: Homing, piercing, lifetime, hitbox collision
- **AI Behaviors**: Idle, patrol, chase, attack, flee

## AI Layer

### AISystem (`src/ai/AISystem.ts`)
- **RLM Integration**: State snapshots, token budgeting, compression
- **Agent Framework**: Register/unregister, active agent, decision loop
- **Observation Space**: Compressed screen (64x64), entity array (50x8), player vector (16)
- **Decision Context**: Player state, nearby entities/items, input state
- **Headless Simulation**: Deterministic scenario running for testing

## Testing Layer

### TestingHarness (`src/testing/TestingHarness.ts`)
- **Scenarios**: 5 built-in (movement, combat, world gen, performance, AI)
- **Validation**: Assertions with expected/actual, scoring
- **Replay**: Frame-perfect recording/playback with RNG state
- **Benchmarks**: Statistical analysis (avg, stdDev, throughput)
- **Metrics**: Frame time, memory, entity count, token usage, player/world stats

## Data Flow

### Initialization
```
main.ts
  → EventBus, ConfigManager, ModuleRegistry
  → AssetManager.loadAll()
  → RenderSystem, AudioSystem, InputSystem
  → WorldSystem, PlayerSystem, CombatSystem
  → AISystem, TestingHarness
  → ModuleRegistry.initializeAll() [topological order]
  → GameApplication.start()
```

### Frame Loop (60Hz Fixed)
```
GameApplication.gameLoop()
  → accumulator += deltaTime
  → while accumulator >= fixedTimestep:
      → ModuleRegistry.updateAll(fixedTimestep)  [deterministic]
      → EventBus.emitSync('update:fixed')
      → accumulator -= fixedTimestep
  → EventBus.emitSync('update:variable')  [rendering, input]
  → RenderSystem.render() [PixiJS ticker]
```

### Event Flow Example: Player Attack
```
InputSystem detects attack key
  → EventBus.emit(PLAYER_ATTACK)
  → PlayerSystem.onAttack()
    → Checks cooldown, mana
    → EventBus.emit(COMBAT_HIT, { damage, crit, knockback })
  → CombatSystem.onHit()
    → Resolves target (player/enemy)
    → Calculates damage, applies status
    → EventBus.emit(COMBAT_KILL) if dead
  → RenderSystem plays effect
  → AudioSystem plays SFX
```

### RLM State Snapshot
```
EventBus.emit(RLM_STATE_SNAPSHOT)
  → GameApplication.serialize()
    → ModuleRegistry.serializeAll()
    → { version, timestamp, seed, frame, playTime, modules{}, checksum }
  → Stored in AISystem.stateHistory[100]
  → Available via window.__GAME__.serialize()
```

## Extension Points

### Adding a Module
```typescript
// 1. Implement IGameModule
class MySystem implements IGameModule {
  readonly name = 'mySystem';
  readonly version = '1.0.0';
  readonly dependencies = ['renderSystem'];
  readonly tokenBudget = 1000;
  
  async initialize(context) { ... }
  update(deltaTime) { ... }
  async shutdown() { ... }
  serialize() { ... }
  deserialize(state) { ... }
}

// 2. Register in main.ts
const mySystem = new MySystem(eventBus, config);
moduleRegistry.register(mySystem);
```

### Adding a Game Mode
```typescript
interface IGameMode {
  readonly name: string;
  setup(game: GameApplication): Promise<void>;
  teardown(): Promise<void>;
  onPlayerDeath(): void;
  onLevelComplete(): void;
}
```

### Adding a Render Effect
```typescript
interface IPostProcessEffect {
  readonly name: string;
  apply(renderer: Renderer, source: RenderTexture, target: RenderTexture): void;
  getUniforms(): Record<string, any>;
}
```

### Adding an AI Behavior
```typescript
interface IBehaviorTree {
  readonly name: string;
  tick(context: AIDecisionContext): AIAction | null;
  reset(): void;
}
```

## Performance Considerations

| System | Optimization |
|--------|--------------|
| Render | Layer culling, texture atlases, instanced particles |
| World | Chunk streaming, noise caching, dirty rect updates |
| Combat | Spatial hashing (future), object pooling |
| Audio | Source pooling, compressed formats (OGG) |
| AI | Observation compression, decision throttling |
| Testing | Headless mode, deterministic seeds |

## Security Considerations

- No `eval()` or dynamic code execution
- All user input validated through Zod schemas
- Asset URLs validated against manifest
- RLM state checksums prevent tampering
- Deterministic RNG prevents prediction exploits

## Migration Guide

### Version 0.1 → 0.2 (Planned)
- ECS migration (ecsy → custom)
- WebGPU compute shaders for particles
- WASM physics integration
- Multiplayer synchronization layer

---

*Architecture version: 0.1.0 | Last updated: 2026-10-11*