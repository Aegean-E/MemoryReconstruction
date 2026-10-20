import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/EventBus';
import { ConfigSchemas } from '@core/ConfigManager';
import { PlayerSystem } from '@gameplay/PlayerSystem';
import { CombatSystem } from '@gameplay/CombatSystem';
import gameplayConfigJson from '@data/gameplay.config.json';

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

const makeCombat = async (): Promise<{ combat: CombatSystem; bus: EventBus }> => {
  const bus = new EventBus();
  const combat = new CombatSystem(bus, gameplayConfig);
  await combat.initialize({
    eventBus: bus,
    config: {},
    sharedState: new Map<string, any>([
      [
        'worldSystem',
        {
          chunks: new Map(),
          loadedChunks: new Set(),
        },
      ],
      [
        'playerSystem',
        {
          getState: () => ({ position: { x: 0, y: 0 } }),
          getStats: () => ({ armor: 0 }),
          getProgression: () => ({}),
        },
      ],
    ]),
  });
  return { combat, bus };
};

const spawnScavenger = (bus: EventBus, x: number): void => {
  bus.emitSync('entity:spawn', { type: 'scavenger', x, y: 0, properties: {} });
};

describe('player melee intents', () => {
  it('emits a slash intent owned by the player with base damage', async () => {
    const { player, bus } = await makePlayer();
    const intents: any[] = [];
    bus.on('combat:attack', (data: any) => {
      intents.push(data);
    });

    bus.emitSync('player:attack', {});

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      sourceId: 'player',
      x: 30,
      radius: 60,
      critical: expect.any(Boolean),
      knockbackForce: gameplayConfig.combat.knockbackForce,
    });
    expect(intents[0].damage).toBeCloseTo(player.getStats().damage * 1.1);
  });

  it('emits a large arena intent for the ultimate', async () => {
    const { player, bus } = await makePlayer();
    const intents: any[] = [];
    bus.on('combat:attack', (data: any) => {
      intents.push(data);
    });

    expect(player.unlockAbility('ultimate')).toBe(true);
    bus.emitSync('player:useAbility', { id: 'ultimate' });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      sourceId: 'player',
      radius: 200,
      critical: true,
    });
    expect(intents[0].damage).toBeCloseTo(player.getStats().damage * 10);
  });
});

describe('combat attack resolution', () => {
  it('damages an enemy in range and awards kill memory to the player', async () => {
    const { bus } = await makeCombat();
    const damage: any[] = [];
    const kills: any[] = [];
    const memory: any[] = [];
    bus.on('combat:damage', (data: any) => {
      damage.push(data);
    });
    bus.on('combat:kill', (data: any) => {
      kills.push(data);
    });
    bus.on('player:addMemory', (data: any) => {
      memory.push(data);
    });

    spawnScavenger(bus, 30);
    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 60,
      damage: 1000,
      critical: false,
      knockbackForce: 0,
    });

    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({
      sourceId: 'player',
      type: 'physical',
      amount: 952,
    });
    expect(kills).toHaveLength(1);
    expect(kills[0].killerId).toBe('player');
    expect(memory).toEqual([{ amount: 5 }]);
  });

  it('ignores enemies outside the attack radius', async () => {
    const { bus } = await makeCombat();
    const damage: any[] = [];
    const kills: any[] = [];
    bus.on('combat:damage', (data: any) => {
      damage.push(data);
    });
    bus.on('combat:kill', (data: any) => {
      kills.push(data);
    });

    spawnScavenger(bus, 100);
    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 60,
      damage: 1000,
      critical: false,
      knockbackForce: 0,
    });

    expect(damage).toHaveLength(0);
    expect(kills).toHaveLength(0);
  });

  it('applies the critical multiplier exactly once', async () => {
    const { bus } = await makeCombat();
    const damage: any[] = [];
    bus.on('combat:damage', (data: any) => {
      damage.push(data);
    });

    spawnScavenger(bus, 30);
    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 60,
      damage: 100,
      critical: true,
      knockbackForce: 0,
    });

    expect(damage).toHaveLength(1);
    expect(damage[0].amount).toBe(190);
  });

  it('keeps targeted combat:hit input working for enemy attacks', async () => {
    const { bus } = await makeCombat();
    const playerDamage: any[] = [];
    bus.on('player:damage', (data: any) => {
      playerDamage.push(data);
    });

    bus.emitSync('combat:hit', {
      sourceId: 'enemy_1',
      targetId: 'player',
      damage: 10,
      critical: false,
      knockback: { x: 0, y: 0 },
      statusEffects: [],
    });

    expect(playerDamage).toHaveLength(1);
    expect(playerDamage[0]).toMatchObject({ amount: 10, source: 'enemy_1' });
  });
});
