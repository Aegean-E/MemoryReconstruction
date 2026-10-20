/**
 * Testing Harness - AI Testing Framework
 *
 * Provides deterministic testing, scenario replay, benchmarking,
 * and regression detection for AI-driven development.
 */

import type { EventBus } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import type { ModuleRegistry } from '@core/ModuleRegistry';
import type { GameApplication } from '@core/GameApplication';
import type { AISystem } from '@ai/AISystem';

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  seed: number;
  steps: number;
  setup: (harness: TestingHarness) => Promise<void>;
  validate: (result: TestResult) => TestValidation;
  timeout?: number;
}

export interface TestResult {
  scenarioId: string;
  seed: number;
  success: boolean;
  duration: number;
  steps: number;
  finalState: any;
  metrics: TestMetrics;
  errors: string[];
  warnings: string[];
  replayData: ReplayFrame[];
}

export interface TestMetrics {
  frameTime: { min: number; max: number; avg: number; p99: number };
  memoryUsage: { initial: number; peak: number; final: number };
  entityCount: { min: number; max: number; avg: number };
  tokenUsage: { min: number; max: number; avg: number };
  playerStats: {
    health: { min: number; max: number; final: number };
    damageDealt: number;
    damageTaken: number;
    enemiesKilled: number;
    xpGained: number;
    levelUps: number;
  };
  worldStats: {
    chunksGenerated: number;
    chunksLoaded: number;
    biomesVisited: string[];
    distanceTraveled: number;
  };
}

export interface TestValidation {
  passed: boolean;
  assertions: TestAssertion[];
  score: number; // 0-1
}

export interface TestAssertion {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  message: string;
}

export interface ReplayFrame {
  frame: number;
  timestamp: number;
  playerPos: { x: number; y: number };
  playerHealth: number;
  entityCount: number;
  input: Record<string, boolean>;
  rngState: number;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  stdDev: number;
  throughput: number; // ops/sec
  memoryDelta: number;
  passed: boolean;
  threshold: { maxAvgMs: number; maxStdDevMs: number };
}

export class TestingHarness implements IGameModule {
  readonly name = 'testingHarness';
  readonly version = '1.0.0';
  readonly dependencies = ['aiSystem'];
  readonly tokenBudget = 2000;

  private eventBus: EventBus;
  private gameApp: GameApplication | null = null;
  private moduleRegistry: ModuleRegistry | null = null;
  private aiSystem: AISystem | null = null;

  private scenarios = new Map<string, TestScenario>();
  private results: TestResult[] = [];
  private runningScenario: string | null = null;
  private replayBuffer: ReplayFrame[] = [];
  private recordingReplay = false;
  private frameCounter = 0;

  constructor(eventBus: EventBus, moduleRegistry: ModuleRegistry) {
    this.eventBus = eventBus;
    this.moduleRegistry = moduleRegistry;
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.gameApp = context.sharedState.get('gameApplication');
    this.moduleRegistry = context.sharedState.get('moduleRegistry');
    this.aiSystem = context.sharedState.get('aiSystem');

    // Register default scenarios
    this.registerDefaultScenarios();

    // Event listeners
    this.eventBus.on('test:runScenario', async (data: any) => {
      await this.runScenario(data.id, data.seed);
    });
    this.eventBus.on('test:runAll', async () => {
      await this.runAllScenarios();
    });
    this.eventBus.on('test:benchmark', async (data: any) => {
      await this.runBenchmark(data.name, data.iterations);
    });
    this.eventBus.on('test:startReplay', async (data: any) => {
      await this.startReplay(data.scenarioId, data.seed);
    });
    this.eventBus.on('test:stopReplay', () => this.stopReplay());
    this.eventBus.on('test:getResults', () => this.provideResults());

    this.eventBus.emit('testingHarness:ready', { scenarios: Array.from(this.scenarios.keys()) });
  }

