import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, GameEvents } from '@core/EventBus';
import { ModuleRegistry } from '@core/ModuleRegistry';
import { ConfigManager, ConfigSchemas } from '@core/ConfigManager';
import { DeterministicRNG, MathUtils, ColorUtils } from '@utils/helpers';

describe('Core Systems', () => {
  describe('EventBus', () => {
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
    });

    it('should subscribe and emit events', async () => {
      const handler = vi.fn();
      eventBus.on('test:event', handler);
      
      await eventBus.emit('test:event', { data: 'test' });
      
      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should unsubscribe', async () => {
      const handler = vi.fn();
      const sub = eventBus.on('test:event', handler);
      
      sub.unsubscribe();
      await eventBus.emit('test:event', { data: 'test' });
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should track history', () => {
      eventBus.emitSync('test:event', { data: 'test' });
      
      const history = eventBus.getHistory({ event: 'test:event' });
      expect(history).toHaveLength(1);
      expect(history[0].data).toEqual({ data: 'test' });
    });

    it('should have standard game events', () => {
      expect(GameEvents.PLAYER_MOVE).toBe('player:move');
      expect(GameEvents.GAME_START).toBe('game:start');
      expect(GameEvents.RLM_STATE_SNAPSHOT).toBe('rlm:stateSnapshot');
    });
  });

  describe('ModuleRegistry', () => {
    let eventBus: EventBus;
    let registry: ModuleRegistry;

    beforeEach(() => {
      eventBus = new EventBus();
      registry = new ModuleRegistry(eventBus);
    });

    it('should register modules', () => {
      const mockModule = {
        name: 'testModule',
        version: '1.0.0',
        dependencies: [],
        tokenBudget: 100,
        initialize: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        serialize: () => ({ version: '1.0.0', timestamp: Date.now(), data: {}, checksum: 'test' }),
        deserialize: vi.fn()
      };

      registry.register(mockModule);
      expect(registry.get('testModule')).toBe(mockModule);
    });

    it('should resolve dependencies topologically', async () => {
      const initOrder: string[] = [];
      
      const moduleA = {
        name: 'moduleA',
        version: '1.0.0',
        dependencies: ['moduleB'],
        tokenBudget: 100,
            initialize: vi.fn().mockImplementation(async () => { initOrder.push('moduleA'); }),
        update: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        serialize: () => ({ version: '1.0.0', timestamp: Date.now(), data: {}, checksum: 'test' }),
        deserialize: vi.fn()
      };

      const moduleB = {
        name: 'moduleB',
        version: '1.0.0',
        dependencies: [],
        tokenBudget: 100,
            initialize: vi.fn().mockImplementation(async () => { initOrder.push('moduleB'); }),
        update: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        serialize: () => ({ version: '1.0.0', timestamp: Date.now(), data: {}, checksum: 'test' }),
        deserialize: vi.fn()
      };

      registry.register(moduleA);
      registry.register(moduleB);
      
      await registry.initializeAll({});
      
      expect(initOrder).toEqual(['moduleB', 'moduleA']);
    });

    it('should calculate token budget', async () => {
      const moduleA = {
        name: 'moduleA',
        version: '1.0.0',
        dependencies: [],
        tokenBudget: 100,
        initialize: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        serialize: () => ({ version: '1.0.0', timestamp: Date.now(), data: {}, checksum: 'test' }),
        deserialize: vi.fn()
      };

      const moduleB = {
        name: 'moduleB',
        version: '1.0.0',
        dependencies: [],
        tokenBudget: 200,
        initialize: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        serialize: () => ({ version: '1.0.0', timestamp: Date.now(), data: {}, checksum: 'test' }),
        deserialize: vi.fn()
      };

      registry.register(moduleA);
      registry.register(moduleB);
      await registry.initializeAll({});
      
      expect(registry.getTotalTokenBudget()).toBe(300);
    });
  });

  describe('ConfigManager', () => {
    let eventBus: EventBus;
    let configManager: ConfigManager;

    beforeEach(() => {
      eventBus = new EventBus();
      configManager = new ConfigManager(eventBus);
    });

    it('should validate and load config', () => {
      configManager.registerSchema('test', ConfigSchemas.graphics, {} as any);

      configManager.load('test', {
        resolution: { width: 800, height: 600, pixelRatio: 1 },
        rendering: { antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', backgroundColor: 0x0a0a0f },
        layers: { background: 0, midground: 100, foreground: 200, effects: 300, ui: 1000 },
        parallax: { enabled: true, layers: 5, baseSpeed: 0.1 },
        postProcessing: { enabled: true, bloom: true, vignette: true, colorGrading: true, crtEffect: false },
        particles: { maxParticles: 10000, useGPU: true }
      });

      const config = configManager.get<any>('test');
      expect(config.resolution.width).toBe(800);
      expect(config.resolution.height).toBe(600);
    });

    it('should reject invalid config', () => {
      configManager.registerSchema('test', ConfigSchemas.graphics, {} as any);

      expect(() => {
        configManager.load('test', { resolution: { width: 'invalid' } });
      }).toThrow();
    });

    it('should patch config', () => {
      configManager.registerSchema('test', ConfigSchemas.graphics, {} as any);
      configManager.load('test', {
        resolution: { width: 800, height: 600, pixelRatio: 1 },
        rendering: { antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', backgroundColor: 0x0a0a0f },
        layers: { background: 0, midground: 100, foreground: 200, effects: 300, ui: 1000 },
        parallax: { enabled: true, layers: 5, baseSpeed: 0.1 },
        postProcessing: { enabled: true, bloom: true, vignette: true, colorGrading: true, crtEffect: false },
        particles: { maxParticles: 10000, useGPU: true }
      });

      configManager.patch('test', { resolution: { width: 1024 } });

      const config = configManager.get<any>('test');
      expect(config.resolution.width).toBe(1024);
      expect(config.resolution.height).toBe(600);
    });
  });

  describe('DeterministicRNG', () => {
    it('should produce deterministic sequence', () => {
      const rng1 = new DeterministicRNG(12345);
      const rng2 = new DeterministicRNG(12345);
      
      for (let i = 0; i < 100; i++) {
        expect(rng1.next()).toBe(rng2.next());
      }
    });

    it('should produce different sequences for different seeds', () => {
      const rng1 = new DeterministicRNG(12345);
      const rng2 = new DeterministicRNG(54321);
      
      let different = false;
      for (let i = 0; i < 10; i++) {
        if (rng1.next() !== rng2.next()) {
          different = true;
          break;
        }
      }
      expect(different).toBe(true);
    });

    it('should generate integers in range', () => {
      const rng = new DeterministicRNG(12345);
      
      for (let i = 0; i < 100; i++) {
        const val = rng.nextInt(5, 10);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(10);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('should clone state', () => {
      const rng1 = new DeterministicRNG(12345);
      rng1.next();
      rng1.next();
      
      const rng2 = rng1.clone();
      
      expect(rng1.next()).toBe(rng2.next());
      expect(rng1.getState()).toBe(rng2.getState());
    });
  });

  describe('MathUtils', () => {
    it('should clamp values', () => {
      expect(MathUtils.clamp(5, 0, 10)).toBe(5);
      expect(MathUtils.clamp(-5, 0, 10)).toBe(0);
      expect(MathUtils.clamp(15, 0, 10)).toBe(10);
    });

    it('should lerp correctly', () => {
      expect(MathUtils.lerp(0, 10, 0.5)).toBe(5);
      expect(MathUtils.lerp(10, 0, 0.5)).toBe(5);
      expect(MathUtils.lerp(0, 10, 0)).toBe(0);
      expect(MathUtils.lerp(0, 10, 1)).toBe(10);
    });

    it('should calculate distance', () => {
      expect(MathUtils.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      expect(MathUtils.distance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
    });

    it('should normalize vectors', () => {
      const normalized = MathUtils.normalize({ x: 3, y: 4 });
      expect(MathUtils.distance({ x: 0, y: 0 }, normalized)).toBeCloseTo(1, 5);
    });
  });

  describe('ColorUtils', () => {
    it('should convert hex to rgb', () => {
      const rgb = ColorUtils.hexToRgb(0xFF0000);
      expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
      
      const rgb2 = ColorUtils.hexToRgb(0x00FF00);
      expect(rgb2).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('should convert rgb to hex', () => {
      expect(ColorUtils.rgbToHex(255, 0, 0)).toBe(0xFF0000);
      expect(ColorUtils.rgbToHex(0, 255, 0)).toBe(0x00FF00);
      expect(ColorUtils.rgbToHex(0, 0, 255)).toBe(0x0000FF);
    });

    it('should lerp colors', () => {
      const mid = ColorUtils.lerpColor(0x000000, 0xFFFFFF, 0.5);
      expect(mid).toBe(0x808080);
    });
  });
});