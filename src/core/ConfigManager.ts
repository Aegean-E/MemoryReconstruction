/**
 * Config Manager - Centralized configuration with validation
 * 
 * Provides type-safe configuration access with schema validation.
 * Supports hot-reloading for development.
 */

import { EventBus, EventHandler } from './EventBus';
import { z } from 'zod';

export interface ConfigSchema {
  graphics: z.ZodObject<any>;
  audio: z.ZodObject<any>;
  gameplay: z.ZodObject<any>;
  ai: z.ZodObject<any>;
}

export class ConfigManager {
  private configs = new Map<string, any>();
  private schemas = new Map<string, z.ZodSchema<any>>();
  private eventBus: EventBus;
  private watchers = new Map<string, () => void>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Register a configuration schema
   */
  registerSchema<T>(name: string, schema: z.ZodSchema<T>, defaultConfig: T): void {
    this.schemas.set(name, schema);
    this.set(name, defaultConfig);
  }

  /**
   * Load configuration from object
   */
  load(name: string, config: any): void {
    const schema = this.schemas.get(name);
    if (schema) {
      const result = schema.safeParse(config);
      if (!result.success) {
        console.error(`[ConfigManager] Invalid config for ${name}:`, result.error);
        throw new Error(`Invalid configuration for ${name}`);
      }
      this.configs.set(name, result.data);
    } else {
      this.configs.set(name, config);
    }
    this.eventBus.emit('config:changed', { name, config: this.configs.get(name) });
  }

  /**
   * Load multiple configs at once
   */
  loadAll(configs: Record<string, any>): void {
    for (const [name, config] of Object.entries(configs)) {
      this.load(name, config);
    }
  }

  /**
   * Get configuration
   */
  get<T>(name: string): T {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`Configuration ${name} not found`);
    }
    return config;
  }

  /**
   * Get configuration with default
   */
  getOr<T>(name: string, defaultValue: T): T {
    return this.configs.get(name) ?? defaultValue;
  }

  /**
   * Set configuration value (with validation if schema exists)
   */
  set<T>(name: string, value: T): void {
    const schema = this.schemas.get(name);
    if (schema) {
      const result = schema.safeParse(value);
      if (!result.success) {
        throw new Error(`Invalid value for ${name}: ${result.error.message}`);
      }
      this.configs.set(name, result.data);
    } else {
      this.configs.set(name, value);
    }
    this.eventBus.emit('config:changed', { name, value });
  }

  /**
   * Update partial configuration
   */
  patch<T extends Record<string, any>>(name: string, patch: Partial<T>): void {
    const current = this.get<T>(name);
    this.set(name, { ...current, ...patch });
  }

  /**
   * Check if config exists
   */
  has(name: string): boolean {
    return this.configs.has(name);
  }

  /**
   * Get all config names
   */
  getNames(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Export all configs (for serialization/RLM)
   */
  export(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, config] of this.configs) {
      result[name] = config;
    }
    return result;
  }

  /**
   * Hot reload support (development)
   */
  watch(name: string, callback: (config: any) => void): () => void {
      const unwatch = this.eventBus.on('config:changed', ((event: { name: string; config: any }) => {
        if (event.name === name) callback(event.config);
      }) as EventHandler<{ name: string; config: any }>);
    this.watchers.set(name, unwatch.unsubscribe);
    return unwatch.unsubscribe;
  }

  /**
   * Stop watching
   */
  unwatch(name: string): void {
    const unwatch = this.watchers.get(name);
    if (unwatch) {
      unwatch();
      this.watchers.delete(name);
    }
  }
}

/**
 * Default configuration schemas
 */