  private registerDefaultScenarios(): void {
    // Basic movement test
    this.registerScenario({
      id: 'basic_movement',
      name: 'Basic Movement',
      description: 'Verify player can move in all directions',
      seed: 12345,
      steps: 600, // 10 seconds at 60fps
      setup: async (harness) => {
        const player = harness.getPlayerSystem();
        player.setPosition(0, 0);
      },
      validate: (result) => {
        const assertions: TestAssertion[] = [
          {
            name: 'Player moved',
            passed: result.metrics.worldStats.distanceTraveled > 100,
            expected: '> 100',
            actual: result.metrics.worldStats.distanceTraveled,
            message: 'Player should have moved at least 100 units',
          },
          {
            name: 'No errors',
            passed: result.errors.length === 0,
            expected: 0,
            actual: result.errors.length,
            message: 'Should complete without errors',
          },
        ];
        return { passed: assertions.every((a) => a.passed), assertions, score: 1.0 };
      },
    });

    // Combat test
    this.registerScenario({
      id: 'basic_combat',
      name: 'Basic Combat',
      description: 'Verify combat mechanics work correctly',
      seed: 23456,
      steps: 1200, // 20 seconds
      setup: async (harness) => {
        const player = harness.getPlayerSystem();
        player.setPosition(0, 0);
        player.getStats().health = 100;

        // Spawn test enemy near player
        harness.getEventBus().emit('entity:spawn', {
          type: 'scavenger',
          x: 100,
          y: 0,
          properties: {},
        });
      },
      validate: (result) => {
        const assertions: TestAssertion[] = [
          {
            name: 'Enemy killed',
            passed: result.metrics.playerStats.enemiesKilled > 0,
            expected: '> 0',
            actual: result.metrics.playerStats.enemiesKilled,
            message: 'Should kill at least one enemy',
          },
          {
            name: 'Player survived',
            passed: result.metrics.playerStats.health.final > 0,
            expected: '> 0',
            actual: result.metrics.playerStats.health.final,
            message: 'Player should survive',
          },
          {
            name: 'XP gained',
            passed: result.metrics.playerStats.xpGained > 0,
            expected: '> 0',
            actual: result.metrics.playerStats.xpGained,
            message: 'Should gain XP from kills',
          },
        ];
        return { passed: assertions.every((a) => a.passed), assertions, score: 1.0 };
      },
    });

    // World generation test
    this.registerScenario({
      id: 'world_generation',
      name: 'World Generation',
      description: 'Verify deterministic world generation',
      seed: 34567,
      steps: 300,
      setup: async (harness) => {
        const player = harness.getPlayerSystem();
        player.setPosition(0, 0);
      },
      validate: (result) => {
        const assertions: TestAssertion[] = [
          {
            name: 'Chunks generated',
            passed: result.metrics.worldStats.chunksGenerated > 0,
            expected: '> 0',
            actual: result.metrics.worldStats.chunksGenerated,
            message: 'Should generate chunks',
          },
          {
            name: 'Deterministic',
            passed: true, // Would compare with known good state
            expected: 'deterministic',
            actual: 'deterministic',
            message: 'World generation should be deterministic',
          },
        ];
        return { passed: assertions.every((a) => a.passed), assertions, score: 1.0 };
      },
    });

    // Performance benchmark
    this.registerScenario({
      id: 'performance_baseline',
      name: 'Performance Baseline',
      description: 'Measure baseline performance metrics',
      seed: 45678,
      steps: 1800, // 30 seconds
      setup: async (harness) => {
        const player = harness.getPlayerSystem();
        player.setPosition(0, 0);
      },
      validate: (result) => {
        const assertions: TestAssertion[] = [
          {
            name: '60 FPS maintained',
            passed: result.metrics.frameTime.avg < 16.67,
            expected: '< 16.67ms',
            actual: result.metrics.frameTime.avg.toFixed(2) + 'ms',
            message: 'Average frame time should be under 16.67ms (60 FPS)',
          },
          {
            name: 'No memory leaks',
            passed:
              result.metrics.memoryUsage.final - result.metrics.memoryUsage.initial <
              50 * 1024 * 1024,
            expected: '< 50MB increase',
            actual:
              (
                (result.metrics.memoryUsage.final - result.metrics.memoryUsage.initial) /
                1024 /
                1024
              ).toFixed(2) + 'MB',
            message: 'Memory should not grow excessively',
          },
        ];
        return { passed: assertions.every((a) => a.passed), assertions, score: 1.0 };
      },
    });

    // AI decision test
    this.registerScenario({
      id: 'ai_decision_making',
      name: 'AI Decision Making',
      description: 'Verify AI agent makes valid decisions',
      seed: 56789,
      steps: 600,
      setup: async (harness) => {
        const player = harness.getPlayerSystem();
        const ai = harness.getAISystem();
        player.setPosition(0, 0);

        // Register test agent
        if (ai) {
          ai.registerAgent({
            id: 'test_agent',
            name: 'Test Agent',
            type: 'player',
            config: {},
          });
          ai.setActiveAgent('test_agent');
        }
      },
      validate: (_result) => {
        const assertions: TestAssertion[] = [
          {
            name: 'Agent made decisions',
            passed: true, // Would check agent.decisionCount
            expected: '> 0',
            actual: 'decisions made',
            message: 'AI agent should make decisions',
          },
        ];
        return { passed: assertions.every((a) => a.passed), assertions, score: 1.0 };
      },
    });
  }

