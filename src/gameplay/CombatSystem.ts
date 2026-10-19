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
import type { PlayerSystem } from './PlayerSystem';

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
  poisoned: boolean;
  poisonedTimer: number;
  poisonedDamage: number;
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

export interface Projectile {
  id: string;
  sourceId: string;
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

  // Combat state
  private damageNumbers: Array<{
    x: number;
    y: number;
    amount: number;
    critical: boolean;
    time: number;
  }> = [];
  private screenShakeIntensity = 0;

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
    this.eventBus.on(GameEvents.COMBAT_HIT, (data: any) => this.onHit(data));
    this.eventBus.on('entity:spawn', (data: any) => this.spawnEntity(data));
    this.eventBus.on('entity:despawn', (data: any) => this.despawnEntity(data.id));
    this.eventBus.on('projectile:fire', (data: any) => this.fireProjectile(data));
    this.eventBus.on('combat:applyStatus', (data: any) => this.applyStatusEffect(data));

    // Spawn initial entities from world
    this.spawnWorldEntities();

    this.eventBus.emit('combatSystem:ready', {});
  }

  private spawnWorldEntities(): void {
    if (!this.worldSystem) return;

    // Spawn entities from loaded chunks
    for (const [key, chunk] of (this.worldSystem as any).chunks) {
      if (!(this.worldSystem as any).loadedChunks.has(key)) continue;

      for (const spawnData of chunk.entities) {
        this.spawnEntityFromData(spawnData, chunk.x, chunk.y);
      }
    }
  }

  private spawnEntityFromData(data: any, _chunkX: number, _chunkY: number): void {
    const entity = this.createEntity(
      data.type,
      {
        x: data.x,
        y: data.y,
      },
      data.properties
    );

    if (entity) {
      this.entities.set(entity.id, entity);
    }
  }

  update(deltaTime: number): void {
    this.updateEntities(deltaTime);
    this.updateProjectiles(deltaTime);
    this.updateDamageNumbers(deltaTime);
    this.checkCollisions();
  }

  private updateEntities(deltaTime: number): void {
    for (const [, entity] of this.entities) {
      if (!entity.state.alive) continue;

      // Update status effects
      this.updateStatusEffects(entity, deltaTime);

      // Update AI
      this.updateAI(entity, deltaTime);

      // Apply velocity
      entity.position.x += entity.velocity.x * deltaTime;
      entity.position.y += entity.velocity.y * deltaTime;

      // World collision
      this.resolveEntityCollisions(entity);

      // Update sprite
      this.updateSprite(entity, deltaTime);
    }

    // Clean up dead entities
    for (const [id, entity] of this.entities) {
      if (!entity.state.alive && entity.state.invincibilityTimer <= 0) {
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
      const tickDamage = state.burningDamage * deltaTime;
      this.dealDamage(entity.id, 'environment', tickDamage, 'magical', false, { x: 0, y: 0 }, []);
      if (state.burningTimer <= 0) state.burning = false;
    }

    // Poison
    if (state.poisoned) {
      state.poisonedTimer -= deltaTime;
      const tickDamage = state.poisonedDamage * deltaTime;
      this.dealDamage(entity.id, 'environment', tickDamage, 'magical', false, { x: 0, y: 0 }, []);
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
    if (entity.state.stunned || entity.state.frozen || entity.state.knockedBack) return;

    const ai = entity.ai;
    const playerPos = this.playerSystem.getState().position;
    const distanceToPlayer = this.distance(entity.position, playerPos);

    // Simple behavior tree
    switch (ai.behavior) {
      case 'idle':
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
        }
        break;

      case 'chase':
        if (distanceToPlayer > ai.aggroRange * 1.5) {
          ai.behavior = 'idle';
          ai.target = null;
        } else if (distanceToPlayer < ai.attackRange) {
          ai.behavior = 'attack';
        } else {
          this.moveTowards(entity, playerPos, entity.stats.speed);
        }
        break;

      case 'attack':
        if (distanceToPlayer > ai.attackRange * 1.2) {
          ai.behavior = 'chase';
        } else if (Date.now() - ai.lastAttackTime > ai.attackCooldown * 1000) {
          this.entityAttack(entity);
          ai.lastAttackTime = Date.now();
        }
        break;

      case 'flee':
        this.moveAway(entity, playerPos, entity.stats.speed * 1.5);
        if (distanceToPlayer > ai.aggroRange * 2) {
          ai.behavior = 'idle';
        }
        break;
    }
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
      const knockback = {
        x:
          (dx / dist) *
          this.config.combat.knockbackForce *
          (1 - this.playerSystem.getStats().armor / 200),
        y: (dy / dist) * this.config.combat.knockbackForce * 0.5,
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
    // Projectile vs Entity
    for (const [projId, proj] of this.projectiles) {
      for (const [entityId, entity] of this.entities) {
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

  private resolveEntityCollisions(entity: CombatEntity): void {
    if (!this.worldSystem) return;

    const margin = entity.hitbox.width / 2;
    const nextX = entity.position.x + entity.velocity.x * (1 / 60);
    const nextY = entity.position.y + entity.velocity.y * (1 / 60);

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

    // Simple frame update
    entity.sprite.frame = Math.floor(Date.now() / 100) % 4;
  }

  // Event Handlers

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

    // Damage number
    const targetPos =
      targetId === 'player'
        ? this.playerSystem.getState().position
        : this.entities.get(targetId)?.position;
    if (targetPos) {
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
  ): void {
    const target = this.entities.get(targetId);
    if (!target || !target.state.alive) return;
    if (target.state.invincible) return;

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
      finalDamage = Math.floor(finalDamage * this.config.combat.criticalMultiplier);
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

    // Invincibility frames
    target.state.invincible = true;
    target.state.invincibilityTimer = 0.3;

    // Check death
    if (target.stats.health <= 0) {
      this.onEntityDeath(target, sourceId);
    }

    // Emit event
    this.eventBus.emit(GameEvents.COMBAT_HIT, {
      targetId,
      sourceId,
      damage: finalDamage,
      critical,
      type,
    });
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
        break;
      case 'poison':
        entity.state.poisoned = true;
        entity.state.poisonedTimer = effect.duration;
        entity.state.poisonedDamage = effect.magnitude;
        break;
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
  }

  private dropLoot(entity: CombatEntity): void {
    // Simple loot table
    if (this.rng() < 0.3) {
      this.eventBus.emit('item:drop', {
        x: entity.position.x + (this.rng() - 0.5) * 20,
        y: entity.position.y + (this.rng() - 0.5) * 20,
        item: {
          id: 'memory_fragment',
          type: 'memory',
          name: 'Memory Fragment',
          description: 'A piece of lost memory',
          rarity: 'common',
          stats: { memory: 1 },
          quantity: 1,
          maxStack: 99,
        },
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
    properties: any = {}
  ): CombatEntity | null {
    const entityTemplates: Record<string, Partial<CombatEntity>> = {
      scavenger: {
        type: 'scavenger',
        stats: {
          health: 50,
          maxHealth: 50,
          damage: 10,
          speed: 80,
          armor: 5,
          resistance: 5,
          knockbackResistance: 20,
          xpValue: 25,
          memoryValue: 5,
        },
        ai: {
          behavior: 'idle',
          target: null,
          patrolPoints: [],
          patrolIndex: 0,
          aggroRange: 200,
          attackRange: 40,
          lastAttackTime: 0,
          attackCooldown: 1.5,
          wanderTimer: 0,
        },
        hitbox: { width: 24, height: 32, offsetX: 0, offsetY: 0, type: 'hurtbox' },
        sprite: {
          texture: 'enemy_scavenger',
          width: 32,
          height: 48,
          offsetX: 0,
          offsetY: -8,
          animation: 'idle',
          frame: 0,
          facing: 1,
        },
      },
      guardian: {
        type: 'guardian',
        stats: {
          health: 200,
          maxHealth: 200,
          damage: 25,
          speed: 50,
          armor: 30,
          resistance: 20,
          knockbackResistance: 60,
          xpValue: 100,
          memoryValue: 20,
        },
        ai: {
          behavior: 'idle',
          target: null,
          patrolPoints: [],
          patrolIndex: 0,
          aggroRange: 300,
          attackRange: 60,
          lastAttackTime: 0,
          attackCooldown: 2.0,
          wanderTimer: 0,
        },
        hitbox: { width: 40, height: 48, offsetX: 0, offsetY: 0, type: 'hurtbox' },
        sprite: {
          texture: 'enemy_guardian',
          width: 64,
          height: 64,
          offsetX: 0,
          offsetY: -8,
          animation: 'idle',
          frame: 0,
          facing: 1,
        },
      },
      memoryEcho: {
        type: 'memoryEcho',
        stats: {
          health: 30,
          maxHealth: 30,
          damage: 15,
          speed: 120,
          armor: 0,
          resistance: 10,
          knockbackResistance: 10,
          xpValue: 15,
          memoryValue: 10,
        },
        ai: {
          behavior: 'idle',
          target: null,
          patrolPoints: [],
          patrolIndex: 0,
          aggroRange: 400,
          attackRange: 80,
          lastAttackTime: 0,
          attackCooldown: 1.0,
          wanderTimer: 0,
        },
        hitbox: { width: 20, height: 30, offsetX: 0, offsetY: 0, type: 'hurtbox' },
        sprite: {
          texture: 'enemy_echo',
          width: 32,
          height: 48,
          offsetX: 0,
          offsetY: -8,
          animation: 'idle',
          frame: 0,
          facing: 1,
        },
      },
    };

    const template = entityTemplates[type];
    if (!template) return null;

    this.entityCounter++;
    const id = `${type}_${this.entityCounter}_${Date.now()}`;

    // Generate patrol points
    const patrolPoints = [];
    for (let i = 0; i < 4; i++) {
      patrolPoints.push({
        x: position.x + (this.rng() - 0.5) * 200,
        y: position.y + (this.rng() - 0.5) * 100,
      });
    }

    return {
      id,
      type,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      stats: { ...template.stats!, ...properties.stats },
      state: {
        alive: true,
        stunned: false,
        stunnedTimer: 0,
        frozen: false,
        frozenTimer: 0,
        burning: false,
        burningTimer: 0,
        burningDamage: 0,
        poisoned: false,
        poisonedTimer: 0,
        poisonedDamage: 0,
        invincible: false,
        invincibilityTimer: 0,
        knockedBack: false,
        knockbackTimer: 0,
      },
      ai: { ...template.ai!, patrolPoints },
      hitbox: { ...template.hitbox! },
      sprite: { ...template.sprite! },
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
    const id = `proj_${++this.entityCounter}_${Date.now()}`;
    const projectile: Projectile = {
      id,
      sourceId: data.sourceId,
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
      },
      checksum: 'combat',
    };
  }

  deserialize(state: ModuleState): void {
    if (state.data.entities) this.entities = new Map(state.data.entities);
    if (state.data.projectiles) this.projectiles = new Map(state.data.projectiles);
    if (state.data.entityCounter) this.entityCounter = state.data.entityCounter;
  }
}
