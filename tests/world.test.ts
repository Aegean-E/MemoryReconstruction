import { describe, expect, it, vi } from 'vitest';
import * as PIXI from 'pixi.js';
import { EventBus } from '@core/EventBus';
import { ConfigSchemas } from '@core/ConfigManager';
import { WorldSystem } from '@gameplay/WorldSystem';
import { resolveTileColor } from '@gameplay/tileColors';
import type { BiomeConfig, ChunkData, TileData } from '@gameplay/WorldSystem';
import gameplayConfigJson from '@data/gameplay.config.json';

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

  const makeFullChunk = (x = 0, y = 0): ChunkData => ({
    x,
    y,
    biome: 'ruins',
    tiles: Array.from({ length: 16 }, () =>
      Array.from({ length: 16 }, () => ({
        type: 'floor' as const,
        variant: 0,
        height: 0,
        properties: { solid: true },
      }))
    ),
    entities: [],
    generated: true,
    timestamp: 0,
  });

  const makeMarkerChunk = (x: number, y: number, solidTx: number, solidTy: number): ChunkData => ({
    x,
    y,
    biome: 'ruins',
    tiles: Array.from({ length: 16 }, (_row, ty) =>
      Array.from({ length: 16 }, (_col, tx) => {
        const solid = tx === solidTx && ty === solidTy;
        return {
          type: solid ? ('floor' as const) : ('empty' as const),
          variant: 0,
          height: 0,
          properties: { solid },
        };
      })
    ),
    entities: [],
    generated: true,
    timestamp: 0,
  });

  it('renders a full chunk as a single Graphics display object', () => {
    const { world, layer, added } = makeWorld();
    (world as any).renderChunk(makeFullChunk(0, 0));

    expect(layer.addChild).toHaveBeenCalledTimes(1);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(PIXI.Graphics);
    expect(added[0].label).toBe('chunk_0_0');
  });

  it('still batches into one object when the atlas provides textures', () => {
    const { world, layer, added } = makeWorld();
    (world as any).renderSystem.getTileTexture = () => PIXI.Texture.WHITE;
    (world as any).renderChunk(makeFullChunk(0, 0));

    expect(layer.addChild).toHaveBeenCalledTimes(1);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(PIXI.Graphics);
  });

  it('maps a batched texture fill onto the atlas frame, not the whole page', () => {
    const { world } = makeWorld();
    const source = new PIXI.TextureSource({ width: 128, height: 288, resolution: 1 });
    const frame = new PIXI.Texture({ source, frame: new PIXI.Rectangle(32, 0, 32, 32) });

    const matrix = (world as any).tileFillMatrix(frame) as PIXI.Matrix;
    const inverse = matrix.clone().invert();

    expect(inverse.a).toBeCloseTo(0.25, 5);
    expect(inverse.d).toBeCloseTo(32 / 288, 5);
    expect(inverse.tx).toBeCloseTo(0.25, 5);
    expect(inverse.ty).toBeCloseTo(0, 5);
  });

  it('resolves tiles in negative chunks with a floored modulo', () => {
    const { world } = makeWorld();
    (world as any).chunks.set('-1,-1', makeMarkerChunk(-1, -1, 15, 15));

    expect(world.getTileAt(-1, -1)?.type).toBe('floor');
    expect(world.isSolidAt(-1, -1)).toBe(true);
    expect(world.getTileAt(-32, -32)?.type).toBe('floor');
    expect(world.getTileAt(-512, -512)?.type).toBe('empty');
    expect(world.isSolidAt(-500, -500)).toBe(false);
    expect(world.getTileAt(-2000, -2000)).toBeNull();
  });

  it('only streams chunks when the player crosses a chunk boundary', () => {
    const { world } = makeWorld();
    const ensure = vi.fn();
    const unload = vi.fn();
    (world as any).ensureChunk = ensure;
    (world as any).unloadDistantChunks = unload;

    (world as any).onPlayerMove({ x: 10, y: 10 });
    expect(ensure).toHaveBeenCalled();
    expect(unload).toHaveBeenCalledTimes(1);

    ensure.mockClear();
    unload.mockClear();
    (world as any).onPlayerMove({ x: 300, y: 300 });
    expect(ensure).not.toHaveBeenCalled();
    expect(unload).not.toHaveBeenCalled();

    (world as any).onPlayerMove({ x: 600, y: 10 });
    expect(ensure).toHaveBeenCalled();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('validates spawn positions against the tiles generated in the same chunk', async () => {
    const { world } = makeWorld();
    const emptyTiles = Array.from({ length: 16 }, () =>
      Array.from({ length: 16 }, () => ({
        type: 'empty' as const,
        variant: 0,
        height: 0,
        properties: { solid: false },
      }))
    );
    (world as any).generateTiles = () => emptyTiles;
    (world as any).biomes = [
      {
        name: 'ruins',
        weight: 100,
        tilePalette: ['floor'],
        entityTables: [{ entityType: 'scavenger', weight: 100, minDepth: 0, maxDepth: 100 }],
        colorPalette: [0x111111],
        musicTheme: 'exploration',
        ambientSound: 'wind_ruins',
      },
    ];

    const chunk = await (world as any).generateChunk(0, 0);

    // Every tile is empty, so no spawn may pass validation. Before the chunk
    // was registered first, all 10 attempts looked valid and enemies spawned.
    expect(chunk.entities).toHaveLength(0);
  });

  it('emits chunk-derived depth when the player crosses a chunk boundary', () => {
    const { world } = makeWorld();
    const depths: number[] = [];
    (world as any).eventBus.on('world:depthChanged', (data: { depth: number }) => {
      depths.push(data.depth);
    });
    (world as any).ensureChunk = vi.fn();
    (world as any).unloadDistantChunks = vi.fn();

    (world as any).onPlayerMove({ x: 600, y: 0 });

    expect(depths).toEqual([0.5]);
  });

  it('does not keep a forest spawn for the unimplemented ancientTree entity', () => {
    const { world } = makeWorld();
    (world as any).initializeBiomes();
    const forest = (world as any).biomes.find(
      (candidate: { name: string }) => candidate.name === 'forest'
    );
    expect(
      forest.entityTables.some(
        (table: { entityType: string }) => table.entityType === 'ancientTree'
      )
    ).toBe(false);
  });

  it('hashes noise deterministically without a string cache', () => {
    const { world } = makeWorld();
    expect((world as any).getNoise(1.25, 2.5, 3)).toBe((world as any).getNoise(1.25, 2.5, 3));
    expect((world as any).noiseCache).toBeUndefined();
  });
});
