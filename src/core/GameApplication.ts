/**
 * Game Application - Main game loop and lifecycle management
 *
 * Coordinates all systems, manages the game loop, and provides
 * serialization for RLM compatibility.
 */

import type { EventBus } from './EventBus';
import { GameEvents } from './EventBus';
import type { ModuleRegistry } from './ModuleRegistry';
import type { ConfigManager } from './ConfigManager';
import type { AssetManager } from '@engine/AssetManager';
import type { RenderSystem } from '@graphics/RenderSystem';
import type { InputSystem } from '@engine/InputSystem';
import type { AudioSystem } from '@audio/AudioSystem';
import type { WorldSystem } from '@gameplay/WorldSystem';
import type { PlayerSystem } from '@gameplay/PlayerSystem';
import type { CombatSystem } from '@gameplay/CombatSystem';
import type { AISystem } from '@ai/AISystem';
import type { TestingHarness } from '@testing/TestingHarness';

export interface GameApplicationDependencies {
  eventBus: EventBus;
  configManager: ConfigManager;
  moduleRegistry: ModuleRegistry;
  assetManager: AssetManager;
  renderSystem: RenderSystem;
  inputSystem: InputSystem;
  audioSystem: AudioSystem;
  worldSystem: WorldSystem;
  playerSystem: PlayerSystem;
  combatSystem: CombatSystem;
  aiSystem: AISystem;
  testingHarness: TestingHarness;
}

export interface GameState {
  version: string;
  timestamp: number;
  seed: number;
  running: boolean;
  paused: boolean;
  frameCount: number;
  playTime: number;
  modules: Record<string, any>;
  rngState: string;
}

export class GameApplication {
  private deps: GameApplicationDependencies;
  private running = false;
  private paused = false;
  private lastTime = 0;
  private frameCount = 0;
  private playTime = 0;
  private seed: number;
  private rng: () => number;
  private animationFrameId: number | null = null;
  private fixedTimestep = 1 / 60;
  private accumulator = 0;
  private maxSubSteps = 5;

  constructor(deps: GameApplicationDependencies) {
    this.deps = deps;
    const gameplayConfig = deps.configManager.get<any>('gameplay');
    this.seed = gameplayConfig.world.seed;
    this.rng = this.createRNG(this.seed);

    // Set global RNG for deterministic behavior
    (window as any).__GAME_RNG__ = this.rng;

    this.setupEventListeners();
  }

