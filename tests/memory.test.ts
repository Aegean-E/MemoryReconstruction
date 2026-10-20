import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus } from '@core/EventBus';
import { ConfigSchemas } from '@core/ConfigManager';
import { PlayerSystem } from '@gameplay/PlayerSystem';
import gameplayConfigJson from '@data/gameplay.config.json';
import {
  MemoryFragmentSystem,
  fragmentSpawnsFromChunk,
  isWithinPickupRadius,
} from '@gameplay/MemoryFragmentSystem';
import type { ChunkData } from '@gameplay/WorldSystem';

const gameplayConfig = ConfigSchemas.gameplay.parse(gameplayConfigJson);

const makePlayer = async (): Promise<{ player: PlayerSystem; bus: EventBus }> => {
  const bus = new EventBus();
  const player = new PlayerSystem(bus, gameplayConfig);
  await player.initialize({
    eventBus: bus,
    config: {},
    sharedState: new Map<string, any>([
      ['inputSystem', { getMovementVector: () => ({ x: 0, y: 0 }) }],
      ['worldSystem', {}],
    ]),
  });
  return { player, bus };
};

const makeChunk = (): ChunkData =>
  ({
    x: 1,
    y: 2,
    biome: 'ruins',
    tiles: [],
    entities: [
      { type: 'memoryFragment', x: 10, y: 20, properties: {} },
      { type: 'scavenger', x: 30, y: 40, properties: {} },
      { type: 'memoryFragment', x: 50, y: 60, properties: {} },
    ],
    generated: true,
    timestamp: 0,
  }) as ChunkData;

describe('memory fragment progression', () => {
  it('grants fragments, experience and a change event', async () => {
    const { player, bus } = await makePlayer();
    const changes: Array<{ memoryFragments: number; amount: number }> = [];
    bus.on('player:memoryChanged', (data: any) => {
      changes.push(data);
    });

    bus.emitSync('player:addMemory', { amount: 3 });

    expect(player.getProgression().memoryFragments).toBe(3);
    expect(player.getProgression().experience).toBe(
      3 * gameplayConfig.progression.fragments.xpValue
    );
    expect(changes).toEqual([{ memoryFragments: 3, amount: 3 }]);
  });

  it('ignores zero, negative and non-finite amounts', async () => {
    const { player, bus } = await makePlayer();

    bus.emitSync('player:addMemory', { amount: 0 });
    bus.emitSync('player:addMemory', { amount: -4 });
    bus.emitSync('player:addMemory', { amount: Number.NaN });

    expect(player.getProgression().memoryFragments).toBe(0);
    expect(player.getProgression().experience).toBe(0);
  });

  it('levels up and unlocks an ability at the configured threshold', async () => {
    const { player, bus } = await makePlayer();
    const unlocks: string[] = [];
    bus.on('player:abilityUnlocked', (data: any) => {
      unlocks.push(data.abilityId);
    });

    // The default fragment XP value is 10 and the first level needs 100 XP.
    bus.emitSync('player:addMemory', { amount: 10 });

    expect(player.getProgression().level).toBe(2);
    expect(player.getAbilities().get('heal')?.unlocked).toBe(true);
    expect(unlocks).toContain('heal');
  });
});

describe('memory fragment world helpers', () => {
  it('extracts only memory fragments with stable chunk-local ids', () => {
    const spawns = fragmentSpawnsFromChunk(makeChunk());

    expect(spawns.map((spawn) => spawn.id)).toEqual(['1,2:0', '1,2:2']);
    expect(spawns.map((spawn) => [spawn.x, spawn.y])).toEqual([
      [10, 20],
      [50, 60],
    ]);
  });

  it('uses an inclusive pickup radius', () => {
    expect(isWithinPickupRadius({ x: 0, y: 0 }, { x: 47, y: 0 }, 48)).toBe(true);
    expect(isWithinPickupRadius({ x: 0, y: 0 }, { x: 48, y: 0 }, 48)).toBe(true);
    expect(isWithinPickupRadius({ x: 0, y: 0 }, { x: 49, y: 0 }, 48)).toBe(false);
  });
});

describe('memory fragment persistence', () => {
  let system: MemoryFragmentSystem;

  beforeEach(() => {
    system = new MemoryFragmentSystem(new EventBus(), gameplayConfig);
  });

  it('round-trips the collected fragment ids', () => {
    system.deserialize({
      version: '1.0.0',
      timestamp: 0,
      data: { collected: ['1,2:0', '1,2:2'], collectedCount: 2 },
      checksum: 'fragments',
    });

    expect(system.serialize().data).toEqual({
      collected: ['1,2:0', '1,2:2'],
      collectedCount: 2,
    });
  });

  it('ignores malformed collected state', () => {
    system.deserialize({
      version: '1.0.0',
      timestamp: 0,
      data: { collected: 'not-an-array' },
      checksum: 'fragments',
    });

    expect(system.serialize().data).toEqual({ collected: [], collectedCount: 0 });
  });
});
