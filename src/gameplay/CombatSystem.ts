/**
 * Combat System - Handles all combat mechanics, enemies, and damage resolution
 *
 * Implements deterministic combat with hit detection, status effects,
 * enemy AI integration, and combo systems.
 */

import type { EventBus } from '@core/EventBus';
import { GameEvents } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import type { GameplayConfig } from '@core/ConfigManager';
import type { WorldSystem } from './WorldSystem';
import type { EntitySpawnData } from './WorldSystem';
import type { PlayerSystem } from './PlayerSystem';
import type { BossPhase, EnemyArchetype, LootEntry } from './enemyCatalog';
import { getEnemyDefinition, selectEliteModifier } from './enemyCatalog';
import { getItemDefinition } from './itemCatalog';

/** Approximate collision radius of the player, who is not a CombatEntity. */
const PLAYER_COLLISION_RADIUS = 20;

export interface CombatEntity {
  id: string;
  type: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  stats: EntityStats;
  state: EntityState;
  ai: AIState;
  hitbox: Hitbox;
  sprite: SpriteData;
  /** Authored elite variant name, if this spawn rolled one. */
  eliteName?: string;
  /** Render tint for the elite variant. */
  eliteColor?: number;
  /** Authored loot table for this enemy type. */
  lootTable?: LootEntry[];
  /** Authored boss phases, ordered by descending health threshold. */
  phases?: BossPhase[];
  /** Number of phase thresholds already crossed. */
  phaseIndex?: number;
  /** Depth this entity spawned at, used to scale phase summons. */
  depth?: number;
}

export interface EntityStats {
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
  armor: number;
  resistance: number;
  knockbackResistance: number;
  xpValue: number;
  memoryValue: number;
}

export interface EntityState {
  alive: boolean;
  stunned: boolean;
  stunnedTimer: number;
  frozen: boolean;
  frozenTimer: number;
  burning: boolean;
  burningTimer: number;
  burningDamage: number;
  burningSource: string;
  poisoned: boolean;
  poisonedTimer: number;
  poisonedDamage: number;
  poisonedSource: string;
  invincible: boolean;
  invincibilityTimer: number;
  knockedBack: boolean;
  knockbackTimer: number;
}

export interface AIState {
  behavior: 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'stunned';
  target: string | null;
  patrolPoints: Array<{ x: number; y: number }>;
  patrolIndex: number;
  aggroRange: number;
  attackRange: number;
  lastAttackTime: number;
  attackCooldown: number;
  wanderTimer: number;

  // Archetype and telegraphed attack state. A strike only lands after the
  // windup elapses, giving the player a readable window to dash or interrupt.
  archetype: EnemyArchetype;
  attackKind: 'melee' | 'projectile';
  attackPhase: 'ready' | 'windup' | 'recovery';
  attackTimer: number;
  attackWindup: number;
  attackRecovery: number;
  retreatTimer: number;
  retreatDuration: number;
  projectileSpeed: number;
  projectileLifetime: number;
}

export interface Hitbox {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  type: 'hurtbox' | 'hitbox' | 'interaction';
  damage?: number;
  knockback?: { x: number; y: number };
  sourceId?: string;
}

export interface SpriteData {
  texture: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  animation: string;
  frame: number;
  facing: 1 | -1;
}

export interface DamageEvent {
  sourceId: string;
  targetId: string;
  amount: number;
  type: 'physical' | 'magical' | 'true' | 'heal';
  critical: boolean;
  knockback: { x: number; y: number };
  statusEffects: StatusEffect[];
}

export interface StatusEffect {
  type: 'stun' | 'freeze' | 'burn' | 'poison' | 'slow' | 'silence';
  duration: number;
  magnitude: number;
  sourceId: string;
}

export interface AttackIntent {
  sourceId: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
  critical: boolean;
  knockbackForce?: number;
  statusEffects?: StatusEffect[];
  ultimate?: boolean;
  /** Facing direction for a directional melee swing. Omit for radial attacks. */
  facing?: 1 | -1;
  /** Swing width in degrees. Only used when `facing` is present. */
  arc?: number;
}

export interface Projectile {
  id: string;
  sourceId: string;
  /** Friendly projectiles damage enemies; hostile ones damage only the player. */
  team: 'player' | 'enemy';
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  damage: number;
  hitbox: Hitbox;
  lifetime: number;
  maxLifetime: number;
  pierce: number;
  homing: boolean;
  targetId: string | null;
}

export class CombatSystem implements IGameModule {
  readonly name = 'combatSystem';
  readonly version = '1.0.0';
  readonly dependencies = ['worldSystem', 'playerSystem'];
  readonly tokenBudget = 3000;

  private eventBus: EventBus;
  private config: GameplayConfig;
  private worldSystem!: WorldSystem;
  private playerSystem!: PlayerSystem;

  // Entities
  private entities = new Map<string, CombatEntity>();
  private projectiles = new Map<string, Projectile>();
  private entityCounter = 0;
  // Chunk keys whose entities have already been spawned. Dead enemies stay
  // dead when a streamed-out chunk streams back in (roguelike persistence).
  private spawnedChunks = new Set<string>();

  // Combat state
  private damageNumbers: Array<{
    x: number;
    y: number;
    amount: number;
    critical: boolean;
    time: number;
  }> = [];
  private screenShakeIntensity = 0;

  // Accumulated simulation time in seconds (never wall-clock: determinism)
  private simTime = 0;

  // RNG
  private rng: () => number;

  constructor(eventBus: EventBus, config: GameplayConfig) {
    this.eventBus = eventBus;
    this.config = config;
    this.rng = this.createRNG(config.world.seed + 2000);
  }

  private createRNG(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.worldSystem = context.sharedState.get('worldSystem');
    this.playerSystem = context.sharedState.get('playerSystem');

    // Event listeners
    this.eventBus.on(GameEvents.COMBAT_ATTACK, (data: any) => this.onAttackIntent(data));
    this.eventBus.on(GameEvents.COMBAT_HIT, (data: any) => this.onHit(data));
    this.eventBus.on('entity:spawn', (data: any) => this.spawnEntity(data));
    this.eventBus.on('entity:despawn', (data: any) => this.despawnEntity(data.id));
    this.eventBus.on('projectile:fire', (data: any) => this.fireProjectile(data));
    this.eventBus.on('combat:applyStatus', (data: any) => this.applyStatusEffect(data));
    // Enemies must appear in chunks generated after startup, not only in the
    // initial ring: exploration is the core loop of the game.
    this.eventBus.on('world:chunkGenerated', (data: any) => this.spawnChunkEntities(data.chunk));
    this.eventBus.on('world:chunkUnloaded', (data: any) =>
      this.despawnChunkEntities(data.x, data.y)
    );

    // Spawn initial entities from world
    this.spawnWorldEntities();

    this.eventBus.emit('combatSystem:ready', {});
  }

