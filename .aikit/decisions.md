# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

<!-- Entry format: one entry per decision that changes a contract, a dependency, a data format
or the architecture; see the header above for where each entry goes. -->

### ADR-001: Adopt AIKit as this project's governance and lifecycle layer
- **Date**: 2026-10-19
- **Status**: Accepted
- **Context**: The project lived in AIKit's `projects/` folder without `.aikit/` memory, so no cockpit could report its task, resume a cold start, or run its gates.
- **Decision**: Register the folder as an AIKit project (`.aikit/` memory, per-project ledger and decisions register), and run `python aikit.py check MemoryReconstruction` as the Phase 4 gate before every commit.
- **Consequences**: Work gains checkpoints, cold-start resume and gate-verified commits; the first gate run reports pre-existing failures (lint `--ext` under flat config, TypeScript errors, hygiene findings, README drift) that must be fixed before the first project commit.

### ADR-002: Establish two-tier ESLint flat configuration and fix initial verification gates
- **Date**: 2026-10-19
- **Status**: Accepted
- **Context**: ESLint 8.57 with `"type": "module"` failed to load the legacy CommonJS config and `--ext` flag. Furthermore, pre-existing type errors in event handling, configuration generics, nullable references, build minification, hygiene external URLs, and README cold-start documentation blocked Phase 4 integration gates.
- **Decision**: Adopt ESM flat config for ESLint with two tiers (blocking errors for syntax/formatting/base correctness, non-blocking warnings for type-checked strictness debt); use Vite built-in esbuild minifier; annotate deliberate external web font links with hygiene exceptions; make script paths portable; and document cold-start quick references in README.md.
- **Consequences**: All 7 project gates (test, lint, typecheck, build, hygiene, guidelines, secrets) pass cleanly, establishing verified baseline CI/CD integration under AIKit governance.

### ADR-003: Collect memory fragments as a dedicated gameplay module
- **Date**: 2026-10-20
- **Status**: Accepted
- **Context**: `WorldSystem` already emitted `memoryFragment` spawn markers and `CombatSystem` already emitted `player:addMemory` on kills, but no code turned markers into collectibles, `PlayerSystem` ignored the memory event, and the HUD showed no fragment or level progress.
- **Decision**: Add `MemoryFragmentSystem` to own world-fragment presentation, pickup detection and a serialized collected-id set; route both world pickups and combat rewards through `player:addMemory`; grant configurable fragment XP in `PlayerSystem`; and unlock abilities at configured levels. The HUD reads `ProgressionData` directly, so presentation stays a consumer of gameplay state.
- **Consequences**: The core loop is playable and deterministic: collect, gain XP, level up, unlock heal/shield/ultimate. Fragment positions survive chunk unload/reload without respawning because collected ids are persisted, and `WorldSystem.ensureChunk` now re-renders cached chunks when the player returns instead of leaving a hole. The `player:levelUp` input listener was renamed `player:grantLevel` to stop the output event from re-entering `levelUp()`.
