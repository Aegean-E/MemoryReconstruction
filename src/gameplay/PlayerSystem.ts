/**
 * Player System - Player entity management, stats, progression
 * 
 * Handles player state, movement, abilities, inventory,
 * and progression systems for the roguelike Metroidvania.
 */

import { EventBus, GameEvents } from '@core/EventBus';
import { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import { ConfigManager, GameplayConfig } from '@core/ConfigManager';
import { InputSystem, KeyCode } from '@engine/InputSystem';
import { WorldSystem } from './WorldSystem';

export interface PlayerStats {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  
  // Base stats
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  
  // Derived stats
  damage: number;
  attackSpeed: number;
  moveSpeed: number;
  dashCooldown: number;
  dashDistance: number;
  critChance: number;
  critMultiplier: number;
  armor: number;
  resistance: number;
  
  // Progression
  level: number;
}

export interface PlayerState {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  facing: 1 | -1;
  grounded: boolean;
  dashing: boolean;
  attacking: boolean;
  interacting: boolean;
  invincible: boolean;
  invincibilityTimer: number;
}

export interface Ability {
  id: string;
  name: string;
  type: 'active' | 'passive' | 'ultimate';
  cooldown: number;
  currentCooldown: number;
  manaCost: number;
  level: number;
  maxLevel: number;
  unlocked: boolean;
}

export interface InventoryItem {
  id: string;
  type: 'weapon' | 'armor' | 'accessory' | 'consumable' | 'key' | 'memory';
  name: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  stats: Record<string, number>;
  quantity: number;
  maxStack: number;
}

export interface ProgressionData {
  level: number;
  experience: number;
  experienceToNext: number;
  statPoints: number;
  memoryFragments: number;
  unlockedAbilities: string[];
  completedRuns: number;
  deepestDepth: number;
  totalPlayTime: number;
  enemiesDefeated: number;
  deaths: number;
}

export class PlayerSystem implements IGameModule {
  readonly name = 'playerSystem';
  readonly version = '1.0.0';
  readonly dependencies = ['inputSystem', 'worldSystem'];
  readonly tokenBudget = 2000;

  private eventBus: EventBus;
  private config: GameplayConfig;
  private inputSystem!: InputSystem;
  private worldSystem!: WorldSystem;
  
  // Player data
  private stats!: PlayerStats;
  private state!: PlayerState;
  private abilities = new Map<string, Ability>();
  private inventory: InventoryItem[] = [];
  private progression!: ProgressionData;
  
  // Movement
  private moveSpeed = 200;
  private dashCooldownTimer = 0;
  private lastDashDirection = { x: 0, y: 0 };
  
  // Combat
  private attackTimer = 0;
  private comboCount = 0;
  private lastAttackTime = 0;
  
  // RNG for deterministic behavior
  private rng: () => number;

  constructor(eventBus: EventBus, config: GameplayConfig) {
    this.eventBus = eventBus;
    this.config = config;
    this.rng = this.createRNG(config.world.seed + 1000);
    
    this.initializeStats();
    this.initializeState();
    this.initializeAbilities();
    this.initializeProgression();
  }

  private createRNG(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  private initializeStats(): void {
    const pc = this.config.player;
    const cc = this.config.combat;
    
    this.stats = {
      health: pc.baseHealth,
      maxHealth: pc.baseHealth,
      mana: 50,
      maxMana: 50,
      stamina: 100,
      maxStamina: 100,
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      vitality: 10,
      damage: pc.baseDamage,
      attackSpeed: 1.0,
      moveSpeed: pc.baseSpeed,
      dashCooldown: pc.dashCooldown,
      dashDistance: pc.dashDistance,
      critChance: cc.criticalChance,
      critMultiplier: cc.criticalMultiplier,
      armor: 0,
            resistance: 0,
            level: 1
          };
        }

  private initializeState(): void {
    this.state = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      facing: 1,
      grounded: false,
      dashing: false,
      attacking: false,
      interacting: false,
      invincible: false,
      invincibilityTimer: 0
    };
  }

  private initializeAbilities(): void {
    const abilityList: Ability[] = [
      { id: 'dash', name: 'Phase Dash', type: 'active', cooldown: 1.0, currentCooldown: 0, manaCost: 0, level: 1, maxLevel: 3, unlocked: true },
      { id: 'slash', name: 'Memory Slash', type: 'active', cooldown: 0.3, currentCooldown: 0, manaCost: 5, level: 1, maxLevel: 5, unlocked: true },
      { id: 'heal', name: 'Recollection', type: 'active', cooldown: 10.0, currentCooldown: 0, manaCost: 20, level: 1, maxLevel: 3, unlocked: false },
      { id: 'shield', name: 'Mnemonic Barrier', type: 'active', cooldown: 15.0, currentCooldown: 0, manaCost: 30, level: 1, maxLevel: 3, unlocked: false },
      { id: 'ultimate', name: 'Reconstruction', type: 'ultimate', cooldown: 60.0, currentCooldown: 0, manaCost: 50, level: 1, maxLevel: 1, unlocked: false },
      { id: 'passive_regen', name: 'Memory Flow', type: 'passive', cooldown: 0, currentCooldown: 0, manaCost: 0, level: 1, maxLevel: 5, unlocked: true },
      { id: 'passive_crit', name: 'Keen Insight', type: 'passive', cooldown: 0, currentCooldown: 0, manaCost: 0, level: 1, maxLevel: 3, unlocked: false }
    ];
    
    for (const ability of abilityList) {
      this.abilities.set(ability.id, ability);
    }
  }

  private initializeProgression(): void {
    this.progression = {
      level: 1,
      experience: 0,
      experienceToNext: 100,
      statPoints: 0,
      memoryFragments: 0,
      unlockedAbilities: ['dash', 'slash'],
      completedRuns: 0,
      deepestDepth: 0,
      totalPlayTime: 0,
      enemiesDefeated: 0,
      deaths: 0
    };
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.inputSystem = context.sharedState.get('inputSystem');
    this.worldSystem = context.sharedState.get('worldSystem');
    
    // Event listeners
    this.eventBus.on(GameEvents.PLAYER_MOVE, (data: any) => this.onMove(data));
    this.eventBus.on(GameEvents.PLAYER_ATTACK, () => this.onAttack());
    this.eventBus.on(GameEvents.PLAYER_DAMAGE, (data: any) => this.onDamage(data));
    this.eventBus.on(GameEvents.PLAYER_HEAL, (data: any) => this.onHeal(data));
    this.eventBus.on('player:dash', () => this.onDash());
    this.eventBus.on('player:interact', () => this.onInteract());
    this.eventBus.on('player:useAbility', (data: any) => this.useAbility(data.id));
    this.eventBus.on('player:addExperience', (data: any) => this.addExperience(data.amount));
    this.eventBus.on('player:addItem', (data: any) => this.addItem(data.item));
    this.eventBus.on('player:levelUp', () => this.onLevelUp());
    
    this.eventBus.emit('playerSystem:ready', { stats: this.stats });
  }

  update(deltaTime: number): void {
    this.updateTimers(deltaTime);
    this.updateMovement(deltaTime);
    this.updateAbilities(deltaTime);
    this.updateProgression(deltaTime);
    this.emitPlayerState();
  }

  private updateTimers(deltaTime: number): void {
    // Invincibility
    if (this.state.invincible) {
      this.state.invincibilityTimer -= deltaTime;
      if (this.state.invincibilityTimer <= 0) {
        this.state.invincible = false;
      }
    }
    
    // Dash cooldown
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= deltaTime;
    }
    
    // Attack timer
    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;
    }
    
    // Combo reset
    if (Date.now() - this.lastAttackTime > 1000) {
      this.comboCount = 0;
    }
  }

  private updateMovement(deltaTime: number): void {
    if (!this.inputSystem) return;
    
    const movement = this.inputSystem.getMovementVector();
    
    // Apply movement
    if (movement.x !== 0 || movement.y !== 0) {
      this.state.velocity.x = movement.x * this.stats.moveSpeed;
      this.state.velocity.y = movement.y * this.stats.moveSpeed;
      
      // Update facing
      if (movement.x !== 0) {
        this.state.facing = movement.x > 0 ? 1 : -1;
      }
      
      this.eventBus.emit(GameEvents.PLAYER_MOVE, { 
        x: this.state.position.x + this.state.velocity.x * deltaTime,
        y: this.state.position.y + this.state.velocity.y * deltaTime
      });
    } else {
      // Deceleration
      this.state.velocity.x *= 0.9;
      this.state.velocity.y *= 0.9;
      if (Math.abs(this.state.velocity.x) < 10) this.state.velocity.x = 0;
      if (Math.abs(this.state.velocity.y) < 10) this.state.velocity.y = 0;
    }
    
    // Update position
    this.state.position.x += this.state.velocity.x * deltaTime;
    this.state.position.y += this.state.velocity.y * deltaTime;
    
    // World collision (simplified)
    this.resolveCollisions();
  }

  private resolveCollisions(): void {
    if (!this.worldSystem) return;
    
    const margin = 8;
    const nextX = this.state.position.x + this.state.velocity.x * (1/60);
    const nextY = this.state.position.y + this.state.velocity.y * (1/60);
    
    // Check horizontal
    if (this.worldSystem.isSolidAt(nextX + (this.state.velocity.x > 0 ? margin : -margin), this.state.position.y)) {
      this.state.velocity.x = 0;
    }
    
    // Check vertical
    if (this.worldSystem.isSolidAt(this.state.position.x, nextY + (this.state.velocity.y > 0 ? margin : -margin))) {
      this.state.velocity.y = 0;
      this.state.grounded = this.state.velocity.y >= 0;
    }
  }

  private updateAbilities(deltaTime: number): void {
    for (const ability of this.abilities.values()) {
      if (ability.currentCooldown > 0) {
        ability.currentCooldown = Math.max(0, ability.currentCooldown - deltaTime);
      }
    }
    
    // Passive regeneration
    const regen = this.abilities.get('passive_regen');
    if (regen?.unlocked && regen.level > 0) {
      const healAmount = regen.level * 0.5 * deltaTime;
      this.heal(healAmount);
      this.stats.mana = Math.min(this.stats.maxMana, this.stats.mana + regen.level * 0.2 * deltaTime);
    }
  }

  private updateProgression(deltaTime: number): void {
    this.progression.totalPlayTime += deltaTime;
  }

  private emitPlayerState(): void {
    this.eventBus.emitSync('player:stateUpdate', {
      position: this.state.position,
      velocity: this.state.velocity,
      stats: this.stats,
      state: this.state
    });
  }

  // Event Handlers

  private onMove(data: { x: number; y: number }): void {
    this.state.position.x = data.x;
    this.state.position.y = data.y;
  }

  private onAttack(): void {
    if (this.attackTimer > 0 || this.state.attacking) return;
    
    const slash = this.abilities.get('slash');
    if (!slash?.unlocked) return;
    
    if (this.stats.mana < slash.manaCost) return;
    
    this.stats.mana -= slash.manaCost;
    this.attackTimer = slash.cooldown;
    slash.currentCooldown = slash.cooldown;
    this.state.attacking = true;
    this.comboCount++;
    this.lastAttackTime = Date.now();
    
    // Determine attack properties
    const isCrit = this.rng() < this.stats.critChance;
    const damage = this.stats.damage * (isCrit ? this.stats.critMultiplier : 1) * (1 + this.comboCount * 0.1);
    
    this.eventBus.emit(GameEvents.COMBAT_HIT, {
      x: this.state.position.x + this.state.facing * 30,
      y: this.state.position.y,
      damage,
      critical: isCrit,
      combo: this.comboCount,
      knockback: this.config.combat.knockbackForce * this.state.facing
    });
    
    // Reset attack state after short delay
    setTimeout(() => { this.state.attacking = false; }, 100);
  }

  private onDash(): void {
    if (this.dashCooldownTimer > 0 || this.state.dashing) return;
    
    const dash = this.abilities.get('dash');
    if (!dash?.unlocked) return;
    
    const movement = this.inputSystem?.getMovementVector() ?? { x: 0, y: 0 };
    
    // Default to facing direction if no input
    if (movement.x === 0 && movement.y === 0) {
      movement.x = this.state.facing;
    }
    
    // Normalize
    const len = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
    if (len > 0) {
      movement.x /= len;
      movement.y /= len;
    }
    
    this.lastDashDirection = { ...movement };
    this.state.dashing = true;
    this.dashCooldownTimer = this.stats.dashCooldown;
    dash.currentCooldown = dash.cooldown;
    
    // Dash velocity
    this.state.velocity.x = movement.x * this.stats.dashDistance * 10;
    this.state.velocity.y = movement.y * this.stats.dashDistance * 10;
    
    // Invincibility during dash
    this.state.invincible = true;
    this.state.invincibilityTimer = 0.3;
    
    // Visual effect
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'dash',
      x: this.state.position.x,
      y: this.state.position.y,
      scale: 1.5,
      tint: 0x00ffff
    });
    
    // End dash after short time
    setTimeout(() => {
      this.state.dashing = false;
      this.state.velocity.x *= 0.1;
      this.state.velocity.y *= 0.1;
    }, 150);
  }

  private onInteract(): void {
    this.state.interacting = true;
    this.eventBus.emit('player:interactCheck', { 
      x: this.state.position.x, 
      y: this.state.position.y,
      facing: this.state.facing
    });
    
    setTimeout(() => { this.state.interacting = false; }, 200);
  }

  private onDamage(data: { amount: number; source: string; knockback?: { x: number; y: number } }): void {
    if (this.state.invincible) return;
    
    // Calculate damage reduction
    const reduction = this.stats.armor / (this.stats.armor + 100);
    const finalDamage = Math.max(1, Math.floor(data.amount * (1 - reduction)));
    
    this.stats.health = Math.max(0, this.stats.health - finalDamage);
    
    // Invincibility frames
    this.state.invincible = true;
    this.state.invincibilityTimer = this.config.player.invincibilityFrames;
    
    // Knockback
    if (data.knockback) {
      this.state.velocity.x += data.knockback.x;
      this.state.velocity.y += data.knockback.y;
    }
    
    // Visual feedback
    this.eventBus.emit(GameEvents.GRAPHICS_SCREEN_SHAKE, { intensity: 5, duration: 0.2 });
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'damage',
      x: this.state.position.x,
      y: this.state.position.y,
      tint: 0xff0000
    });
    
    // Check death
    if (this.stats.health <= 0) {
      this.onDeath();
    }
    
    this.eventBus.emit(GameEvents.PLAYER_DAMAGE, { 
      amount: finalDamage, 
      health: this.stats.health,
      maxHealth: this.stats.maxHealth
    });
  }

  private onHeal(data: { amount: number; source: string }): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + data.amount);
    this.eventBus.emit(GameEvents.PLAYER_HEAL, { 
      amount: data.amount, 
      health: this.stats.health,
      maxHealth: this.stats.maxHealth
    });
  }

  private onDeath(): void {
    this.progression.deaths++;
    this.eventBus.emit(GameEvents.PLAYER_DEATH, { 
      position: this.state.position,
      depth: this.progression.deepestDepth
    });
    
    // Respawn logic would go here
    this.respawn();
  }

  private respawn(): void {
    this.stats.health = this.stats.maxHealth;
    this.stats.mana = this.stats.maxMana;
    this.state.position = { x: 0, y: 0 };
    this.state.velocity = { x: 0, y: 0 };
    this.state.invincible = true;
    this.state.invincibilityTimer = 3.0;
  }

  private useAbility(abilityId: string): void {
    const ability = this.abilities.get(abilityId);
    if (!ability || !ability.unlocked) return;
    if (ability.currentCooldown > 0) return;
    if (this.stats.mana < ability.manaCost) return;
    
    this.stats.mana -= ability.manaCost;
    ability.currentCooldown = ability.cooldown;
    
    switch (abilityId) {
      case 'heal':
        this.heal(this.stats.maxHealth * 0.3);
        this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
          type: 'heal', x: this.state.position.x, y: this.state.position.y, tint: 0x00ff00
        });
        break;
      case 'shield':
        this.state.invincible = true;
        this.state.invincibilityTimer = 3.0;
        this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
          type: 'shield', x: this.state.position.x, y: this.state.position.y, tint: 0x0088ff
        });
        break;
      case 'ultimate':
        this.activateUltimate();
        break;
    }
  }

  private activateUltimate(): void {
    // Full heal, clear cooldowns, massive damage aura
    this.stats.health = this.stats.maxHealth;
    this.stats.mana = this.stats.maxMana;
    
    for (const ability of this.abilities.values()) {
      ability.currentCooldown = 0;
    }
    
    this.eventBus.emit(GameEvents.COMBAT_HIT, {
      x: this.state.position.x,
      y: this.state.position.y,
      damage: this.stats.damage * 10,
      critical: true,
      radius: 200,
      ultimate: true
    });
    
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'ultimate', x: this.state.position.x, y: this.state.position.y, scale: 3, tint: 0xffd700
    });
  }

  private heal(amount: number): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  private addExperience(amount: number): void {
    this.progression.experience += amount;
    
    while (this.progression.experience >= this.progression.experienceToNext) {
      this.progression.experience -= this.progression.experienceToNext;
      this.levelUp();
    }
    
    this.eventBus.emit('player:experienceChanged', { 
      current: this.progression.experience, 
      required: this.progression.experienceToNext 
    });
  }

  private levelUp(): void {
    this.progression.level++;
    this.progression.statPoints += this.config.progression.statPointsPerLevel;
    this.progression.experienceToNext = Math.floor(this.progression.experienceToNext * 1.5);
    
    // Increase base stats
    this.stats.maxHealth += 10;
    this.stats.health = this.stats.maxHealth;
    this.stats.maxMana += 5;
    this.stats.mana = this.stats.maxMana;
    this.stats.damage += 2;
    
    this.eventBus.emit(GameEvents.PLAYER_LEVEL_UP, { 
      level: this.progression.level,
      statPoints: this.progression.statPoints
    });
  }

  private onLevelUp(): void {
    // Called from external (e.g., UI)
    this.levelUp();
  }

  private addItem(item: InventoryItem): void {
    // Check for stacking
    const existing = this.inventory.find(i => i.id === item.id && i.maxStack > 1);
    if (existing) {
      existing.quantity = Math.min(existing.maxStack, existing.quantity + item.quantity);
    } else {
      this.inventory.push({ ...item });
    }
    
    this.eventBus.emit('player:inventoryChanged', { inventory: this.inventory });
  }

  // Public API

  getStats(): Readonly<PlayerStats> { return this.stats; }
  getState(): Readonly<PlayerState> { return this.state; }
  getAbilities(): Readonly<Map<string, Ability>> { return this.abilities; }
  getInventory(): Readonly<InventoryItem[]> { return this.inventory; }
  getProgression(): Readonly<ProgressionData> { return this.progression; }

  setPosition(x: number, y: number): void {
    this.state.position = { x, y };
  }

  addStatPoints(stat: keyof PlayerStats, amount: number): void {
    if (this.progression.statPoints >= amount) {
      (this.stats as any)[stat] += amount;
      this.progression.statPoints -= amount;
      this.recalculateDerivedStats();
    }
  }

  private recalculateDerivedStats(): void {
    this.stats.damage = this.config.player.baseDamage + this.stats.strength * 2;
    this.stats.moveSpeed = this.config.player.baseSpeed + this.stats.dexterity * 2;
    this.stats.armor = this.stats.vitality * 3;
    this.stats.resistance = this.stats.intelligence * 2;
    this.stats.critChance = this.config.combat.criticalChance + this.stats.dexterity * 0.005;
  }

  unlockAbility(abilityId: string): boolean {
    const ability = this.abilities.get(abilityId);
    if (ability && !ability.unlocked) {
      ability.unlocked = true;
      this.progression.unlockedAbilities.push(abilityId);
      return true;
    }
    return false;
  }

  upgradeAbility(abilityId: string): boolean {
    const ability = this.abilities.get(abilityId);
    if (ability && ability.level < ability.maxLevel) {
      ability.level++;
      return true;
    }
    return false;
  }

  async shutdown(): Promise<void> {}

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        stats: this.stats,
        state: this.state,
        abilities: Array.from(this.abilities.entries()),
        inventory: this.inventory,
        progression: this.progression
      },
      checksum: 'player'
    };
  }

  deserialize(state: ModuleState): void {
    if (state.data.stats) this.stats = { ...this.stats, ...state.data.stats };
    if (state.data.state) this.state = { ...this.state, ...state.data.state };
    if (state.data.abilities) this.abilities = new Map(state.data.abilities);
    if (state.data.inventory) this.inventory = state.data.inventory;
    if (state.data.progression) this.progression = { ...this.progression, ...state.data.progression };
  }
}