  /**
   * Create deterministic RNG from seed
   */
  private createRNG(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  /**
   * Get deterministic random value
   */
  random(): number {
    return this.rng();
  }

  /**
   * Get random integer in range [min, max]
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Get random float in range [min, max]
   */
  randomFloat(min: number, max: number): number {
    return this.random() * (max - min) + min;
  }

  /**
   * Setup core event listeners
   */
  private setupEventListeners(): void {
    const { eventBus } = this.deps;

    eventBus.on(GameEvents.GAME_PAUSE, () => this.pause());
    eventBus.on(GameEvents.GAME_RESUME, () => this.resume());
    eventBus.on(GameEvents.GAME_SHUTDOWN, () => this.shutdown());

    // RLM state snapshots
    eventBus.on(GameEvents.RLM_STATE_SNAPSHOT, async () => {
      const state = this.serialize();
      eventBus.emit(GameEvents.RLM_STATE_SNAPSHOT + ':result', state);
    });
  }

  /**
   * Start the game loop
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();

    await this.deps.eventBus.emit(GameEvents.GAME_START, { seed: this.seed });

    this.gameLoop();
  }

  /**
   * Main game loop
   */
  private gameLoop = (time: number = performance.now()): void => {
    if (!this.running) return;

    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    if (!this.paused) {
      // Fixed timestep for deterministic simulation
      this.accumulator += deltaTime;
      let steps = 0;

      while (this.accumulator >= this.fixedTimestep && steps < this.maxSubSteps) {
        this.fixedUpdate(this.fixedTimestep);
        this.accumulator -= this.fixedTimestep;
        steps++;
      }

      // Variable timestep update for rendering
      this.variableUpdate(deltaTime);

      this.frameCount++;
      this.playTime += deltaTime;
    }

    // Emit frame events
    this.deps.eventBus.emitSync(GameEvents.FRAME_START, {
      frame: this.frameCount,
      deltaTime,
      playTime: this.playTime,
    });

    this.deps.eventBus.emitSync(GameEvents.FRAME_END, {
      frame: this.frameCount,
    });

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  /**
   * Fixed timestep update (deterministic)
   */
  private fixedUpdate(deltaTime: number): void {
    this.deps.moduleRegistry.updateAll(deltaTime);
    this.deps.eventBus.emitSync('update:fixed', { deltaTime });
  }

  /**
   * Variable timestep update (rendering, input)
   */
  private variableUpdate(deltaTime: number): void {
    this.deps.eventBus.emitSync('update:variable', { deltaTime });
  }

  /**
   * Pause the game
   */
  pause(): void {
    if (!this.paused && this.running) {
      this.paused = true;
      this.deps.eventBus.emit(GameEvents.GAME_PAUSE, {});
      this.deps.audioSystem.pauseAll();
    }
  }

  /**
   * Resume the game
   */
  resume(): void {
    if (this.paused && this.running) {
      this.paused = false;
      this.lastTime = performance.now();
      this.deps.eventBus.emit(GameEvents.GAME_RESUME, {});
      this.deps.audioSystem.resumeAll();
    }
  }

  /**
   * Shutdown the game
   */
  async shutdown(): Promise<void> {
    if (!this.running) return;

    this.running = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    await this.deps.moduleRegistry.shutdownAll();
    await this.deps.eventBus.emit(GameEvents.GAME_SHUTDOWN, {});
  }

  /**
   * Serialize complete game state for RLM
   */
  serialize(): GameState {
    const moduleStates = this.deps.moduleRegistry.serializeAll();

    return {
      version: '0.1.0',
      timestamp: Date.now(),
      seed: this.seed,
      running: this.running,
      paused: this.paused,
      frameCount: this.frameCount,
      playTime: this.playTime,
      modules: moduleStates,
      rngState: this.rng.toString(), // Simplified - in practice, serialize RNG state
    };
  }

  /**
   * Deserialize game state
   */
  async deserialize(state: GameState): Promise<void> {
    this.seed = state.seed;
    this.rng = this.createRNG(this.seed);
    (window as any).__GAME_RNG__ = this.rng;

    this.frameCount = state.frameCount;
    this.playTime = state.playTime;
    this.paused = state.paused;

    this.deps.moduleRegistry.deserializeAll(state.modules);

    if (state.running && !this.running) {
      await this.start();
    } else if (!state.running && this.running) {
      await this.shutdown();
    }
  }

  /**
   * Get current game stats (for AI/debugging)
   */
  getStats() {
    return {
      running: this.running,
      paused: this.paused,
      frameCount: this.frameCount,
      playTime: this.playTime,
      fps: 1 / (this.fixedTimestep || 0.016),
      seed: this.seed,
      tokenBudget: this.deps.moduleRegistry.getTotalTokenBudget(), // aikit:allow-secret
      moduleCount: this.deps.moduleRegistry.getAllMetadata().length,
    };
  }

  /**
   * Run headless for N steps (for AI testing)
   */
  async runHeadless(steps: number): Promise<GameState> {
    const wasRunning = this.running;
    const wasPaused = this.paused;

    this.running = true;
    this.paused = false;

    for (let i = 0; i < steps; i++) {
      this.fixedUpdate(this.fixedTimestep);
      this.frameCount++;
      this.playTime += this.fixedTimestep;
    }

    this.running = wasRunning;
    this.paused = wasPaused;

    return this.serialize();
  }
}