  private spawnWorldEntities(): void {
    if (!this.worldSystem) return;

    // Spawn entities from loaded chunks
    for (const chunk of this.worldSystem.getLoadedChunks()) {
      this.spawnChunkEntities(chunk);
    }
  }

  private spawnChunkEntities(chunk: { x: number; y: number; entities: EntitySpawnData[] }): void {
    if (!chunk) return;
    const key = `${chunk.x},${chunk.y}`;
    if (this.spawnedChunks.has(key)) return;
    this.spawnedChunks.add(key);

    for (const spawnData of chunk.entities) {
      // Fragments are collectibles owned by MemoryFragmentSystem, not enemies.
      if (spawnData.type === 'memoryFragment') continue;
      this.spawnEntityFromData(spawnData);
    }
  }

  private despawnChunkEntities(chunkX: number, chunkY: number): void {
    const chunkSize = this.config.world.chunkSize;
    for (const [id, entity] of this.entities) {
      const entityChunkX = Math.floor(entity.position.x / chunkSize);
      const entityChunkY = Math.floor(entity.position.y / chunkSize);
      if (entityChunkX === chunkX && entityChunkY === chunkY) {
        this.despawnEntity(id);
      }
    }
  }

  private spawnEntityFromData(data: EntitySpawnData): void {
    const depth =
      typeof data.properties?.depth === 'number' ? Math.max(0, data.properties.depth) : 0;
    const entity = this.createEntity(
      data.type,
      {
        x: data.x,
        y: data.y,
      },
      data.properties,
      depth
    );

    if (entity) {
      this.entities.set(entity.id, entity);
    }
  }

  update(deltaTime: number): void {
    this.simTime += deltaTime;
    this.updateEntities(deltaTime);
    this.updateProjectiles(deltaTime);
    this.updateDamageNumbers(deltaTime);
    this.checkCollisions();
  }

  private updateEntities(deltaTime: number): void {
    // Snapshot because damage-over-time can trigger a boss phase that spawns
    // minions; newly spawned entities should begin on the next tick.
    for (const entity of Array.from(this.entities.values())) {
      if (!entity.state.alive) continue;

      // Update status effects
      this.updateStatusEffects(entity, deltaTime);

      // Update AI
      this.updateAI(entity, deltaTime);

      // Apply velocity
      entity.position.x += entity.velocity.x * deltaTime;
      entity.position.y += entity.velocity.y * deltaTime;

      // World collision
      this.resolveEntityCollisions(entity, deltaTime);

      // Update sprite
      this.updateSprite(entity, deltaTime);
    }

    // Clean up dead entities once their corpse time elapses. The corpse timer
    // must tick outside the alive-only loop above, or corpses never despawn.
    for (const [id, entity] of this.entities) {
      if (entity.state.alive) continue;
      entity.state.invincibilityTimer -= deltaTime;
      if (entity.state.invincibilityTimer <= 0) {
        this.despawnEntity(id);
      }
    }
  }

  private updateStatusEffects(entity: CombatEntity, deltaTime: number): void {
    const state = entity.state;

    // Stun
    if (state.stunned) {
      state.stunnedTimer -= deltaTime;
      if (state.stunnedTimer <= 0) state.stunned = false;
    }

    // Freeze
    if (state.frozen) {
      state.frozenTimer -= deltaTime;
      entity.velocity.x *= 0.5;
      entity.velocity.y *= 0.5;
      if (state.frozenTimer <= 0) state.frozen = false;
    }

    // Burn
    if (state.burning) {
      state.burningTimer -= deltaTime;
      // DoT ticks bypass hit invincibility and grant no i-frames, so burning
      // targets stay vulnerable to direct attacks while the dot ticks down.
      this.applyTickDamage(entity, state.burningDamage * deltaTime, state.burningSource);
      if (state.burningTimer <= 0) state.burning = false;
    }

    // Poison
    if (state.poisoned) {
      state.poisonedTimer -= deltaTime;
      this.applyTickDamage(entity, state.poisonedDamage * deltaTime, state.poisonedSource);
      if (state.poisonedTimer <= 0) state.poisoned = false;
    }

    // Invincibility
    if (state.invincible) {
      state.invincibilityTimer -= deltaTime;
      if (state.invincibilityTimer <= 0) state.invincible = false;
    }

    // Knockback
    if (state.knockedBack) {
      state.knockbackTimer -= deltaTime;
      if (state.knockbackTimer <= 0) state.knockedBack = false;
    }
  }

  private updateAI(entity: CombatEntity, deltaTime: number): void {
    const ai = entity.ai;
    const playerPos = this.playerSystem.getState().position;
    const distanceToPlayer = this.distance(entity.position, playerPos);

    // Stun and freeze always interrupt a telegraph. Normal knockback does not:
    // otherwise every light hit cancels the windup and melee enemies can never
    // retaliate. Heavy/critical hits interrupt explicitly in dealDamage().
    if (entity.state.stunned || entity.state.frozen) {
      this.cancelEnemyAttack(entity);
      if (ai.behavior === 'attack') ai.behavior = 'chase';
      return;
    }

    // Simple behavior tree
    switch (ai.behavior) {
      case 'idle':
        entity.velocity.x = 0;
        entity.velocity.y = 0;
        ai.wanderTimer -= deltaTime;
        if (ai.wanderTimer <= 0) {
          if (distanceToPlayer < ai.aggroRange) {
            ai.behavior = 'chase';
            ai.target = 'player';
          } else {
            ai.behavior = 'patrol';
            ai.wanderTimer = 2 + this.rng() * 3;
          }
        }
        break;

      case 'patrol':
        if (distanceToPlayer < ai.aggroRange) {
          ai.behavior = 'chase';
          ai.target = 'player';
        } else if (ai.patrolPoints.length > 0) {
          const target = ai.patrolPoints[ai.patrolIndex];
          const dist = this.distance(entity.position, target);
          if (dist < 20) {
            ai.patrolIndex = (ai.patrolIndex + 1) % ai.patrolPoints.length;
          } else {
            this.moveTowards(entity, target, entity.stats.speed);
          }
        } else {
          entity.velocity.x = 0;
          entity.velocity.y = 0;
        }
        break;

      case 'chase':
        if (distanceToPlayer > ai.aggroRange * 1.5) {
          ai.behavior = 'idle';
          ai.target = null;
          this.cancelEnemyAttack(entity);
          entity.velocity.x = 0;
          entity.velocity.y = 0;
        } else if (distanceToPlayer < ai.attackRange) {
          ai.behavior = 'attack';
        } else if (ai.archetype === 'ranged' && distanceToPlayer < ai.attackRange * 0.5) {
          // Ranged enemies keep a firing lane instead of walking into melee.
          this.moveAway(entity, playerPos, entity.stats.speed);
        } else {
          this.moveTowards(entity, playerPos, entity.stats.speed);
        }
        break;

      case 'attack':
        this.updateAttackBehavior(entity, deltaTime, distanceToPlayer, playerPos);
        break;

      case 'flee':
        this.moveAway(entity, playerPos, entity.stats.speed * 1.5);
        if (distanceToPlayer > ai.aggroRange * 2) {
          ai.behavior = 'idle';
        }
        break;
    }
  }

