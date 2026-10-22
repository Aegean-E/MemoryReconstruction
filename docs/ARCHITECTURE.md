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
- **Entities**: Spawn tables per biome with depth constraints; chunks register their tiles before entity generation so spawn validation can reject non-walkable positions
- **Depth**: Chunk-derived depth is emitted as `world:depthChanged` on chunk crossings, matching the entity-scale formula
- **Streaming**: Load/unload based on view distance (3 chunks)

### MemoryFragmentSystem (`src/gameplay/MemoryFragmentSystem.ts`)

- **Source of truth**: World chunk spawn tables already mark `memoryFragment` positions; the system derives a stable id from `chunkX,chunkY:entityIndex`.
- **Presentation**: Animated memory-light sprites on the midground layer, with a deterministic bob and a graceful white-sprite fallback when the texture is unavailable.
- **Collection**: Each update compares the player position against the configured pickup radius; a collected id is added to a serialized set so an unloaded and regenerated chunk never respawns it.
- **Events**: Emits `player:addMemory`, `memory:fragmentCollected` and a `memoryPickup` graphics effect, keeping progression and presentation decoupled.
- **Loot drops**: Listens for `item:drop`, creates a 30-second transient pickup, routes memory currency to `player:addMemory` and equipment to `player:addItem`, and keeps drop ids out of the persisted collected set.

### PlayerSystem (`src/gameplay/PlayerSystem.ts`)

- **Stats**: Health, mana, stamina, base stats (str/dex/int/vit), derived stats
- **State**: Position, velocity, facing, grounded, dashing, attacking, invincible
- **Abilities**: 7 abilities (dash, slash, heal, shield, ultimate + 2 passives)
- **Melee reach**: `combat.meleeOffset` + `combat.meleeRange` (20 + 35 = 55px by default) keeps the facing cone from outranging every melee enemy
- **Progression**: Level/XP curve, stat points, memory fragments, deepest depth, completed runs
- **Run loop**: Normal death applies `roguelike.deathXpLoss` to current-level XP; `roguelike.permadeath` resets run-scoped progression and inventory while preserving meta stats; both emit `player:runEnded`. Killing the Keeper completes the run once until death, then emits `player:runCompleted`
- **Inventory**: Typed items with rarity, legal stacking, stats; consumables heal/cleanse/convert memory and equipment applies derived-stat bonuses on equip/unequip

### ItemCatalog (`src/gameplay/itemCatalog.ts`)

- **Source of truth**: Flattens the categories in `src/data/items.json` into one id lookup.
- **Consumers**: Combat loot tables resolve ids into complete item definitions before emitting `item:drop`; inventory pickups receive the same authored data.

### EnemyCatalog (`src/gameplay/enemyCatalog.ts`)

- **Source of truth**: `src/data/enemies.json` supplies the authored stat blocks, aggro/attack ranges, hitboxes and sprite sizes for every enemy type.
- **Archetypes**: Adds the combat-only `melee`, `ranged` and `skirmisher` profiles plus per-type windup/recovery, projectile speed and retreat timing.
- **Coverage**: Every type in the biome spawn tables resolves through the catalog, so no world spawn is silently dropped by the combat layer.

### CombatSystem (`src/gameplay/CombatSystem.ts`)

- **Entities**: Full stat blocks, AI state machines, hitboxes, status effects
- **Damage**: Physical/magical/true, armor/resistance, crit, knockback
- **Attack Intents**: Directional melee intent resolution (`combat:attack` with `facing`/`arc`) decoupled from resolved damage events (`combat:damage`); `combat:attackResolved` reports the hit count for hit-confirmed combos
- **Damage feedback**: Resolved hits append to a simulation-time damage-number buffer; `ActorRenderer` projects them through a pooled floating-text layer
- **Enemy Telegraphs**: Ready → windup → strike → recovery state machine; windups are stationary and cancelled by stun/freeze or damage at or above `staggerThreshold`. Ordinary knockback no longer cancels a windup, so melee enemies can finish their commitment.
- **Loot and phases**: Each entity carries its authored `lootTable` (rolled once per row) and boss `phases` (crossed once per health threshold, applying speed/damage/armor multipliers and executing authored phase abilities such as summons, rings, teleports and aimed spreads). Bosses are excluded from random elite rolls.
- **Status Effects**: Stun, freeze, burn, poison, slow, silence
- **Projectiles**: Team-tagged (player shots hit enemies, enemy shots hit only the player), homing, piercing, lifetime, hitbox collision
- **AI Behaviors**: Idle, patrol, chase, attack, flee, with melee/ranged/skirmisher archetype logic

