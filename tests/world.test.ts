import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@core/EventBus';
import { ConfigSchemas } from '@core/ConfigManager';
import { WorldSystem } from '@gameplay/WorldSystem';
import { resolveTileColor } from '@gameplay/tileColors';
import type { BiomeConfig, ChunkData, TileData } from '@gameplay/WorldSystem';
import gameplayConfigJson from '@assets/data/gameplay.config.json';

const biome = {
  colorPalette: [0x111111, 0x222222, 0x333333, 0x444444],
} as BiomeConfig;

const tile = (variant: number): TileData => ({
  type: 'floor',
  variant,
  height: 0,
  properties: { solid: true },
});

describe('resolveTileColor', () => {
  it('clamps negative variants to the first palette color', () => {
    expect(resolveTileColor(tile(-2), biome)).toBe(0x111111);
  });

  it('clamps out-of-range variants to the last palette color', () => {
    expect(resolveTileColor(tile(99), biome)).toBe(0x444444);
  });

  it('falls back to the first color for non-finite variants', () => {
    expect(resolveTileColor(tile(Number.NaN), biome)).toBe(0x111111);
  });
});

describe('WorldSystem chunk streaming', () => {
  const gameplayConfig = ConfigSchemas.gameplay.parse(gameplayConfigJson);

  const makeChunk = (): ChunkData => ({
    x: 0,
    y: 0,
    biome: 'ruins',
    tiles: [[{ type: 'empty', variant: 0, height: 0, properties: { solid: false } }]],
    entities: [],
    generated: true,
    timestamp: 0,
  });

  const makeWorld = (): {
    world: WorldSystem;
    layer: any;
    added: any[];
  } => {
    const added: any[] = [];
    const layer = {
      addChild: vi.fn((child: any): void => {
        added.push(child);
      }),
    };
    const world = new WorldSystem(new EventBus(), gameplayConfig);
    (world as any).renderSystem = {
      getLayer: (name: string) => (name === 'background' ? layer : undefined),
      getTileTexture: () => null,
    };
    (world as any).biomes = [{ name: 'ruins', colorPalette: [0x111111] }];
    return { world, layer, added };
  };

  it('re-renders and reloads a cached chunk after it was unloaded', () => {
    const { world, layer, added } = makeWorld();
    const chunk = makeChunk();
    (world as any).chunks.set('0,0', chunk);
    const generated = vi.fn();
    (world as any).eventBus.on('world:chunkGenerated', generated);

    (world as any).ensureChunk(0, 0);

    expect(world.getLoadedChunks()).toEqual([chunk]);
    expect(layer.addChild).toHaveBeenCalledTimes(1);
    expect(added[0].label).toBe('chunk_0_0');
    expect(generated).toHaveBeenCalledWith({ chunk });
  });

  it('does not re-render an already loaded chunk', () => {
    const { world, layer } = makeWorld();
    const chunk = makeChunk();
    (world as any).chunks.set('0,0', chunk);
    (world as any).loadedChunks.add('0,0');

    (world as any).ensureChunk(0, 0);

    expect(layer.addChild).not.toHaveBeenCalled();
  });
});
