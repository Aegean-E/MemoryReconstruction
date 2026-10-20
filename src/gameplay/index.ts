/**
 * Gameplay Module Exports
 */

export {
  WorldSystem,
  TILE_SIZE,
  type ChunkData,
  type TileData,
  type BiomeType,
  type TileType,
  type BiomeConfig,
  type EntitySpawnData,
} from './WorldSystem';
export {
  PlayerSystem,
  type PlayerStats,
  type PlayerState,
  type Ability,
  type InventoryItem,
  type ProgressionData,
} from './PlayerSystem';
export {
  MemoryFragmentSystem,
  fragmentSpawnsFromChunk,
  isWithinPickupRadius,
  type FragmentSpawn,
} from './MemoryFragmentSystem';
export {
  CombatSystem,
  type CombatEntity,
  type EntityStats,
  type EntityState,
  type AIState,
  type Hitbox,
  type DamageEvent,
  type AttackIntent,
  type StatusEffect,
  type Projectile,
} from './CombatSystem';
export {
  SaveSystem,
  SAVE_KEY_V1,
  SETTINGS_KEY_V1,
  type SaveMetadata,
  type GameSettings,
  DEFAULT_SETTINGS,
} from './SaveSystem';