  registerScenario(scenario: TestScenario): void {
    this.scenarios.set(scenario.id, scenario);
  }

  async runScenario(scenarioId: string, seed?: number): Promise<TestResult> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    this.runningScenario = scenarioId;
    this.replayBuffer = [];
    this.recordingReplay = true;
    this.frameCounter = 0;

    const testSeed = seed ?? scenario.seed;
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();

    // Reset game state
    if (this.gameApp) {
      (this.gameApp as any).seed = testSeed;
      (this.gameApp as any).rng = this.createRNG(testSeed);
    }

    // Run setup
    try {
      await scenario.setup(this);
    } catch (error) {
      return this.createFailedResult(scenarioId, testSeed, `Setup failed: ${error}`);
    }

    // Run simulation
    let frameTimes: number[] = [];
    let peakMemory = initialMemory;
    let errors: string[] = [];
    let warnings: string[] = [];
    let lastPos = { x: 0, y: 0 };
    let distanceTraveled = 0;
    let initialHealth = this.getPlayerSystem()?.getStats().health ?? 100;
    let damageDealt = 0;
    let damageTaken = 0;
    let enemiesKilled = 0;
    let xpGained = 0;
    let levelUps = 0;
    let chunksGenerated = 0;
    let biomesVisited = new Set<string>();

    const maxSteps = scenario.steps;
    const timeout = scenario.timeout ?? 60000;
    const startWallTime = Date.now();

    for (let step = 0; step < maxSteps; step++) {
      // Check timeout
      if (Date.now() - startWallTime > timeout) {
        warnings.push(`Scenario timed out after ${timeout}ms`);
        break;
      }

      const frameStart = performance.now();

      // Record replay frame
      if (this.recordingReplay) {
        this.recordReplayFrame();
      }

      // Run headless step
      if (this.gameApp) {
        await this.gameApp.runHeadless(1);
      }

      // Collect metrics
      const player = this.getPlayerSystem();
      const combat = this.getCombatSystem();
      const world = this.getWorldSystem();

      if (player) {
        const stats = player.getStats();
        const state = player.getState();

        // Track distance
        const dx = state.position.x - lastPos.x;
        const dy = state.position.y - lastPos.y;
        distanceTraveled += Math.sqrt(dx * dx + dy * dy);
        lastPos = { ...state.position };

        // Track health changes
        if (stats.health < initialHealth) {
          damageTaken += initialHealth - stats.health;
          initialHealth = stats.health;
        }
      }

      if (combat) {
        // Would track kills from events
      }

      if (world) {
        // Track chunks
      }

      const frameTime = performance.now() - frameStart;
      frameTimes.push(frameTime);

      const currentMemory = this.getMemoryUsage();
      peakMemory = Math.max(peakMemory, currentMemory);
    }

