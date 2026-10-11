/**
 * Module Registry - Central module management for RLM compatibility
 * 
 * Manages module lifecycle, dependencies, and state serialization.
 * Each module declares its token budget for RLM context management.
 */

import { EventBus } from './EventBus';

export interface ModuleState {
  version: string;
  timestamp: number;
  data: Record<string, any>;
  checksum: string;
}

export interface ModuleContext {
  eventBus: EventBus;
  config: Record<string, any>;
  sharedState: Map<string, any>;
}

export interface IGameModule {
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];
  readonly tokenBudget: number;  // Estimated tokens for RLM context
  
  initialize(context: ModuleContext): Promise<void>;
  update(deltaTime: number): void;
  shutdown(): Promise<void>;
  serialize(): ModuleState;
  deserialize(state: ModuleState): void;
}

export interface ModuleMetadata {
  name: string;
  version: string;
  dependencies: string[];
  tokenBudget: number;
  initialized: boolean;
  loadOrder: number;
}

export class ModuleRegistry {
  private modules = new Map<string, IGameModule>();
  private metadata = new Map<string, ModuleMetadata>();
  private loadOrder: string[] = [];
  private sharedState = new Map<string, any>();
  private eventBus: EventBus;
  private initializing = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Register a module
   */
  register(module: IGameModule): void {
    if (this.modules.has(module.name)) {
      throw new Error(`Module ${module.name} already registered`);
    }
    
    this.modules.set(module.name, module);
    this.metadata.set(module.name, {
      name: module.name,
      version: module.version,
      dependencies: module.dependencies,
      tokenBudget: module.tokenBudget,
      initialized: false,
      loadOrder: this.loadOrder.length
    });
    this.loadOrder.push(module.name);
    
    this.eventBus.emit('module:registered', { name: module.name });
  }

  /**
   * Initialize all modules in dependency order
   */
  async initializeAll(config: Record<string, any>): Promise<void> {
    if (this.initializing) {
      throw new Error('Already initializing');
    }
    this.initializing = true;

    try {
      // Topological sort by dependencies
      const sorted = this.topologicalSort();
      
      for (const name of sorted) {
        const module = this.modules.get(name)!;
        const meta = this.metadata.get(name)!;
        
        await this.eventBus.emit('module:initializing', { name });
        
        const context: ModuleContext = {
          eventBus: this.eventBus,
          config: config[name] ?? {},
          sharedState: this.sharedState
        };
        
        await module.initialize(context);
        
        meta.initialized = true;
        await this.eventBus.emit('module:initialized', { name });
      }
      
      await this.eventBus.emit('modules:allInitialized', {});
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Update all modules
   */
  updateAll(deltaTime: number): void {
    for (const name of this.loadOrder) {
      const module = this.modules.get(name);
      if (module && this.metadata.get(name)?.initialized) {
        try {
          module.update(deltaTime);
        } catch (err) {
          console.error(`[ModuleRegistry] Update error in ${name}:`, err);
        }
      }
    }
  }

  /**
   * Shutdown all modules in reverse order
   */
  async shutdownAll(): Promise<void> {
    for (const name of [...this.loadOrder].reverse()) {
      const module = this.modules.get(name);
      const meta = this.metadata.get(name);
      if (module && meta?.initialized) {
        try {
          await module.shutdown();
          meta.initialized = false;
        } catch (err) {
          console.error(`[ModuleRegistry] Shutdown error in ${name}:`, err);
        }
      }
    }
  }

  /**
   * Serialize all module states for RLM
   */
  serializeAll(): Record<string, ModuleState> {
    const result: Record<string, ModuleState> = {};
    for (const [name, module] of this.modules) {
      const meta = this.metadata.get(name);
      if (meta?.initialized) {
        result[name] = module.serialize();
      }
    }
    return result;
  }

  /**
   * Deserialize all module states
   */
  deserializeAll(states: Record<string, ModuleState>): void {
    for (const [name, state] of Object.entries(states)) {
      const module = this.modules.get(name);
      if (module) {
        module.deserialize(state);
      }
    }
  }

  /**
   * Get total token budget for all modules
   */
  getTotalTokenBudget(): number {
    let total = 0;
    for (const meta of this.metadata.values()) {
      if (meta.initialized) total += meta.tokenBudget;
    }
    return total;
  }

  /**
   * Get module by name
   */
  get<T extends IGameModule>(name: string): T | undefined {
    return this.modules.get(name) as T | undefined;
  }

  /**
   * Check if module is initialized
   */
  isInitialized(name: string): boolean {
    return this.metadata.get(name)?.initialized ?? false;
  }

  /**
   * Get all module metadata (for AI inspection)
   */
  getAllMetadata(): ModuleMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Set shared state (accessible by all modules)
   */
  setSharedState(key: string, value: any): void {
    this.sharedState.set(key, value);
  }

  /**
   * Get shared state
   */
  getSharedState<T>(key: string): T | undefined {
    return this.sharedState.get(key);
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }
      if (visited.has(name)) return;
      
      visiting.add(name);
      const meta = this.metadata.get(name);
      if (meta) {
        for (const dep of meta.dependencies) {
          visit(dep);
        }
      }
      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };

    for (const name of this.loadOrder) {
      visit(name);
    }

    return result;
  }
}