  /**
   * Telegraphed attack state machine: ready -> windup -> strike -> recovery.
   * The enemy is stationary during windup, so a dodge or an interrupt always
   * beats the strike instead of damage arriving on the same frame as aggro.
   */
  private updateAttackBehavior(
    entity: CombatEntity,
    deltaTime: number,
    distanceToPlayer: number,
    playerPos: { x: number; y: number }
  ): void {
    const ai = entity.ai;

    // Only an idle/ready enemy abandons the attack behavior for a chase.
    // A committed windup may still miss, and a retreating skirmisher must be
    // allowed to finish disengaging instead of snapping back into chase.
    if (ai.attackPhase === 'ready' && distanceToPlayer > ai.attackRange * 1.2) {
      ai.behavior = 'chase';
      this.cancelEnemyAttack(entity);
      return;
    }

    if (ai.attackPhase === 'windup') {
      entity.velocity.x = 0;
      entity.velocity.y = 0;
      ai.attackTimer -= deltaTime;
      if (ai.attackTimer <= 0) {
        this.executeEnemyAttack(entity);
        ai.attackPhase = 'recovery';
        ai.attackTimer = ai.attackRecovery;
        ai.lastAttackTime = this.simTime;
        ai.retreatTimer = ai.archetype === 'skirmisher' ? ai.retreatDuration : 0;
      }
      return;
    }

    if (ai.attackPhase === 'recovery') {
      ai.attackTimer -= deltaTime;
      if (ai.retreatTimer > 0) {
        // Hit-and-run: leave the player's melee reach before re-engaging.
        // Retreat can outlast the attack recovery, so skirmishers actually
        // disengage instead of instantly stepping back into range.
        ai.retreatTimer -= deltaTime;
        this.moveAway(entity, playerPos, entity.stats.speed * 1.25);
      } else {
        entity.velocity.x = 0;
        entity.velocity.y = 0;
      }
      if (ai.attackTimer <= 0 && ai.retreatTimer <= 0) {
        ai.attackPhase = 'ready';
        ai.retreatTimer = 0;
        if (distanceToPlayer > ai.attackRange) ai.behavior = 'chase';
      }
      return;
    }

    // Ready: ranged enemies back out of melee range before committing.
    if (ai.archetype === 'ranged' && distanceToPlayer < ai.attackRange * 0.5) {
      this.moveAway(entity, playerPos, entity.stats.speed);
      return;
    }

    entity.velocity.x = 0;
    entity.velocity.y = 0;

    if (this.simTime - ai.lastAttackTime >= ai.attackCooldown) {
      ai.attackPhase = 'windup';
      ai.attackTimer = ai.attackWindup;
      this.emitTelegraph(entity);
      return;
    }

    // Cooldown: close a little so the next telegraph starts in range.
    if (ai.archetype === 'ranged' && distanceToPlayer > ai.attackRange * 0.9) {
      this.moveTowards(entity, playerPos, entity.stats.speed);
    }
  }

  private cancelEnemyAttack(entity: CombatEntity): void {
    entity.ai.attackPhase = 'ready';
    entity.ai.attackTimer = 0;
    entity.ai.retreatTimer = 0;
  }