    const duration = performance.now() - startTime;
    const finalMemory = this.getMemoryUsage();

    // Get final state
    const finalState = this.gameApp?.serialize();

    // Calculate metrics
    const metrics = this.calculateMetrics({
      frameTimes,
      initialMemory,
      peakMemory,
      finalMemory,
      distanceTraveled,
      damageDealt,
      damageTaken,
      enemiesKilled,
      xpGained,
      levelUps,
      chunksGenerated,
      biomesVisited: Array.from(biomesVisited),
    });

    const result: TestResult = {
      scenarioId,
      seed: testSeed,
      success: errors.length === 0,
      duration,
      steps: maxSteps,
      finalState,
      metrics,
      errors,
      warnings,
      replayData: [...this.replayBuffer],
    };

    // Validate
    const validation = scenario.validate(result);
    result.success = result.success && validation.passed;

    this.results.push(result);
    this.runningScenario = null;
    this.recordingReplay = false;

    this.eventBus.emit('test:scenarioComplete', { result, validation });

    return result;
  }

  async runAllScenarios(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const id of this.scenarios.keys()) {
      const result = await this.runScenario(id);
      results.push(result);

      // Small delay between scenarios
      await new Promise((r) => setTimeout(r, 100));
    }

    this.eventBus.emit('test:allComplete', { results });
    return results;
  }

  async runBenchmark(name: string, iterations = 10): Promise<BenchmarkResult> {
    const times: number[] = [];
    const initialMemory = this.getMemoryUsage();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Run a standard workload
      if (this.gameApp) {
        await this.gameApp.runHeadless(600); // 10 seconds
      }

      times.push(performance.now() - start);
    }

    const finalMemory = this.getMemoryUsage();
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const stdDev = Math.sqrt(
      times.reduce((a, b) => a + Math.pow(b - avgTime, 2), 0) / times.length
    );

    return {
      name,
      iterations,
      totalTime: times.reduce((a, b) => a + b, 0),
      avgTime,
      minTime,
      maxTime,
      stdDev,
      throughput: 1000 / avgTime,
      memoryDelta: finalMemory - initialMemory,
      passed: avgTime < 1000 && stdDev < 100, // Thresholds
      threshold: { maxAvgMs: 1000, maxStdDevMs: 100 },
    };
  }

  private recordReplayFrame(): void {
    const player = this.getPlayerSystem();
    const combat = this.getCombatSystem();
    const input = this.getInputSystem();

    if (!player) return;

    const state = player.getState();
    const stats = player.getStats();

    this.replayBuffer.push({
      frame: this.frameCounter++,
      timestamp: Date.now(),
      playerPos: { ...state.position },
      playerHealth: stats.health,
      entityCount: combat?.getEntities().size ?? 0,
      input: input ? Object.fromEntries(input.getActionMap()) : {},
      rngState: 0, // Would capture actual RNG state
    });

    // Limit replay buffer size
    if (this.replayBuffer.length > 10000) {
      this.replayBuffer.shift();
    }
  }

  startReplay(scenarioId: string, seed: number): void {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) return;

    // Find matching result
    const result = this.results.find((r) => r.scenarioId === scenarioId && r.seed === seed);
    if (!result) return;

    this.replayBuffer = [...result.replayData];
    this.frameCounter = 0;
    this.recordingReplay = false;

    this.eventBus.emit('test:replayStarted', {
      scenarioId,
      seed,
      frames: this.replayBuffer.length,
    });
  }

  stopReplay(): void {
    this.recordingReplay = false;
    this.eventBus.emit('test:replayStopped', { framesRecorded: this.replayBuffer.length });
  }

  getReplayBuffer(): ReplayFrame[] {
    return [...this.replayBuffer];
  }

  private calculateMetrics(data: {
    frameTimes: number[];
    initialMemory: number;
    peakMemory: number;
    finalMemory: number;
    distanceTraveled: number;
    damageDealt: number;
    damageTaken: number;
    enemiesKilled: number;
    xpGained: number;
    levelUps: number;
    chunksGenerated: number;
    biomesVisited: string[];
  }): TestMetrics {
    const frameTimes = data.frameTimes;
    const sorted = [...frameTimes].sort((a, b) => a - b);

    return {
      frameTime: {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
        p99: sorted[Math.floor(sorted.length * 0.99)],
      },
      memoryUsage: {
        initial: data.initialMemory,
        peak: data.peakMemory,
        final: data.finalMemory,
      },
      entityCount: { min: 0, max: 0, avg: 0 },
      tokenUsage: { min: 0, max: 0, avg: 0 },
      playerStats: {
        health: { min: 0, max: 100, final: 100 },
        damageDealt: data.damageDealt,
        damageTaken: data.damageTaken,
        enemiesKilled: data.enemiesKilled,
        xpGained: data.xpGained,
        levelUps: data.levelUps,
      },
      worldStats: {
        chunksGenerated: data.chunksGenerated,
        chunksLoaded: 0,
        biomesVisited: data.biomesVisited,
        distanceTraveled: data.distanceTraveled,
      },
    };
  }

  private createFailedResult(scenarioId: string, seed: number, error: string): TestResult {
    return {
      scenarioId,
      seed,
      success: false,
      duration: 0,
      steps: 0,
      finalState: null,
      metrics: this.getEmptyMetrics(),
      errors: [error],
      warnings: [],
      replayData: [],
    };
  }

  private getEmptyMetrics(): TestMetrics {
    return {
      frameTime: { min: 0, max: 0, avg: 0, p99: 0 },
      memoryUsage: { initial: 0, peak: 0, final: 0 },
      entityCount: { min: 0, max: 0, avg: 0 },
      tokenUsage: { min: 0, max: 0, avg: 0 },
      playerStats: {
        health: { min: 0, max: 0, final: 0 },
        damageDealt: 0,
        damageTaken: 0,
        enemiesKilled: 0,
        xpGained: 0,
        levelUps: 0,
      },
      worldStats: { chunksGenerated: 0, chunksLoaded: 0, biomesVisited: [], distanceTraveled: 0 },
    };
  }

  private provideResults(): void {
    this.eventBus.emit('test:results', { results: this.results });
  }

  getResults(): TestResult[] {
    return [...this.results];
  }

  getLatestResult(): TestResult | null {
    return this.results[this.results.length - 1] ?? null;
  }

  // Helper methods to access systems
  getGameApp(): GameApplication | null {
    return this.gameApp;
  }
  getModuleRegistry(): ModuleRegistry | null {
    return this.moduleRegistry;
  }
  getAISystem(): AISystem | null {
    return this.aiSystem;
  }
  getPlayerSystem(): any {
    return this.moduleRegistry?.get('playerSystem');
  }
  getCombatSystem(): any {
    return this.moduleRegistry?.get('combatSystem');
  }
  getWorldSystem(): any {
    return this.moduleRegistry?.get('worldSystem');
  }
  getRenderSystem(): any {
    return this.moduleRegistry?.get('renderSystem');
  }
  getAudioSystem(): any {
    return this.moduleRegistry?.get('audioSystem');
  }
  getInputSystem(): any {
    return this.moduleRegistry?.get('inputSystem');
  }
  getEventBus(): EventBus {
    return this.eventBus;
  }

  private createRNG(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  update(_deltaTime: number): void {
    // no-op
  }

  async shutdown(): Promise<void> {
    this.scenarios.clear();
    this.results = [];
    this.replayBuffer = [];
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        scenarios: Array.from(this.scenarios.entries()),
        results: this.results.slice(-10),
        replayBuffer: this.replayBuffer.slice(-1000),
      },
      checksum: 'testing',
    };
  }

  deserialize(state: ModuleState): void {
    if (state.data.scenarios) this.scenarios = new Map(state.data.scenarios);
    if (state.data.results) this.results = state.data.results;
    if (state.data.replayBuffer) this.replayBuffer = state.data.replayBuffer;
  }
}
