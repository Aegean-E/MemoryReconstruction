# Contributing to Memory Reconstruction

**Welcome! This project is designed for AI-human collaboration. Every contribution should be understandable by both.**

## Getting Started

### Prerequisites
- Node.js 20+
- VS Code (recommended)
- Git

### Setup
```bash
git clone <repo>
cd MemoryReconstruction
npm install
npm run dev
```

Open http://localhost:3000 - you should see the loading screen.

## Development Workflow

### 1. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes Following Principles
- **AI Readable**: Clear names, types, comments explaining *why*
- **Modular**: New code in appropriate module, interface-first
- **Deterministic**: Use game RNG, no `Math.random()` in game logic
- **Serializable**: All state must work with RLM snapshots
- **Testable**: Add scenario to TestingHarness

### 3. Run Quality Checks
```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm run format       # Prettier
npm test             # All scenarios pass
npm run ai:benchmark # Performance baseline
```

### 4. Commit with Conventional Commits
```bash
git add .
git commit -m "feat(combat): add poison status effect with DoT"
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`

### 5. Push and Create PR
```bash
git push origin feature/your-feature-name
```

## Code Standards

### TypeScript
- **Strict mode**: No `any`, no implicit any
- **Explicit types**: Public APIs fully typed
- **Interfaces over types**: For object shapes
- **Zod schemas**: For all config/data validation

```typescript
// Good
interface PlayerConfig {
  readonly baseHealth: number;
  readonly baseSpeed: number;
}

// Bad
type PlayerConfig = { baseHealth: number; baseSpeed: number; };
const config: any = { health: 100 };
```

### Naming Conventions
| Category | Convention | Example |
|----------|------------|---------|
| Classes | PascalCase | `RenderSystem` |
| Interfaces | IPascalCase | `IRenderable` |
| Types | PascalCase | `DamageEvent` |
| Functions | camelCase | `calculateDamage` |
| Constants | UPPER_SNAKE | `MAX_HEALTH` |
| Events | UPPER_SNAKE | `PLAYER_DAMAGE` |
| Files | PascalCase | `CombatSystem.ts` |
| Shaders | kebab-case | `post_bloom.wgsl` |

### File Organization
```
src/
├── module-name/
│   ├── ModuleSystem.ts      # Main implementation
│   ├── ModuleTypes.ts       # Types/interfaces (if many)
│   └── index.ts             # Exports
```

### Event-Driven Design
```typescript
// Good: Emit events for side effects
eventBus.emit('entity:spawn', { type: 'enemy', x: 100, y: 0 });

// Bad: Direct module calls
combatSystem.spawnEntity({ type: 'enemy', x: 100, y: 0 });
```

### Configuration
```typescript
// Good: Config-driven
const damage = this.config.combat.baseDamage * multiplier;

// Bad: Hardcoded
const damage = 10 * multiplier;
```

## Testing Requirements

### Every Feature Needs:
1. **Unit tests** for pure functions (>80% coverage)
2. **Integration test scenario** in TestingHarness
3. **Deterministic seed** for reproducibility

### Test Scenario Template
```typescript
this.registerScenario({
  id: 'my_feature_test',
  name: 'My Feature Test',
  description: 'Verify X works correctly',
  seed: 12345,  // Fixed seed!
  steps: 600,
  setup: async (harness) => {
    // Arrange
  },
  validate: (result) => ({
    passed: true,
    assertions: [
      { name: 'Assertion', passed: true, expected: 'x', actual: 'x', message: '' }
    ],
    score: 1.0
  })
});
```

### Running Tests
```bash
npm test                    # All scenarios
npm test -- --reporter=verbose  # Detailed output
npm run ai:benchmark        # Performance benchmarks
```

## Pull Request Checklist

- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Format applied (`npm run format`)
- [ ] All tests pass (`npm test`)
- [ ] Benchmarks within budget (`npm run ai:benchmark`)
- [ ] Deterministic replay verified
- [ ] Token budget documented
- [ ] Documentation updated (AI_AGENT_GUIDE.md, ARCHITECTURE.md)
- [ ] Conventional commit messages
- [ ] No `console.log` in production code
- [ ] No `Math.random()` in game logic

## Adding Content

### New Entity
1. Add template in `CombatSystem.createEntity()`
2. Add spawn table to biome in `WorldSystem.initializeBiomes()`
3. Add assets to `assets/manifest.json`
4. Create test scenario

### New Ability
1. Add to `PlayerSystem.initializeAbilities()`
2. Implement in `PlayerSystem.useAbility()`
3. Add visual effect in `RenderSystem`
4. Add SFX in `AudioSystem`
5. Create test scenario

### New Biome
1. Add config to `WorldSystem.initializeBiomes()`
2. Add tileset to manifest
3. Create shader variants if needed
4. Test with `world_generation` scenario

### New Shader
1. Create `.wgsl` in `assets/shaders/`
2. Register in `RenderSystem.setupPostProcessing()` or similar
3. Add uniforms to Uniforms struct
4. Test visually

## AI Agent Guidelines

If you're an AI agent contributing:

1. **Read PROJECT_PRINCIPLES.md first**
2. **Read AI_AGENT_GUIDE.md for patterns**
3. **Follow module contract exactly**
4. **Declare token budget honestly**
5. **Make state serializable**
6. **Use deterministic RNG**
7. **Write test scenarios**
8. **Document extension points**

## Review Process

### For Humans
- Focus on: Architecture, UX, game feel, balance
- Trust: Type safety, test coverage, determinism

### For AI Agents
- Focus on: Contract compliance, serialization, token budgets, determinism
- Verify: All interfaces implemented, events typed, configs validated

## Release Process

1. Version bump in `package.json`
2. Update CHANGELOG.md
3. Tag release: `git tag v0.x.x`
4. Build: `npm run build`
5. Deploy `dist/` to hosting

## Code of Conduct

- Be respectful and inclusive
- Explain decisions for AI readability
- Prefer explicit over clever
- Document *why*, not just *what*
- Test before committing

## Getting Help

- Check `docs/AI_AGENT_GUIDE.md` for patterns
- Check `docs/ARCHITECTURE.md` for system design
- Console: `window.__GAME__`, `window.__TESTING_HARNESS__`
- Debug: `window.__MODULE_REGISTRY__.getAllMetadata()`

---

**Remember**: This project exists to demonstrate AI-human collaborative development. Your contributions should be a joy for both to read and maintain.