export const ConfigSchemas = {
  graphics: z.object({
    resolution: z.object({
      width: z.number().default(1920),
      height: z.number().default(1080),
      pixelRatio: z.number().default(1)
    }),
    rendering: z.object({
      antialias: z.boolean().default(true),
      preserveDrawingBuffer: z.boolean().default(false),
      powerPreference: z.enum(['high-performance', 'low-power']).default('high-performance'),
      backgroundColor: z.number().default(0x0a0a0f)
    }),
    layers: z.object({
      background: z.number().default(0),
      midground: z.number().default(100),
      foreground: z.number().default(200),
      effects: z.number().default(300),
      ui: z.number().default(1000)
    }),
    parallax: z.object({
      enabled: z.boolean().default(true),
      layers: z.number().default(5),
      baseSpeed: z.number().default(0.1)
    }),
    postProcessing: z.object({
      enabled: z.boolean().default(true),
      bloom: z.boolean().default(true),
      vignette: z.boolean().default(true),
      colorGrading: z.boolean().default(true),
      crtEffect: z.boolean().default(false)
    }),
    particles: z.object({
      maxParticles: z.number().default(10000),
      useGPU: z.boolean().default(true)
    })
  }),

  audio: z.object({
    masterVolume: z.number().min(0).max(1).default(0.8),
    musicVolume: z.number().min(0).max(1).default(0.6),
    sfxVolume: z.number().min(0).max(1).default(0.8),
    voiceVolume: z.number().min(0).max(1).default(1.0),
    sampleRate: z.number().default(48000),
    maxChannels: z.number().default(32),
    adaptiveMusic: z.object({
      enabled: z.boolean().default(true),
      crossfadeDuration: z.number().default(2.0),
      layers: z.number().default(4)
    }),
    spatialAudio: z.object({
      enabled: z.boolean().default(true),
      rolloffFactor: z.number().default(1.0),
      maxDistance: z.number().default(500)
    })
  }),

  gameplay: z.object({
    player: z.object({
      baseHealth: z.number().default(100),
      baseSpeed: z.number().default(200),
      baseDamage: z.number().default(10),
      invincibilityFrames: z.number().default(0.5),
      dashCooldown: z.number().default(1.0),
      dashDistance: z.number().default(150)
    }),
    combat: z.object({
      hitPause: z.number().default(0.05),
      knockbackForce: z.number().default(300),
      criticalChance: z.number().default(0.05),
      criticalMultiplier: z.number().default(2.0),
      staggerThreshold: z.number().default(20)
    }),
    world: z.object({
      chunkSize: z.number().default(512),
      viewDistance: z.number().default(3),
      seed: z.number().default(42),
      biomeCount: z.number().default(6)
    }),
    progression: z.object({
      xpCurve: z.array(z.number()).default([0, 100, 250, 500, 1000, 2000]),
      maxLevel: z.number().default(50),
      statPointsPerLevel: z.number().default(3)
    }),
    roguelike: z.object({
      enabled: z.boolean().default(true),
      permadeath: z.boolean().default(false),
      metaProgression: z.boolean().default(true),
      runSeed: z.number().optional()
    })
  }),

  ai: z.object({
    testing: z.object({
      enabled: z.boolean().default(true),
      headlessMode: z.boolean().default(false),
      deterministicSeed: z.number().default(12345),
      maxStepsPerScenario: z.number().default(10000)
    }),
    rlm: z.object({
      enabled: z.boolean().default(true),
      tokenBudget: z.number().default(50000), // aikit:allow-secret
      snapshotInterval: z.number().default(60),
      compressionLevel: z.number().default(1)
    }),
    behavior: z.object({
      difficulty: z.enum(['easy', 'normal', 'hard', 'adaptive']).default('normal'),
      learningEnabled: z.boolean().default(false),
      reactionTime: z.number().default(0.2)
    })
  })
} as const;

export type GraphicsConfig = z.infer<typeof ConfigSchemas.graphics>;
export type AudioConfig = z.infer<typeof ConfigSchemas.audio>;
export type GameplayConfig = z.infer<typeof ConfigSchemas.gameplay>;
export type AIConfig = z.infer<typeof ConfigSchemas.ai>;
