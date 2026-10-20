/**
 * Memory Fragment System - Collectible memory shards and pickup presentation
 *
 * World generation already marks `memoryFragment` spawn points. This module turns
 * those markers into animated collectibles, checks the player's pickup radius,
 * and awards progression through the shared `player:addMemory` event.
 */

import * as PIXI from 'pixi.js';
import { GameEvents } from '@core/EventBus';
import type { EventBus } from '@core/EventBus';
import type { GameplayConfig } from '@core/ConfigManager';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import type { PlayerSystem } from './PlayerSystem';
import type { ChunkData } from './WorldSystem';
import type { WorldSystem } from './WorldSystem';
import type { RenderSystem } from '@graphics/RenderSystem';
import spriteAtlas from '@data/sprite_atlas.json';
import { resolveAssetUrl } from '@utils/assetUrl';

export interface FragmentSpawn {
  id: string;
  x: number;
  y: number;
  chunkKey: string;
}

interface FragmentView extends FragmentSpawn {
  sprite: PIXI.Sprite;
  baseY: number;
  phase: number;
}

export function fragmentSpawnsFromChunk(chunk: ChunkData): FragmentSpawn[] {
  const chunkKey = `${chunk.x},${chunk.y}`;
  const spawns: FragmentSpawn[] = [];

  chunk.entities.forEach((entity, index) => {
    if (entity.type !== 'memoryFragment') return;
    spawns.push({
      id: `${chunkKey}:${index}`,
      x: entity.x,
      y: entity.y,
      chunkKey,
    });
  });

  return spawns;
}

export function isWithinPickupRadius(
  player: { x: number; y: number },
  fragment: { x: number; y: number },
  radius: number
): boolean {
  const dx = player.x - fragment.x;
  const dy = player.y - fragment.y;
  return dx * dx + dy * dy <= radius * radius;
}

export class MemoryFragmentSystem implements IGameModule {
  readonly name = 'memoryFragmentSystem';
  readonly version = '1.0.0';
  readonly dependencies = ['renderSystem', 'worldSystem', 'playerSystem'];
  readonly tokenBudget = 800;

  private eventBus: EventBus;
  private config: GameplayConfig;
  private renderSystem!: RenderSystem;
  private worldSystem!: WorldSystem;
  private playerSystem!: PlayerSystem;

  private layer: PIXI.Container | null = null;
  private texture: PIXI.Texture | null = null;
  private fragments = new Map<string, FragmentView>();
  private collected = new Set<string>();
  private elapsed = 0;

  constructor(eventBus: EventBus, config: GameplayConfig) {
    this.eventBus = eventBus;
    this.config = config;
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.renderSystem = context.sharedState.get('renderSystem');
    this.worldSystem = context.sharedState.get('worldSystem');
    this.playerSystem = context.sharedState.get('playerSystem');
    this.layer = this.renderSystem.getLayer('midground') ?? null;
    this.texture = await this.loadTexture();

    this.syncLoadedChunks();

    this.eventBus.on('world:chunkGenerated', (data: any) => this.syncChunk(data.chunk));
    this.eventBus.on('world:chunkUnloaded', (data: any) => this.clearChunk(`${data.x},${data.y}`));

    this.eventBus.emit('memoryFragmentSystem:ready', {
      collectedCount: this.collected.size,
    });
  }

  private async loadTexture(): Promise<PIXI.Texture | null> {
    try {
      return await PIXI.Assets.load<PIXI.Texture>(resolveAssetUrl(spriteAtlas.ui.memory_fragment));
    } catch (error) {
      console.warn('[MemoryFragmentSystem] Fragment texture unavailable:', error);
      return null;
    }
  }

  private syncLoadedChunks(): void {
    for (const chunk of this.worldSystem.getLoadedChunks()) {
      this.syncChunk(chunk);
    }
  }

  private syncChunk(chunk: ChunkData): void {
    if (!this.layer) return;

    for (const spawn of fragmentSpawnsFromChunk(chunk)) {
      if (this.collected.has(spawn.id) || this.fragments.has(spawn.id)) continue;
      this.addView(spawn);
    }
  }

  private addView(spawn: FragmentSpawn): void {
    if (!this.layer) return;

    const sprite = new PIXI.Sprite(this.texture ?? PIXI.Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.position.set(spawn.x, spawn.y);
    sprite.width = 20;
    sprite.height = 20;
    sprite.alpha = 0.95;
    if (!this.texture) sprite.tint = 0x9fe8ff;

    this.layer.addChild(sprite);
    this.fragments.set(spawn.id, {
      ...spawn,
      sprite,
      baseY: spawn.y,
      phase: (this.fragments.size * 1.7) % (Math.PI * 2),
    });
  }

  update(deltaTime: number): void {
    this.elapsed += deltaTime;
    if (!this.layer) return;

    const player = this.playerSystem.getState().position;
    const settings = this.config.progression.fragments;

    for (const fragment of Array.from(this.fragments.values())) {
      fragment.sprite.y =
        fragment.baseY +
        Math.sin(this.elapsed * settings.bobSpeed + fragment.phase) * settings.bobAmplitude;

      if (isWithinPickupRadius(player, fragment, settings.pickupRadius)) {
        this.collect(fragment);
      }
    }
  }

  private collect(fragment: FragmentView): void {
    this.fragments.delete(fragment.id);
    this.collected.add(fragment.id);
    fragment.sprite.destroy();

    this.eventBus.emit('player:addMemory', { amount: 1 });
    this.eventBus.emit('memory:fragmentCollected', {
      id: fragment.id,
      x: fragment.x,
      y: fragment.y,
    });
    this.eventBus.emit(GameEvents.GRAPHICS_EFFECT, {
      type: 'memoryPickup',
      x: fragment.x,
      y: fragment.y,
      scale: 1.2,
      tint: 0x9fe8ff,
      duration: 0.6,
    });
  }

  private clearChunk(chunkKey: string): void {
    for (const fragment of Array.from(this.fragments.values())) {
      if (fragment.chunkKey !== chunkKey) continue;
      fragment.sprite.destroy();
      this.fragments.delete(fragment.id);
    }
  }

  private clearAllFragments(): void {
    for (const fragment of this.fragments.values()) {
      fragment.sprite.destroy();
    }
    this.fragments.clear();
  }

  async shutdown(): Promise<void> {
    this.clearAllFragments();
    // The texture comes from PIXI.Assets' shared cache and may also back the HUD icon.
    this.texture = null;
    this.layer = null;
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        collected: Array.from(this.collected).sort(),
        collectedCount: this.collected.size,
      },
      checksum: 'memoryFragments',
    };
  }

  deserialize(state: ModuleState): void {
    const collected = state.data.collected;
    this.collected = new Set(
      Array.isArray(collected) ? collected.filter((id): id is string => typeof id === 'string') : []
    );

    if (this.layer) {
      this.clearAllFragments();
      this.syncLoadedChunks();
    }
  }
}
