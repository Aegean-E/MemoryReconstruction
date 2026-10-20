/**
 * Event Bus - Core communication system
 *
 * Provides decoupled, typed event communication between modules.
 * Designed for AI compatibility: all events are serializable and traceable.
 */

export type EventHandler<T = any> = (event: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe(): void;
}

export interface EventMetadata {
  timestamp: number;
  source: string;
  traceId?: string;
}

/**
 * Typed event bus with full TypeScript support
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private middleware: Array<(event: string, data: any, meta: EventMetadata) => void> = [];
  private eventHistory: Array<{ event: string; data: any; meta: EventMetadata }> = [];
  private maxHistorySize = 1000;
  private traceCounter = 0;

  /**
   * Subscribe to an event
   */
  on<T>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return {
      unsubscribe: () => this.off(event, handler),
    };
  }

  /**
   * Subscribe once
   */
  once<T>(event: string, handler: EventHandler<T>): EventSubscription {
    const wrapper = async (data: T) => {
      this.off(event, wrapper);
      await handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   */
  off<T>(event: string, handler: EventHandler<T>): boolean {
    const handlers = this.handlers.get(event);
    if (!handlers) return false;
    return handlers.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   */
  async emit<T>(event: string, data: T, source = 'unknown'): Promise<void> {
    const traceId = `evt_${++this.traceCounter}_${Date.now()}`;
    const meta: EventMetadata = { timestamp: Date.now(), source, traceId };

    // Run middleware
    for (const mw of this.middleware) {
      mw(event, data, meta);
    }

    // Record history (for debugging/AI inspection)
    this.eventHistory.push({ event, data, meta });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Call handlers
    const handlers = this.handlers.get(event);
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map((handler) =>
          Promise.resolve(handler(data)).catch((err) =>
            console.error(`[EventBus] Handler error for ${event}:`, err)
          )
        )
      );
    }

    // Also emit wildcard
    const wildcards = this.handlers.get('*');
    if (wildcards) {
      await Promise.all(
        Array.from(wildcards).map((handler) =>
          Promise.resolve(handler({ event, data, meta })).catch((err) =>
            console.error(`[EventBus] Wildcard handler error:`, err)
          )
        )
      );
    }
  }

  /**
   * Synchronous emit (for critical path events)
   */
  emitSync<T>(event: string, data: T, source = 'unknown'): void {
    const traceId = `evt_${++this.traceCounter}_${Date.now()}`;
    const meta: EventMetadata = { timestamp: Date.now(), source, traceId };

    this.eventHistory.push({ event, data, meta });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[EventBus] Sync handler error for ${event}:`, err);
        }
      }
    }
  }

  /**
   * Add middleware for logging, profiling, etc.
   */
  use(middleware: (event: string, data: any, meta: EventMetadata) => void): void {
    this.middleware.push(middleware);
  }

  /**
   * Get event history for debugging/AI inspection
   */
  getHistory(filter?: {
    event?: string;
    since?: number;
    limit?: number;
  }): Array<{ event: string; data: any; meta: EventMetadata }> {
    let history = [...this.eventHistory];

    if (filter?.event) {
      history = history.filter((h) => h.event === filter.event);
    }
    if (filter?.since) {
      history = history.filter((h) => h.meta.timestamp >= filter.since!);
    }
    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get all registered event types (for AI inspection)
   */
  getEventTypes(): string[] {
    return Array.from(this.handlers.keys()).filter((k) => k !== '*');
  }

  /**
   * Get subscriber count for an event
   */
  getSubscriberCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/**
 * Global event bus instance (singleton pattern for easy access)
 */
export const globalEventBus = new EventBus();

/**
 * Standard game events - defined here for AI discoverability
 */
export const GameEvents = {
  // Lifecycle
  GAME_INIT: 'game:init',
  GAME_START: 'game:start',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  GAME_SHUTDOWN: 'game:shutdown',

  // Frame
  FRAME_START: 'frame:start',
  FRAME_END: 'frame:end',

  // Input
  INPUT_KEY_DOWN: 'input:keyDown',
  INPUT_KEY_UP: 'input:keyUp',
  INPUT_MOUSE_MOVE: 'input:mouseMove',
  INPUT_MOUSE_DOWN: 'input:mouseDown',
  INPUT_MOUSE_UP: 'input:mouseUp',
  INPUT_GAMEPAD: 'input:gamepad',

  // Entity
  ENTITY_CREATE: 'entity:create',
  ENTITY_DESTROY: 'entity:destroy',
  ENTITY_SPAWN: 'entity:spawn',
  ENTITY_DESPAWN: 'entity:despawn',

  // Player
  PLAYER_MOVE: 'player:move',
  PLAYER_ATTACK: 'player:attack',
  PLAYER_DAMAGE: 'player:damage',
  PLAYER_HEAL: 'player:heal',
  PLAYER_DEATH: 'player:death',
  PLAYER_LEVEL_UP: 'player:levelUp',
  PLAYER_STAT_CHANGE: 'player:statChange',

  // Combat
  COMBAT_ATTACK: 'combat:attack',
  COMBAT_HIT: 'combat:hit',
  COMBAT_DAMAGE: 'combat:damage',
  COMBAT_KILL: 'combat:kill',
  COMBAT_CRITICAL: 'combat:critical',
  COMBAT_DODGE: 'combat:dodge',

  // World
  WORLD_CHUNK_LOAD: 'world:chunkLoad',
  WORLD_CHUNK_UNLOAD: 'world:chunkUnload',
  WORLD_GENERATE: 'world:generate',
  WORLD_TRANSITION: 'world:transition',

  // Audio
  AUDIO_PLAY_SFX: 'audio:playSfx',
  AUDIO_PLAY_MUSIC: 'audio:playMusic',
  AUDIO_STOP_MUSIC: 'audio:stopMusic',
  AUDIO_SET_VOLUME: 'audio:setVolume',

  // Graphics
  GRAPHICS_EFFECT: 'graphics:effect',
  GRAPHICS_SCREEN_SHAKE: 'graphics:screenShake',
  GRAPHICS_PARTICLE: 'graphics:particle',

  // AI
  AI_DECISION: 'ai:decision',
  AI_STATE_CHANGE: 'ai:stateChange',
  AI_PATH_FOUND: 'ai:pathFound',

  // Testing
  TEST_SCENARIO_START: 'test:scenarioStart',
  TEST_SCENARIO_END: 'test:scenarioEnd',
  TEST_METRIC: 'test:metric',

  // RLM
  RLM_STATE_SNAPSHOT: 'rlm:stateSnapshot',
  RLM_STATE_RESTORE: 'rlm:stateRestore',
  RLM_TOKEN_BUDGET: 'rlm:tokenBudget',
} as const;

export type GameEventType = (typeof GameEvents)[keyof typeof GameEvents];
