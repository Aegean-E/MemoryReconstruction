# AI Agent Guide - Memory Reconstruction

**This guide is for ANY AI agent working on this project. Read completely before making changes.**

## Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Lint & format
npm run lint && npm run format
```

## Project Structure (Mental Map)

```
src/
├── core/           # Foundation: EventBus, ModuleRegistry, ConfigManager, GameApplication
├── engine/         # AssetManager, InputSystem
├── graphics/       # RenderSystem (PixiJS + WebGPU shaders)
├── audio/          # AudioSystem (Web Audio API + adaptive music)
├── gameplay/       # WorldSystem, PlayerSystem, CombatSystem, MemoryFragmentSystem
├── ai/             # AISystem (RLM compatibility, AI agents)
├── testing/        # TestingHarness (deterministic testing, replay)
└── utils/          # Math, Color, String, Time, Array, Object helpers
```

## Core Principles (NON-NEGOTIABLE)

| Principle | What It Means For You |
|-----------|----------------------|
| **AI Compatibility** | Every file readable by any AI. Clear names, explicit types, documented intent. |
| **Modularity** | Interface-first. No hardcoded deps. Event-driven. Swappable modules. |
| **RLM Compatible** | State serializable to JSON. Token budgets declared. Deterministic seeds. |
| **AI Testable** | Headless mode. Deterministic replay. Benchmark scenarios. Observable metrics. |
| **2.5D Graphics** | Layered rendering, parallax, dynamic lighting, particles, post-processing. |
| **Human Appeal** | Genre: Action-Roguelike Metroidvania. Style: Hand-painted + 3D lighting. Story: Memory reconstruction. Music: Adaptive orchestral. |

## Module Contract (EVERY Module Must Implement)

```typescript
interface IGameModule {
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];      // Other module names
  readonly tokenBudget: number;         // RLM context tokens
  
  initialize(context: ModuleContext): Promise<void>;
  update(deltaTime: number): void;
  shutdown(): Promise<void>;
  serialize(): ModuleState;             // For RLM snapshots
  deserialize(state: ModuleState): void;
}
```

## Event System (Primary Communication)

```typescript
// Subscribe
const unsub = eventBus.on('player:damage', (data) => { ... });

// Emit
eventBus.emit('combat:hit', { damage: 10, critical: true });