### SaveSystem (src/gameplay/SaveSystem.ts)

- **Persistence**: LocalStorage save/load of deterministic GameState
- **Metadata**: Level, memory fragment count, playtime, and timestamp tracking
- **Settings**: Persistent configuration for audio volumes and screen effects

### MenuSystem (src/ui/MenuSystem.ts)

- **Overlays**: Title Screen, In-Game Pause Menu, Tutorial, Story & Chronicles, Settings, Memory Restored victory screen
- **Run feedback**: Reacts to `player:runCompleted` with the victory modal and to `player:runEnded` with a death/XP-loss toast; `victorySummary.ts` formats the modal data as a pure, unit-tested helper
- **Inventory overlay**: Lists equipped slots and backpack items, delegating Use/Equip/Unequip actions to `PlayerSystem` and re-rendering on inventory/equipment events
- **Interaction**: Keyboard shortcut (ESC) and HUD button triggers, auto-pausing game loop
- **Feedback**: Non-intrusive toast notification system

## AI Layer

### AISystem (`src/ai/AISystem.ts`)

- **RLM Integration**: State snapshots, token budgeting, compression
- **Agent Framework**: Register/unregister, active agent, decision loop
- **Observation Space**: Compressed screen (64x64), entity array (50x8), player vector (16)
- **Decision Context**: Player state, nearby entities/items, input state
- **Headless Simulation**: Deterministic scenario running for testing

## Testing Layer

### Balance Harness (`tests/balance.test.ts`)

- **Deterministic duels**: Builds real PlayerSystem + CombatSystem instances and runs stationary 30-second DPS checks across enemy types and player levels.
- **Metrics**: outcome, time-to-kill, damage dealt/taken and hit count; `BALANCE_REPORT=1` prints the full matrix.
- **Regression guards**: level-1 scavenger victory, deterministic repeat runs, and a level-1 Keeper not being killable.

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
    → EventBus.emit(COMBAT_ATTACK, { sourceId, x, y, radius, damage, critical, facing, arc })
  → CombatSystem.onAttackIntent()
    → Facing-cone query resolves live entities in range
    → Calculates damage with crit/armor, applies knockback
    → EventBus.emit(COMBAT_DAMAGE, DamageEvent)
    → EventBus.emit(COMBAT_KILL) if dead
    → EventBus.emitSync('combat:attackResolved', { sourceId, hits })
  → PlayerSystem extends the combo chain only when hits > 0
  → RenderSystem plays effect
  → AudioSystem plays SFX
```

### Event Flow Example: Memory Fragment Pickup

```
MemoryFragmentSystem sees the player inside pickupRadius
  → marks the fragment id collected and removes its sprite
  → EventBus.emit('player:addMemory', { amount: 1 })
  → PlayerSystem increments memoryFragments and grants fragment XP
  → levelUp() may unlock heal/shield/ultimate from progression.abilityUnlocks
  → EventBus.emit('player:memoryChanged') and 'player:abilityUnlocked'
  → ActorRenderer HUD reads progression for the fragment count and level
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

| System  | Optimization                                        |
| ------- | --------------------------------------------------- |
| Render  | Layer culling, texture atlases, instanced particles |
| World   | Chunk streaming, noise caching, dirty rect updates  |
| Combat  | Spatial hashing (future), object pooling            |
| Audio   | Source pooling, compressed formats (OGG)            |
| AI      | Observation compression, decision throttling        |
| Testing | Headless mode, deterministic seeds                  |

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

_Architecture version: 0.1.0 | Last updated: 2026-10-11_
