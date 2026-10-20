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
  CombatSystem,
  type CombatEntity,
  type EntityStats,
  type EntityState,
  type AIState,
  type Hitbox,
  type DamageEvent,
  type StatusEffect,
  type Projectile,
} from './CombatSystem';