// Standard events (see EventBus.ts for full list)
GameEvents.PLAYER_MOVE, GAME_START, FRAME_START, RLM_STATE_SNAPSHOT, ...
```

## RLM State Protocol

```json
{
  "version": "1.0",
  "timestamp": 1234567890,
  "seed": 42,
  "frame": 12345,
  "playTime": 205.3,
  "modules": {
    "player": { "version": "1.0", "data": { "health": 80, "position": [100, 200] } },
    "world": { "version": "1.0", "data": { "chunks": [...] } }
  },
  "checksum": "abc123"
}
```

**Access via:**
- `window.__GAME__.serialize()` - Full state
- `window.__MODULE_REGISTRY__.serializeAll()` - Module states
- `window.__TESTING_HARNESS__.runScenario('basic_combat', 12345)` - Deterministic test

## Deterministic Randomness

```typescript
// ALWAYS use game RNG, never Math.random()
const rng = (window as any).__GAME_RNG__;  // Seeded LCG
const value = rng();        // [0, 1)
const int = Math.floor(rng() * (max - min + 1)) + min;
```

## Adding a New Module

1. Create `src/your-module/YourSystem.ts` implementing `IGameModule`
2. Export from `src/your-module/index.ts`
3. Register in `main.ts` with dependencies
4. Add token budget estimate
5. Add config schema in `ConfigManager.ts` if needed
6. Write test scenario in `TestingHarness.ts`

## Adding a New Entity Type

1. Add to `CombatSystem.createEntity()` template
2. Define stats, AI behavior, hitbox, sprite
3. Add spawn table to biome config in `WorldSystem.ts`
4. Add assets to `manifest.json`
5. Write test scenario

## Adding a New Ability

1. Add to `PlayerSystem.initializeAbilities()`
2. Define cooldown, mana cost, type, max level
3. Implement in `PlayerSystem.useAbility()`
4. Add visual effect in `RenderSystem.playEffect()`
5. Add SFX in `AudioSystem.playSfx()`

## Adding a New Biome

1. Add to `WorldSystem.initializeBiomes()`
2. Define tile palette, entity tables, colors, music
3. Add tileset to `manifest.json`
4. Create shaders if needed
5. Test with `world_generation` scenario

## Configuration

All config in `assets/data/*.config.json` with Zod schemas in `ConfigManager.ts`.

```typescript
// Access in module
const config = configManager.get('gameplay');
const playerSpeed = config.player.baseSpeed;
```

## Testing (AI-First)

```bash
# Run specific scenario
npm run test -- --testNamePattern="basic_combat"

# Run all scenarios
npm run test

# Benchmark
npm run ai:benchmark

# Headless replay
npm run ai:replay -- --scenario=basic_combat --seed=12345
```

**Every change must pass:**
- TypeScript strict mode
- ESLint + Prettier
- Unit tests > 80% coverage
- AI benchmark scenarios
- Deterministic replay verification
- Token budget audit

## Debugging Tools (Available in Console)

```javascript
// Game state
window.__GAME__.getStats()
window.__GAME__.serialize()

// Module registry
window.__MODULE_REGISTRY__.getAllMetadata()

// Testing
window.__TESTING_HARNESS__.runScenario('basic_combat', 12345)
window.__TESTING_HARNESS__.getResults()

// AI
window.__GAME__.aiSystem.getActiveAgent()
window.__GAME__.aiSystem.createObservation()

// Config
window.__GAME__.configManager.export()

// Input
window.__GAME__.inputSystem.getState()
```

## Common Patterns

### Event-Driven Communication
```typescript
// Good: Decoupled
eventBus.emit('entity:spawn', { type: 'enemy', x: 100, y: 100 });

// Bad: Direct coupling
combatSystem.spawnEntity({ type: 'enemy', x: 100, y: 100 });
```

### Configuration Over Hardcoding
```typescript
// Good
const speed = this.config.player.baseSpeed;

// Bad
const speed = 200;
```

### Serialization for RLM
```typescript
serialize(): ModuleState {
  return {
    version: this.version,
    timestamp: Date.now(),
    data: { /* only serializable data */ },
    checksum: this.computeChecksum()
  };
}
```

### Deterministic Updates
```typescript
update(deltaTime: number): void {
  // Use fixed timestep from GameApplication
  // Never use Date.now() or performance.now() for game logic
}
```

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Systems | `*System.ts` | `RenderSystem.ts` |
| Components | `*Component.ts` | `HealthComponent.ts` |
| Entities | `*Entity.ts` | `PlayerEntity.ts` |
| Events | `*Event.ts` | `DamageEvent.ts` |
| Interfaces | `I*.ts` | `IRenderable.ts` |
| Types | `*.types.ts` | `combat.types.ts` |
| Config | `*.config.json` | `graphics.config.json` |
| Shaders | `*.wgsl` | `sprite.wgsl` |

## Extension Points (Where to Add Features)

| Feature | Location | Interface |
|---------|----------|-----------|
| New entity | `CombatSystem.ts` | Entity template |
| Game mode | `GameApplication.ts` | `IGameMode` |
| Render effect | `RenderSystem.ts` | `IPostProcessEffect` |
| AI behavior | `AISystem.ts` | `IBehaviorTree` |
| World generator | `WorldSystem.ts` | `IWorldGenerator` |
| Audio layer | `AudioSystem.ts` | `IAudioLayer` |

## Performance Budgets

| Metric | Target |
|--------|--------|
| Frame time | < 16.67ms (60 FPS) |
| Draw calls | < 100 |
| Triangles | < 50k |
| Particles | < 10k |
| Token budget | < 50k |
| Memory growth | < 50MB/30min |

## When in Doubt

1. **Check existing patterns** in similar modules
2. **Read PROJECT_PRINCIPLES.md** for philosophy
3. **Ask**: "Would another AI understand this?"
4. **Ask**: "Is this deterministic and serializable?"
5. **Ask**: "Does this follow the module contract?"

## Emergency Contacts (Code Owners)

- Core architecture: `src/core/`
- Rendering: `src/graphics/RenderSystem.ts`
- Gameplay: `src/gameplay/`
- AI/Testing: `src/ai/`, `src/testing/`
- Config: `src/core/ConfigManager.ts`

---

**Remember**: This project showcases AI-human collaboration. Every decision should be explainable to another AI and enjoyable for a human.