/**
 * Core Module Exports
 * Central export point for all core systems
 */

export { EventBus, GameEvents, type GameEventType, type EventHandler, type EventSubscription, type EventMetadata } from './EventBus';
export { ModuleRegistry, type IGameModule, type ModuleState, type ModuleContext, type ModuleMetadata } from './ModuleRegistry';
export { ConfigManager, ConfigSchemas, type GraphicsConfig, type AudioConfig, type GameplayConfig, type AIConfig } from './ConfigManager';
export { GameApplication, type GameApplicationDependencies, type GameState } from './GameApplication';