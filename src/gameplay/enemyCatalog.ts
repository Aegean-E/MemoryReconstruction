/**
 * Enemy Catalog - Single source of truth for enemy definitions.
 *
 * `src/data/enemies.json` carries the authored stat blocks, aggro/attack
 * ranges and sprite sizes. This module adds the combat-only metadata the
 * simulation needs (archetype and attack timing) without duplicating the
 * numbers in CombatSystem. Adding a new world spawn type therefore only needs
 * an entry in the JSON plus one profile row here; the fallback keeps unknown
 * entries playable instead of silently dropping them.
 */

import enemiesJson from '@data/enemies.json';

export type EnemyArchetype = 'melee' | 'ranged' | 'skirmisher';

export interface LootEntry {
  item: string;
  chance: number;
  min: number;
  max: number;
}

export interface BossPhase {
  healthThreshold: number;
  speedMult?: number;
  damageMult?: number;
  armorMult?: number;
  newAbilities?: string[];
  dialogue?: string;
}

export interface EliteModifier {
  name: string;
  healthMult: number;
  damageMult: number;
  speedMult?: number;
  armorMult?: number;
  xpMult: number;
  color: number;
  chance: number;
}

export interface EnemyAttackProfile {
  /** Seconds the enemy holds a readable telegraph before the strike lands. */
  windup: number;
  /** Seconds the enemy cannot start another attack after striking. */
  recovery: number;
  /** Projectile speed in pixels per second (ranged archetype only). */
  projectileSpeed: number;
  /** Projectile lifetime in seconds (ranged archetype only). */
  projectileLifetime: number;
  /** Seconds a skirmisher retreats after striking. */
  retreat: number;
}

export interface EnemyDefinition {
  id: string;
  type: string;
  name: string;
  description: string;
  stats: {
    health: number;
    maxHealth: number;
    damage: number;
    speed: number;
    armor: number;
    resistance: number;
    knockbackResistance: number;
    xpValue: number;
    memoryValue: number;
  };
  ai: {
    aggroRange: number;
    attackRange: number;
    attackCooldown: number;
    patrolRadius?: number;
  };
  hitbox: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  };
  sprite: {
    width: number;
    height: number;
    texture?: string;
  };
  archetype: EnemyArchetype;
  attack: EnemyAttackProfile;
  lootTable?: LootEntry[];
  phases?: BossPhase[];
}

const DEFAULT_ATTACK: EnemyAttackProfile = {
  windup: 0.35,
  recovery: 0.5,
  projectileSpeed: 240,
  projectileLifetime: 3,
  retreat: 0,
};

interface ArchetypeProfile {
  archetype: EnemyArchetype;
  attack: Partial<EnemyAttackProfile>;
}

/**
 * Explicit archetype/timing profiles by `type` (the value WorldSystem spawns).
 * The values are tuned by enemy role: heavy constructs telegraph longer, while
 * echoes and shadows strike fast and then disengage.
 */
const ARCHETYPE_PROFILES: Record<string, ArchetypeProfile> = {
  scavenger: { archetype: 'melee', attack: { windup: 0.35, recovery: 0.5 } },
  guardian: { archetype: 'melee', attack: { windup: 0.6, recovery: 0.8 } },
  memoryEcho: {
    archetype: 'skirmisher',
    attack: { windup: 0.18, recovery: 0.22, retreat: 1.0 },
  },
  wildling: { archetype: 'melee', attack: { windup: 0.3, recovery: 0.45 } },
  spirit: {
    archetype: 'ranged',
    attack: { windup: 0.55, recovery: 0.6, projectileSpeed: 240, projectileLifetime: 3 },
  },
  caveDweller: { archetype: 'melee', attack: { windup: 0.25, recovery: 0.4 } },
  crystalGolem: { archetype: 'melee', attack: { windup: 0.75, recovery: 1.0 } },
  shadow: {
    archetype: 'skirmisher',
    attack: { windup: 0.22, recovery: 0.3, retreat: 1.2 },
  },
  crystalGuardian: { archetype: 'melee', attack: { windup: 0.35, recovery: 0.45 } },
  prismEntity: {
    archetype: 'ranged',
    attack: { windup: 0.45, recovery: 0.55, projectileSpeed: 300, projectileLifetime: 3 },
  },
  voidWalker: { archetype: 'melee', attack: { windup: 0.4, recovery: 0.5 } },
  forgotten: { archetype: 'melee', attack: { windup: 0.7, recovery: 0.9 } },
  keeper: { archetype: 'melee', attack: { windup: 0.8, recovery: 1.0 } },
};

type RawEnemyDefinition = Omit<EnemyDefinition, 'archetype' | 'attack'>;

const rawDefinitions = enemiesJson.enemies as unknown as RawEnemyDefinition[];

export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = rawDefinitions.map(
  (definition: RawEnemyDefinition) => {
    const profile = ARCHETYPE_PROFILES[definition.type] ?? {
      archetype: 'melee' as const,
      attack: {},
    };
    return {
      ...definition,
      archetype: profile.archetype,
      attack: { ...DEFAULT_ATTACK, ...profile.attack },
    };
  }
);

const BY_TYPE = new Map(ENEMY_DEFINITIONS.map((definition) => [definition.type, definition]));

/** Atlas keys differ from spawn type names only where the art asset is shorter. */
const ATLAS_ALIASES: Record<string, string> = {
  memoryEcho: 'echo',
};

export function getEnemyDefinition(type: string): EnemyDefinition | undefined {
  return BY_TYPE.get(type);
}

export function getEnemyAtlasKey(type: string): string {
  return ATLAS_ALIASES[type] ?? type;
}

export function getEnemyArchetype(type: string): EnemyArchetype | undefined {
  return BY_TYPE.get(type)?.archetype;
}

export const ELITE_MODIFIERS = enemiesJson.eliteModifiers as unknown as EliteModifier[];

/**
 * Pick an authored elite modifier. Elites only exist below `minDepth`, so the
 * early game stays readable and the authored variants become a deep-run
 * surprise. Depth also raises the roll chance modestly.
 */
export function selectEliteModifier(
  roll: number,
  depth: number,
  minDepth: number
): EliteModifier | null {
  if (!(depth >= minDepth)) return null;

  const depthBonus = 1 + depth * 0.02;
  let accumulated = 0;
  for (const modifier of ELITE_MODIFIERS) {
    accumulated += modifier.chance * depthBonus;
    if (roll < accumulated) return modifier;
  }
  return null;
}
