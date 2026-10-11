# RLM Compatibility - Memory Reconstruction

## Overview
Recursive Language Models treat massive prompts as external environment states inside a programming shell rather than stuffing everything into context window. This codebase is designed for RLM from the ground up.

## Core RLM Features

### 1. Module Registry with Token Budgeting
`src/core/ModuleRegistry.ts`
- Every module implements `IGameModule` with `readonly tokenBudget: number`
- Total token budget tracked via `getTotalTokenBudget()`
- Modules are initialized topologically for deterministic state
- State snapshots via `serializeAll()` / `deserializeAll()`

### 2. Serializable Game State
`src/core/GameApplication.ts`
```typescript
serialize(): GameState
deserialize(state: GameState): Promise<void>
runHeadless(steps: number): Promise<GameState>
```
- Full game state including RNG seed, frame count, play time, module states
- Headless simulation for AI testing without rendering
- Deterministic fixed timestep for reproducible runs

### 3. Config Manager
`src/core/ConfigManager.ts`
- Type-safe configs with Zod validation
- `export()` for full config snapshot
- Hot-reload with patch updates, RLM-friendly

### 4. Event Bus with History
`src/core/EventBus.ts`
- Typed events with middleware and history
- Event replay for deterministic reconstruction
- Decoupled communication prevents context bloat

### 5. AI Layer Integration
`src/ai/AISystem.ts`
- Observation space compression: 64x64 screen, entity arrays, player vector
- Decision throttling and token budgeting
- State history buffer for RLM snapshots

### 6. Testing Harness
`src/testing/TestingHarness.ts`
- Headless scenarios, replay, benchmarks
- Deterministic seeds for reproducible AI tests
- Metrics include token usage

## RLM Usage Patterns

### State Snapshot
```typescript
const state = window.__GAME__.serialize();
localStorage.setItem('rlm_state', JSON.stringify(state));
```

### State Restore
```typescript
const state = JSON.parse(localStorage.getItem('rlm_state'));
await window.__GAME__.deserialize(state);
```

### Headless AI Test
```typescript
const finalState = await window.__GAME__.runHeadless(1000);
```

### Token Budget Check
```typescript
const budget = window.__MODULE_REGISTRY__.getTotalTokenBudget();
// < 50000 for RLM safety
```

## Design Principles
- **External State**: Game state lives in modules, not in prompt context
- **Bounded Context**: Token budgets per module, observation compression
- **Determinism**: Seeded RNG, fixed timestep, replayable events
- **Modularity**: Modules can be loaded/unloaded without breaking state
- **AI Testable**: Headless mode, serialization, metrics

## Compliance Checklist
- [x] All modules implement IGameModule with serialize/deserialize
- [x] Token budgets declared for all modules
- [x] GameApplication provides serialize/deserialize/runHeadless
- [x] ConfigManager supports export/import
- [x] EventBus provides history and typed events
- [x] Deterministic RNG and fixed timestep
- [x] Headless testing harness available

## Migration Notes
No prompt stuffing. Large data stays in `assets/`, `ModuleRegistry`, and serialized state files. AI agents interact via REPL-style API:
- `window.__GAME__.serialize()`
- `window.__TESTING_HARNESS__.runScenario()`
- `window.__MODULE_REGISTRY__.getAllMetadata()`

This keeps context usage bounded even as game grows.