  private emitTelegraph(entity: CombatEntity): void {
    const payload = {
      entityId: entity.id,
      type: entity.type,
      x: entity.position.x,
      y: entity.position.y,
      kind: entity.ai.attackKind,
      windup: entity.ai.attackWindup,
      range: entity.ai.attackRange,
    };
    this.eventBus.emit('combat:telegraph', payload);
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'enemyTelegraph',
      x: entity.position.x,
      y: entity.position.y,
      scale: 1,
      tint: 0xffaa66,
      duration: entity.ai.attackWindup,
    });
  }

  private executeEnemyAttack(entity: CombatEntity): void {
    if (entity.ai.attackKind === 'projectile') {
      this.fireEnemyProjectile(entity);
    } else {
      this.entityAttack(entity);
    }
  }

  private fireEnemyProjectile(entity: CombatEntity): void {
    const playerPos = this.playerSystem.getState().position;
    const dx = playerPos.x - entity.position.x;
    const dy = playerPos.y - entity.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= 0) return;

    const speed = entity.ai.projectileSpeed;
    this.eventBus.emit('projectile:fire', {
      sourceId: entity.id,
      team: 'enemy',
      x: entity.position.x,
      y: entity.position.y,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      damage: entity.stats.damage,
      lifetime: entity.ai.projectileLifetime,
      targetId: 'player',
    });

    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'enemyAttack',
      x: entity.position.x,
      y: entity.position.y,
      tint: 0xff8844,
    });
  }

  private moveTowards(entity: CombatEntity, target: { x: number; y: number }, speed: number): void {
    const dx = target.x - entity.position.x;
    const dy = target.y - entity.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      entity.velocity.x = (dx / dist) * speed;
      entity.velocity.y = (dy / dist) * speed;
      entity.sprite.facing = dx > 0 ? 1 : -1;
    }
  }

  private moveAway(entity: CombatEntity, target: { x: number; y: number }, speed: number): void {
    const dx = entity.position.x - target.x;
    const dy = entity.position.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      entity.velocity.x = (dx / dist) * speed;
      entity.velocity.y = (dy / dist) * speed;
    }
  }

  private entityAttack(entity: CombatEntity): void {
    const playerPos = this.playerSystem.getState().position;
    const dx = playerPos.x - entity.position.x;
    const dy = playerPos.y - entity.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < entity.ai.attackRange + 20) {
      const isCrit = this.rng() < 0.05;
      // Armor reduces knockback but must never invert it into a pull.
      const knockbackFactor = Math.max(0, 1 - this.playerSystem.getStats().armor / 200);
      const knockback = {
        x: (dx / dist) * this.config.combat.knockbackForce * knockbackFactor,
        y: (dy / dist) * this.config.combat.knockbackForce * 0.5 * knockbackFactor,
      };

      this.eventBus.emit(GameEvents.COMBAT_HIT, {
        sourceId: entity.id,
        targetId: 'player',
        x: playerPos.x,
        y: playerPos.y,
        damage: entity.stats.damage,
        critical: isCrit,
        knockback,
        statusEffects: [],
      });

      // Visual
      this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
        type: 'enemyAttack',
        x: entity.position.x,
        y: entity.position.y,
        tint: 0xff4444,
      });
    }
  }

  private updateProjectiles(deltaTime: number): void {
    for (const [id, proj] of this.projectiles) {
      proj.lifetime -= deltaTime;
      if (proj.lifetime <= 0) {
        this.projectiles.delete(id);
        continue;
      }

      // Homing
      if (proj.homing && proj.targetId) {
        const target =
          proj.targetId === 'player'
            ? this.playerSystem.getState().position
            : this.entities.get(proj.targetId)?.position;
        if (target) {
          const dx = target.x - proj.position.x;
          const dy = target.y - proj.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            const turnRate = 5 * deltaTime;
            const targetVx = (dx / dist) * Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
            const targetVy = (dy / dist) * Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
            proj.velocity.x += (targetVx - proj.velocity.x) * turnRate;
            proj.velocity.y += (targetVy - proj.velocity.y) * turnRate;
          }
        }
      }

      proj.position.x += proj.velocity.x * deltaTime;
      proj.position.y += proj.velocity.y * deltaTime;
    }
  }

  private updateDamageNumbers(deltaTime: number): void {
    this.damageNumbers = this.damageNumbers.filter((dn) => {
      dn.time += deltaTime;
      return dn.time < 1.5;
    });
  }

  private checkCollisions(): void {
    // Projectile vs Player (the player is not a CombatEntity, so it needs an
    // explicit check or enemy projectiles can never connect)
    for (const [projId, proj] of Array.from(this.projectiles)) {
      if (proj.team !== 'enemy') continue;

      const playerPos = this.playerSystem.getState().position;
      const dx = playerPos.x - proj.position.x;
      const dy = playerPos.y - proj.position.y;
      const hitRadius = (proj.hitbox.width + PLAYER_COLLISION_RADIUS) / 2;
      if (dx * dx + dy * dy > hitRadius * hitRadius) continue;

      const speed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2) || 1;
      this.eventBus.emit(GameEvents.COMBAT_HIT, {
        sourceId: proj.sourceId,
        targetId: 'player',
        x: playerPos.x,
        y: playerPos.y,
        damage: proj.damage,
        critical: false,
        knockback: {
          x: (proj.velocity.x / speed) * this.config.combat.knockbackForce * 0.5,
          y: (proj.velocity.y / speed) * this.config.combat.knockbackForce * 0.25,
        },
        statusEffects: [],
      });
      this.projectiles.delete(projId);
    }

    // Projectile vs Entity
    for (const [projId, proj] of Array.from(this.projectiles)) {
      // Hostile projectiles pass through other enemies; only player shots
      // resolve against the enemy list.
      if (proj.team !== 'player') continue;
      for (const [entityId, entity] of Array.from(this.entities)) {
        if (entityId === proj.sourceId) continue;
        if (!entity.state.alive) continue;

        if (this.checkHitboxCollision(proj.hitbox, proj.position, entity.hitbox, entity.position)) {
          this.onProjectileHit(proj, entity);
          if (proj.pierce <= 0) {
            this.projectiles.delete(projId);
          } else {
            proj.pierce--;
          }
          break;
        }
      }
    }

    // Entity vs Entity (melee)
    const entityArray = Array.from(this.entities.values()).filter((e) => e.state.alive);
    for (let i = 0; i < entityArray.length; i++) {
      for (let j = i + 1; j < entityArray.length; j++) {
        const a = entityArray[i];
        const b = entityArray[j];

        if (this.checkHitboxCollision(a.hitbox, a.position, b.hitbox, b.position)) {
          this.resolveEntityCollision(a, b);
        }
      }
    }
  }

  private checkHitboxCollision(
    hb1: Hitbox,
    pos1: { x: number; y: number },
    hb2: Hitbox,
    pos2: { x: number; y: number }
  ): boolean {
    const left1 = pos1.x + hb1.offsetX - hb1.width / 2;
    const right1 = pos1.x + hb1.offsetX + hb1.width / 2;
    const top1 = pos1.y + hb1.offsetY - hb1.height / 2;
    const bottom1 = pos1.y + hb1.offsetY + hb1.height / 2;

    const left2 = pos2.x + hb2.offsetX - hb2.width / 2;
    const right2 = pos2.x + hb2.offsetX + hb2.width / 2;
    const top2 = pos2.y + hb2.offsetY - hb2.height / 2;
    const bottom2 = pos2.y + hb2.offsetY + hb2.height / 2;

    return left1 < right2 && right1 > left2 && top1 < bottom2 && bottom1 > top2;
  }

  private resolveEntityCollision(a: CombatEntity, b: CombatEntity): void {
    // Separate overlapping entities
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = (a.hitbox.width + b.hitbox.width) / 2;

    if (dist > 0 && dist < minDist) {
      const pushX = (dx / dist) * (minDist - dist) * 0.5;
      const pushY = (dy / dist) * (minDist - dist) * 0.5;
      a.position.x -= pushX;
      a.position.y -= pushY;
      b.position.x += pushX;
      b.position.y += pushY;
    }
  }

  private resolveEntityCollisions(entity: CombatEntity, deltaTime: number): void {
    if (!this.worldSystem) return;

    const margin = entity.hitbox.width / 2;
    const nextX = entity.position.x + entity.velocity.x * deltaTime;
    const nextY = entity.position.y + entity.velocity.y * deltaTime;

    if (
      this.worldSystem.isSolidAt(
        nextX + (entity.velocity.x > 0 ? margin : -margin),
        entity.position.y
      )
    ) {
      entity.velocity.x = 0;
    }
    if (
      this.worldSystem.isSolidAt(
        entity.position.x,
        nextY + (entity.velocity.y > 0 ? margin : -margin)
      )
    ) {
      entity.velocity.y = 0;
    }
  }

  private updateSprite(entity: CombatEntity, _deltaTime: number): void {
    // Update animation based on state
    if (entity.state.stunned) {
      entity.sprite.animation = 'stunned';
    } else if (entity.ai.behavior === 'attack') {
      entity.sprite.animation = 'attack';
    } else if (entity.velocity.x !== 0 || entity.velocity.y !== 0) {
      entity.sprite.animation = 'walk';
    } else {
      entity.sprite.animation = 'idle';
    }

    // Simple frame update driven by simulation time
    entity.sprite.frame = Math.floor(this.simTime * 10) % 4;
  }

  // Event Handlers

  private onAttackIntent(data: AttackIntent): void {
    if (!data || !Number.isFinite(data.damage) || data.damage <= 0) return;

    const sourceId = data.sourceId || 'player';
    const radius = Number.isFinite(data.radius) && data.radius > 0 ? data.radius : 60;
    const knockbackForce =
      typeof data.knockbackForce === 'number' && Number.isFinite(data.knockbackForce)
        ? data.knockbackForce
        : this.config.combat.knockbackForce;
    const statusEffects = data.statusEffects ?? [];
    const hasArc =
      (data.facing === 1 || data.facing === -1) &&
      Number.isFinite(data.arc) &&
      (data.arc as number) > 0 &&
      (data.arc as number) < 360;
    const arcHalfRadians = hasArc ? ((data.arc as number) * Math.PI) / 360 : 0;
    const minDot = hasArc ? Math.cos(arcHalfRadians) : -1;

    let hits = 0;
    // Snapshot the target list: a boss phase can spawn minions while this
    // loop resolves damage, and those new entities must not be hit by the
    // same swing that triggered the phase.
    for (const target of Array.from(this.entities.values())) {
      if (!target.state.alive) continue;

      const dx = target.position.x - data.x;
      const dy = target.position.y - data.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radius * radius) continue;

      const distance = Math.sqrt(distanceSquared) || 1;
      if (hasArc) {
        // Directional swing: the player must face what they want to hit, so
        // positioning matters instead of every attack being a radial burst.
        const dot = (dx / distance) * (data.facing as number);
        if (dot < minDot) continue;
      }

      const knockback = {
        x: (dx / distance) * knockbackForce,
        y: (dy / distance) * knockbackForce * 0.5,
      };

      const landed = this.dealDamage(
        target.id,
        sourceId,
        data.damage,
        'physical',
        data.critical,
        knockback,
        statusEffects
      );
      if (landed) hits++;
    }

    // Hit-confirm signal: the player combo advances only when a swing actually
    // connects, never by whiffing into empty air.
    this.eventBus.emitSync('combat:attackResolved', {
      sourceId,
      hits,
      ultimate: Boolean(data.ultimate),
      x: data.x,
      y: data.y,
      radius,
    });
  }

  private onHit(data: any): void {
    const { sourceId, targetId, damage, critical, knockback, statusEffects } = data;

    if (targetId === 'player') {
      this.playerSystem.getState(); // Trigger damage through player system
      this.eventBus.emit(GameEvents.PLAYER_DAMAGE, {
        amount: damage,
        source: sourceId,
        knockback,
        critical,
      });
    } else {
      const target = this.entities.get(targetId);
      if (target) {
        this.dealDamage(targetId, sourceId, damage, 'physical', critical, knockback, statusEffects);
      }
    }

    // Screen shake on critical
    if (critical) {
      this.screenShakeIntensity = 8;
      this.eventBus.emit(GameEvents.GRAPHICS_SCREEN_SHAKE, { intensity: 8, duration: 0.15 });
      this.eventBus.emit(GameEvents.COMBAT_CRITICAL, { targetId, damage });
    }

    // Hit pause
    this.eventBus.emit('combat:hitPause', { duration: this.config.combat.hitPause });

    // Player damage numbers: entity damage is recorded by dealDamage() with
    // its post-mitigation value, so only the player path needs one here.
    if (targetId === 'player') {
      const targetPos = this.playerSystem.getState().position;
      this.damageNumbers.push({
        x: targetPos.x,
        y: targetPos.y - 20,
        amount: damage,
        critical,
        time: 0,
      });
    }
  }

  private onProjectileHit(proj: Projectile, entity: CombatEntity): void {
    const isCrit = this.rng() < 0.1;
    const knockback = {
      x: proj.velocity.x * 0.5,
      y: proj.velocity.y * 0.5,
    };

    this.dealDamage(entity.id, proj.sourceId, proj.damage, 'physical', isCrit, knockback, []);

    // Impact effect
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'impact',
      x: entity.position.x,
      y: entity.position.y,
      tint: 0xffff00,
    });
  }

  private dealDamage(
    targetId: string,
    sourceId: string,
    amount: number,
    type: 'physical' | 'magical' | 'true' | 'heal',
    critical: boolean,
    knockback: { x: number; y: number },
    statusEffects: StatusEffect[]
  ): boolean {
    const target = this.entities.get(targetId);
    if (!target || !target.state.alive) return false;
    if (target.state.invincible) return false;

    // Calculate damage
    let finalDamage = amount;
    if (type === 'physical') {
      const reduction = target.stats.armor / (target.stats.armor + 100);
      finalDamage = Math.max(1, Math.floor(amount * (1 - reduction)));
    } else if (type === 'magical') {
      const reduction = target.stats.resistance / (target.stats.resistance + 100);
      finalDamage = Math.max(1, Math.floor(amount * (1 - reduction)));
    }
    // True damage ignores defenses

    if (critical) {
      // Player crits use the player's authored gear multiplier; every other
      // source uses the global config so an enemy's crit cannot inherit the
      // player's equipment bonuses.
      const playerCrit = Number(this.playerSystem.getStats().critMultiplier);
      const criticalMultiplier =
        sourceId === 'player' && Number.isFinite(playerCrit)
          ? playerCrit
          : this.config.combat.criticalMultiplier;
      finalDamage = Math.floor(finalDamage * criticalMultiplier);
    }

    // Apply damage
    target.stats.health = Math.max(0, target.stats.health - finalDamage);

    // Apply knockback
    if (knockback.x !== 0 || knockback.y !== 0) {
      const kbResist = target.stats.knockbackResistance / 100;
      target.velocity.x += knockback.x * (1 - kbResist);
      target.velocity.y += knockback.y * (1 - kbResist);
      target.state.knockedBack = true;
      target.state.knockbackTimer = 0.2;
    }

    // Apply status effects
    for (const effect of statusEffects) {
      this.applyStatusEffectToEntity(target, effect);
    }

    // A heavy or critical hit interrupts a telegraphed windup. This turns
    // staggerThreshold into a real tactical lever instead of dormant config.
    if (
      target.ai.attackPhase === 'windup' &&
      (critical || finalDamage >= this.config.combat.staggerThreshold)
    ) {
      this.cancelEnemyAttack(target);
    }

    // Invincibility frames
    target.state.invincible = true;
    target.state.invincibilityTimer = 0.3;

    // Boss phases are checked before death so a lethal hit does not emit a
    // phase transition that the player never gets to fight.
    if (target.stats.health > 0) {
      this.applyPhaseTransitions(target);
    }

    // Check death
    if (target.stats.health <= 0) {
      this.onEntityDeath(target, sourceId);
    }

    // Every resolved hit gets a floating number, including player attack
    // intents and projectiles that never pass through onHit().
    this.damageNumbers.push({
      x: target.position.x,
      y: target.position.y - 20,
      amount: finalDamage,
      critical,
      time: 0,
    });

    // Emit the resolved damage event. combat:hit stays the incoming targeted
    // input, so resolving damage cannot feed back into onHit.
    const damageEvent: DamageEvent = {
      sourceId,
      targetId,
      amount: finalDamage,
      type,
      critical,
      knockback,
      statusEffects,
    };
    this.eventBus.emit(GameEvents.COMBAT_DAMAGE, damageEvent);
    return true;
  }

  private applyStatusEffect(data: { targetId: string; effect: StatusEffect }): void {
    const target = this.entities.get(data.targetId);
    if (target) {
      this.applyStatusEffectToEntity(target, data.effect);
    }
  }

  private applyStatusEffectToEntity(entity: CombatEntity, effect: StatusEffect): void {
    switch (effect.type) {
      case 'stun':
        entity.state.stunned = true;
        entity.state.stunnedTimer = effect.duration;
        break;
      case 'freeze':
        entity.state.frozen = true;
        entity.state.frozenTimer = effect.duration;
        break;
      case 'burn':
        entity.state.burning = true;
        entity.state.burningTimer = effect.duration;
        entity.state.burningDamage = effect.magnitude;
        entity.state.burningSource = effect.sourceId || 'environment';
        break;
      case 'poison':
        entity.state.poisoned = true;
        entity.state.poisonedTimer = effect.duration;
        entity.state.poisonedDamage = effect.magnitude;
        entity.state.poisonedSource = effect.sourceId || 'environment';
        break;
    }
  }

  /**
   * Damage-over-time ticks. They bypass hit invincibility and never grant
   * i-frames (unlike direct hits), so a burning target still takes attacks.
   */
  /**
   * Apply authored boss phase thresholds once each. A phase can speed the boss
   * up, raise damage/armor, and announce new abilities to listeners.
   */
  private applyPhaseTransitions(entity: CombatEntity): void {
    const phases = entity.phases;
    if (!phases || phases.length === 0) return;
    if (entity.stats.maxHealth <= 0) return;

    const healthRatio = entity.stats.health / entity.stats.maxHealth;
    let index = entity.phaseIndex ?? 0;

    while (index < phases.length && healthRatio <= phases[index].healthThreshold) {
      const phase = phases[index];
      if (phase.speedMult) entity.stats.speed = Math.round(entity.stats.speed * phase.speedMult);
      if (phase.damageMult)
        entity.stats.damage = Math.round(entity.stats.damage * phase.damageMult);
      if (phase.armorMult) entity.stats.armor = Math.round(entity.stats.armor * phase.armorMult);

      index++;
      entity.phaseIndex = index;
      this.eventBus.emit('combat:bossPhase', {
        entityId: entity.id,
        type: entity.type,
        phase: index,
        threshold: phase.healthThreshold,
        newAbilities: phase.newAbilities ?? [],
        dialogue: phase.dialogue,
      });

      this.executePhaseAbilities(entity, phase.newAbilities ?? []);
    }
  }

  /**
   * Execute the authored phase ability names with concrete combat effects.
   * Unknown names still emit `combat:bossAbility` so future audio/UI can react
   * without the simulation silently dropping content.
   */
  private executePhaseAbilities(entity: CombatEntity, abilities: string[]): void {
    for (const ability of abilities) {
      switch (ability) {
        case 'forgotten_army':
          this.spawnPhaseMinions(entity);
          break;
        case 'void_domain':
          this.fireBossRing(entity, 8, 0.75);
          break;
        case 'timeline_shift':
          this.teleportBoss(entity);
          break;
        case 'reconstruction_beam':
          this.fireBossSpread(entity, 3, 0.12);
          break;
        case 'true_ending':
          this.fireBossRing(entity, 12, 1);
          break;
        default:
          break;
      }

      this.eventBus.emit('combat:bossAbility', {
        entityId: entity.id,
        type: entity.type,
        ability,
        phase: entity.phaseIndex ?? 0,
      });
      this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
        type: 'bossAbility',
        x: entity.position.x,
        y: entity.position.y,
        tint: 0xff66cc,
      });
    }
  }

  private spawnPhaseMinions(entity: CombatEntity): void {
    for (const offset of [-80, 80]) {
      const x = entity.position.x + offset;
      const y = entity.position.y;
      if (this.worldSystem?.isSolidAt?.(x, y)) continue;
      const minion = this.createEntity('memoryEcho', { x, y }, {}, entity.depth ?? 0);
      if (minion) this.entities.set(minion.id, minion);
    }
  }

  private fireBossRing(entity: CombatEntity, count: number, damageScale: number): void {
    const speed = entity.ai.projectileSpeed * 1.15;
    const damage = Math.max(1, Math.round(entity.stats.damage * damageScale));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      this.eventBus.emit('projectile:fire', {
        sourceId: entity.id,
        team: 'enemy',
        x: entity.position.x,
        y: entity.position.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        lifetime: 2.5,
        targetId: 'player',
      });
    }
  }

  private fireBossSpread(entity: CombatEntity, count: number, spread: number): void {
    const playerPos = this.playerSystem.getState().position;
    const baseAngle = Math.atan2(playerPos.y - entity.position.y, playerPos.x - entity.position.x);
    const speed = entity.ai.projectileSpeed * 1.6;
    const damage = Math.max(1, Math.round(entity.stats.damage * 1.2));

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const angle = baseAngle + offset;
      this.eventBus.emit('projectile:fire', {
        sourceId: entity.id,
        team: 'enemy',
        x: entity.position.x,
        y: entity.position.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        lifetime: 2.5,
        targetId: 'player',
      });
    }
  }

  private teleportBoss(entity: CombatEntity): void {
    const playerPos = this.playerSystem.getState().position;
    const candidates = [
      { x: playerPos.x + 120, y: playerPos.y },
      { x: playerPos.x - 120, y: playerPos.y },
      { x: playerPos.x, y: playerPos.y + 120 },
      { x: playerPos.x, y: playerPos.y - 120 },
    ];

    for (const candidate of candidates) {
      if (this.worldSystem?.isSolidAt?.(candidate.x, candidate.y)) continue;
      entity.position = { ...candidate };
      entity.velocity = { x: 0, y: 0 };
      entity.ai.attackPhase = 'ready';
      entity.ai.attackTimer = 0;
      return;
    }
  }

  private applyTickDamage(entity: CombatEntity, amount: number, sourceId: string): void {
    if (!entity.state.alive || amount <= 0) return;

    entity.stats.health = Math.max(0, entity.stats.health - amount);
    if (entity.stats.health > 0) {
      this.applyPhaseTransitions(entity);
    }
    if (entity.stats.health <= 0) {
      this.onEntityDeath(entity, sourceId);
    }
  }

  private onEntityDeath(entity: CombatEntity, killerId: string): void {
    entity.state.alive = false;
    entity.state.invincible = true;
    entity.state.invincibilityTimer = 2.0; // Corpse time

    // Award XP and memory
    if (killerId === 'player') {
      this.eventBus.emit('player:addExperience', { amount: entity.stats.xpValue });
      this.eventBus.emit('player:addMemory', { amount: entity.stats.memoryValue });
      this.playerSystem.getProgression(); // Update progression
    }

    // Drop loot
    this.dropLoot(entity);

    // Death effect
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'death',
      x: entity.position.x,
      y: entity.position.y,
      scale: 1.5,
      tint: 0xff0000,
    });

    this.eventBus.emit(GameEvents.COMBAT_KILL, {
      entityId: entity.id,
      killerId,
      type: entity.type,
    });

    // The Keeper is the authored final boss; killing it closes a run.
    if (entity.type === 'keeper' && killerId === 'player') {
      this.eventBus.emit('combat:bossDefeated', {
        entityId: entity.id,
        type: entity.type,
        killerId,
      });
    }
  }

  private dropLoot(entity: CombatEntity): void {
    // Every enemy carries its authored loot table. Each row rolls once, so a
    // kill can produce several different items; quantities also come from the
    // table instead of a hardcoded fragment.
    for (const entry of entity.lootTable ?? []) {
      if (this.rng() >= entry.chance) continue;

      const definition = getItemDefinition(entry.item);
      if (!definition) continue;

      const span = Math.max(0, entry.max - entry.min);
      const quantity = entry.min + Math.floor(this.rng() * (span + 1));

      this.eventBus.emit('item:drop', {
        x: entity.position.x + (this.rng() - 0.5) * 20,
        y: entity.position.y + (this.rng() - 0.5) * 20,
        item: { ...definition, quantity: Math.max(1, quantity) },
      });
    }
  }

  private spawnEntity(data: { type: string; x: number; y: number; properties?: any }): void {
    const entity = this.createEntity(data.type, { x: data.x, y: data.y }, data.properties);
    if (entity) {
      this.entities.set(entity.id, entity);
    }
  }

  private createEntity(
    type: string,
    position: { x: number; y: number },
    properties: any = {},
    depth = 0
  ): CombatEntity | null {
    // Every type in the world's spawn tables resolves through the same catalog,
    // so biomes no longer generate enemies that the combat layer silently drops.
    const definition = getEnemyDefinition(type);
    if (!definition) return null;

    this.entityCounter++;
    // Ids are deterministic (no wall-clock component) so replays line up.
    const id = `${type}_${this.entityCounter}`;

    // Enemy difficulty and rewards grow with world depth, giving exploration a
    // risk/reward curve instead of a flat enemy roster everywhere.
    const stats = this.scaleStatsForDepth({ ...definition.stats, ...properties.stats }, depth);

    // Deep spawns can roll an authored elite modifier (Veteran/Champion/
    // Nightmare). The roll only consumes RNG at eligible depth, so shallow
    // deterministic tests and early-game pacing are unchanged.
    // Bosses are hand-tuned through their phases; random elite multipliers on
    // top of phase multipliers made deep boss fights spike unpredictably.
    const isBoss = (definition.phases?.length ?? 0) > 0;
    const elite = isBoss
      ? null
      : selectEliteModifier(
          depth >= this.config.combat.eliteMinDepth ? this.rng() : 1,
          depth,
          this.config.combat.eliteMinDepth
        );
    if (elite) {
      stats.maxHealth = Math.round(stats.maxHealth * elite.healthMult);
      stats.health = stats.maxHealth;
      stats.damage = Math.round(stats.damage * elite.damageMult);
      if (elite.speedMult) stats.speed = Math.round(stats.speed * elite.speedMult);
      if (elite.armorMult) stats.armor = Math.round(stats.armor * elite.armorMult);
      stats.xpValue = Math.round(stats.xpValue * elite.xpMult);
      stats.memoryValue = Math.round(stats.memoryValue * elite.xpMult);
    }

    // Generate patrol points
    const patrolPoints = [];
    for (let i = 0; i < 4; i++) {
      patrolPoints.push({
        x: position.x + (this.rng() - 0.5) * 200,
        y: position.y + (this.rng() - 0.5) * 100,
      });
    }

    const attackKind = definition.archetype === 'ranged' ? 'projectile' : 'melee';

    return {
      id,
      type,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      stats,
      state: {
        alive: true,
        stunned: false,
        stunnedTimer: 0,
        frozen: false,
        frozenTimer: 0,
        burning: false,
        burningTimer: 0,
        burningDamage: 0,
        burningSource: 'environment',
        poisoned: false,
        poisonedTimer: 0,
        poisonedDamage: 0,
        poisonedSource: 'environment',
        invincible: false,
        invincibilityTimer: 0,
        knockedBack: false,
        knockbackTimer: 0,
      },
      ai: {
        behavior: 'idle',
        target: null,
        patrolPoints,
        patrolIndex: 0,
        aggroRange: definition.ai.aggroRange,
        attackRange: definition.ai.attackRange,
        // Negative start so the first in-range attack is gated by the windup,
        // not by a full extra cooldown at spawn.
        lastAttackTime: -definition.ai.attackCooldown,
        attackCooldown: definition.ai.attackCooldown,
        wanderTimer: 0,
        archetype: definition.archetype,
        attackKind,
        attackPhase: 'ready',
        attackTimer: 0,
        attackWindup: definition.attack.windup,
        attackRecovery: definition.attack.recovery,
        retreatTimer: 0,
        retreatDuration: definition.attack.retreat,
        projectileSpeed: definition.attack.projectileSpeed,
        projectileLifetime: definition.attack.projectileLifetime,
      },
      hitbox: {
        width: definition.hitbox.width,
        height: definition.hitbox.height,
        offsetX: definition.hitbox.offsetX,
        offsetY: definition.hitbox.offsetY,
        type: 'hurtbox',
      },
      sprite: {
        texture: `enemy_${type}`,
        width: definition.sprite.width,
        height: definition.sprite.height,
        offsetX: 0,
        offsetY: -8,
        animation: 'idle',
        frame: 0,
        facing: 1,
      },
      eliteName: elite?.name,
      eliteColor: elite?.color,
      lootTable: definition.lootTable ?? [],
      phases: definition.phases ?? [],
      phaseIndex: 0,
      depth,
    };
  }

  private scaleStatsForDepth(stats: EntityStats, depth: number): EntityStats {
    if (!(depth > 0)) return stats;

    const scaling = this.config.combat.depthScaling;
    const healthScale = 1 + depth * scaling.healthPerDepth;
    const damageScale = 1 + depth * scaling.damagePerDepth;
    const rewardScale = 1 + depth * scaling.rewardPerDepth;

    return {
      ...stats,
      maxHealth: Math.round(stats.maxHealth * healthScale),
      health: Math.round(stats.health * healthScale),
      damage: Math.round(stats.damage * damageScale),
      xpValue: Math.round(stats.xpValue * rewardScale),
      memoryValue: Math.round(stats.memoryValue * rewardScale),
    };
  }

  private despawnEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity) {
      this.entities.delete(id);
      this.eventBus.emit('entity:despawned', { id, type: entity.type });
    }
  }

  private fireProjectile(data: any): void {
    const id = `proj_${++this.entityCounter}`;
    const projectile: Projectile = {
      id,
      sourceId: data.sourceId,
      team: data.team ?? (data.sourceId === 'player' ? 'player' : 'enemy'),
      position: { x: data.x, y: data.y },
      velocity: { x: data.vx, y: data.vy },
      damage: data.damage,
      hitbox: {
        width: 12,
        height: 12,
        offsetX: 0,
        offsetY: 0,
        type: 'hitbox',
        damage: data.damage,
        sourceId: data.sourceId,
      },
      lifetime: data.lifetime ?? 3,
      maxLifetime: data.lifetime ?? 3,
      pierce: data.pierce ?? 0,
      homing: data.homing ?? false,
      targetId: data.targetId ?? null,
    };

    this.projectiles.set(id, projectile);
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Public API

  getEntities(): Readonly<Map<string, CombatEntity>> {
    return this.entities;
  }
  getProjectiles(): Readonly<Map<string, Projectile>> {
    return this.projectiles;
  }
  getDamageNumbers(): Readonly<
    Array<{ x: number; y: number; amount: number; critical: boolean; time: number }>
  > {
    return this.damageNumbers;
  }

  getEntity(id: string): CombatEntity | undefined {
    return this.entities.get(id);
  }

  damageEntity(
    id: string,
    amount: number,
    sourceId: string,
    knockback?: { x: number; y: number }
  ): void {
    this.dealDamage(id, sourceId, amount, 'physical', false, knockback ?? { x: 0, y: 0 }, []);
  }

  healEntity(id: string, amount: number): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.stats.health = Math.min(entity.stats.maxHealth, entity.stats.health + amount);
    }
  }

  async shutdown(): Promise<void> {
    this.entities.clear();
    this.projectiles.clear();
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        entities: Array.from(this.entities.entries()),
        projectiles: Array.from(this.projectiles.entries()),
        entityCounter: this.entityCounter,
        spawnedChunks: Array.from(this.spawnedChunks).sort(),
      },
      checksum: 'combat',
    };
  }

  deserialize(state: ModuleState): void {
    if (state.data.entities) {
      // Older saves predate telegraph fields; fill defaults so a loaded enemy
      // still has a valid attack state machine instead of NaN timers.
      const entries = state.data.entities as Array<[string, CombatEntity]>;
      this.entities = new Map(
        entries.map(([id, entity]) => [
          id,
          {
            ...entity,
            ai: Object.assign(
              {
                archetype: 'melee',
                attackKind: 'melee',
                attackPhase: 'ready',
                attackTimer: 0,
                attackWindup: 0.35,
                attackRecovery: 0.5,
                retreatTimer: 0,
                retreatDuration: 0,
                projectileSpeed: 240,
                projectileLifetime: 3,
              },
              entity.ai ?? {}
            ) as AIState,
          } as CombatEntity,
        ])
      );
    }
    if (state.data.projectiles) {
      const entries = state.data.projectiles as Array<[string, Projectile]>;
      this.projectiles = new Map(
        entries.map(([id, projectile]) => [
          id,
          {
            ...projectile,
            team: projectile.team ?? (projectile.sourceId === 'player' ? 'player' : 'enemy'),
          },
        ])
      );
    }
    if (state.data.entityCounter) this.entityCounter = state.data.entityCounter;
    if (Array.isArray(state.data.spawnedChunks)) {
      this.spawnedChunks = new Set(
        state.data.spawnedChunks.filter((key: unknown): key is string => typeof key === 'string')
      );
    }
  }
}
