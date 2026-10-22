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
      ['worldSystem', { isSolidAt: () => false }],
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
          getLoadedChunks: () => [],
          isSolidAt: () => false,
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

describe('player event loop safety', () => {
  it('heals exactly once per PLAYER_HEAL command without re-emitting it', async () => {
    const { player, bus } = await makePlayer();
    let healEvents = 0;
    bus.on('player:heal', () => {
      healEvents++;
    });

    bus.emitSync('player:damage', { amount: 50, source: 'enemy' });
    expect(player.getStats().health).toBe(50);

    bus.emitSync('player:heal', { amount: 30, source: 'item' });

    expect(player.getStats().health).toBe(80);
    expect(healEvents).toBe(1);
  });

  it('processes one PLAYER_DAMAGE command exactly once', async () => {
    const { player, bus } = await makePlayer();
    const seen: any[] = [];
    bus.on('player:damage', (data: any) => {
      seen.push(data);
    });

    bus.emitSync('player:damage', { amount: 10, source: 'enemy' });

    expect(player.getStats().health).toBe(90);
    expect(seen).toHaveLength(1);
  });
});

describe('combo chain', () => {
  it('advances only on confirmed hits, caps, and drops on damage or timeout', async () => {
    const { player, bus } = await makePlayer();
    const intents: any[] = [];
    bus.on('combat:attack', (data: any) => {
      intents.push(data);
    });

    for (let i = 0; i < 8; i++) {
      bus.emitSync('player:attack', {});
      bus.emitSync('combat:attackResolved', { sourceId: 'player', hits: 1 });
      player.update(0.35);
    }

    const { comboMax, comboDamageStep, comboWindow } = gameplayConfig.combat;
    expect(intents).toHaveLength(8);
    expect(intents[intents.length - 1].combo).toBe(comboMax);
    expect(intents[intents.length - 1].damage).toBeCloseTo(
      player.getStats().damage * (1 + comboMax * comboDamageStep)
    );

    // Whiffing must not extend the chain: only a resolved hit counts.
    bus.emitSync('player:damage', { amount: 1, source: 'enemy' });
    player.update(0.35);
    bus.emitSync('player:attack', {});
    bus.emitSync('combat:attackResolved', { sourceId: 'player', hits: 0 });
    player.update(0.35);
    bus.emitSync('player:attack', {});
    expect(intents[intents.length - 1].combo).toBe(0);
    expect(intents[intents.length - 1].damage).toBeCloseTo(player.getStats().damage);

    // Taking a hit resets the chain
    bus.emitSync('combat:attackResolved', { sourceId: 'player', hits: 1 });
    expect(player.getCombatChains().comboCount).toBe(1);
    bus.emitSync('player:damage', { amount: 1, source: 'enemy' });
    player.update(0.35);
    bus.emitSync('player:attack', {});
    expect(intents[intents.length - 1].combo).toBe(0);

    // The chain also expires on simulation time, not wall-clock time
    bus.emitSync('combat:attackResolved', { sourceId: 'player', hits: 1 });
    player.update(comboWindow + 0.1);
    expect(player.getCombatChains().comboCount).toBe(0);
    bus.emitSync('player:attack', {});
    expect(intents[intents.length - 1].combo).toBe(0);
  });
});

describe('memory surge', () => {
  it('compounds fragment experience while the chain is alive', async () => {
    const { player, bus } = await makePlayer();
    const surges: any[] = [];
    bus.on('player:memorySurge', (data: any) => {
      surges.push(data);
    });

    bus.emitSync('player:addMemory', { amount: 1 });
    bus.emitSync('player:addMemory', { amount: 1 });

    const fragments = gameplayConfig.progression.fragments;
    const expected = fragments.xpValue + fragments.xpValue * (1 + fragments.surgeStep);
    expect(player.getProgression().experience).toBeCloseTo(expected);
    expect(player.getProgression().memoryFragments).toBe(2);
    expect(surges.map((surge) => surge.multiplier)).toEqual([1, 1 + fragments.surgeStep]);
  });

  it('breaks the chain when the player takes damage', async () => {
    const { player, bus } = await makePlayer();

    bus.emitSync('player:addMemory', { amount: 1 });
    bus.emitSync('player:damage', { amount: 1, source: 'enemy' });
    bus.emitSync('player:addMemory', { amount: 1 });

    expect(player.getProgression().experience).toBeCloseTo(
      gameplayConfig.progression.fragments.xpValue * 2
    );
  });
});

describe('player damage resolution', () => {
  it('applies the critical multiplier to incoming enemy damage exactly once', async () => {
    const { player, bus } = await makePlayer();

    bus.emitSync('player:damage', { amount: 10, source: 'enemy', critical: true });

    expect(player.getStats().health).toBe(80);
  });

  it('carries knockback for a short window instead of erasing it next frame', async () => {
    const { player, bus } = await makePlayer();
    const startX = player.getState().position.x;

    bus.emitSync('player:damage', {
      amount: 1,
      source: 'enemy',
      knockback: { x: 300, y: 0 },
    });
    player.update(0.05);

    expect(player.getState().position.x).toBeGreaterThan(startX);
    expect(player.getState().knockbackTimer).toBeGreaterThan(0);
  });

  it('spending a stat point does not jump derived stats to a different formula', async () => {
    const { player } = await makePlayer();
    const damageBefore = player.getStats().damage;
    const armorBefore = player.getStats().armor;
    (player.getProgression() as any).statPoints = 1;

    player.addStatPoints('strength', 1);

    expect(player.getStats().damage).toBe(damageBefore + 2);
    expect(player.getStats().armor).toBe(armorBefore);
  });
});

describe('run loop', () => {
  it('tracks the deepest chunk-derived depth and never regresses', async () => {
    const { player, bus } = await makePlayer();

    bus.emitSync('world:depthChanged', { depth: 4.5 });
    bus.emitSync('world:depthChanged', { depth: 2 });

    expect(player.getProgression().deepestDepth).toBe(4.5);
  });

  it('completes a run when the Keeper dies', async () => {
    const { player, bus } = await makePlayer();
    const completions: any[] = [];
    bus.on('player:runCompleted', (data: any) => {
      completions.push(data);
    });

    bus.emitSync('combat:bossDefeated', { type: 'keeper' });
    bus.emitSync('combat:bossDefeated', { type: 'keeper' });

    expect(player.getProgression().completedRuns).toBe(1);
    expect(completions).toHaveLength(1);
    expect(completions[0].completedRuns).toBe(1);

    // A death starts a new run, so the next Keeper can complete it.
    bus.emitSync('player:damage', { amount: 999, source: 'enemy' });
    bus.emitSync('combat:bossDefeated', { type: 'keeper' });
    expect(player.getProgression().completedRuns).toBe(2);
  });

  it('resets run progression under permadeath while preserving meta stats', async () => {
    const permadeathConfig = ConfigSchemas.gameplay.parse({
      ...gameplayConfigJson,
      roguelike: { ...gameplayConfigJson.roguelike, permadeath: true },
    });
    const bus = new EventBus();
    const player = new PlayerSystem(bus, permadeathConfig);
    await player.initialize({
      eventBus: bus,
      config: {},
      sharedState: new Map<string, any>([
        ['inputSystem', { getMovementVector: () => ({ x: 0, y: 0 }) }],
        ['worldSystem', { isSolidAt: () => false }],
      ]),
    });

    bus.emitSync('world:depthChanged', { depth: 3 });
    bus.emitSync('combat:bossDefeated', { type: 'keeper' });
    bus.emitSync('player:addMemory', { amount: 20 });
    bus.emitSync('player:addItem', {
      item: {
        id: 'run_loot',
        name: 'Run Loot',
        description: '',
        type: 'weapon',
        rarity: 'rare',
        stats: {},
        maxStack: 1,
        quantity: 1,
      },
    });
    expect(player.getProgression().level).toBeGreaterThan(1);
    expect(player.getAbilities().get('heal')?.unlocked).toBe(true);
    expect(player.getInventory()).toHaveLength(1);
    expect(player.equipItem('run_loot')).toBe(true);
    expect(player.getEquipment().weapon?.id).toBe('run_loot');

    bus.emitSync('player:damage', { amount: 999, source: 'enemy' });

    expect(player.getProgression().level).toBe(1);
    expect(player.getProgression().experience).toBe(0);
    expect(player.getProgression().memoryFragments).toBe(0);
    expect(player.getProgression().completedRuns).toBe(1);
    expect(player.getProgression().deepestDepth).toBe(3);
    expect(player.getAbilities().get('heal')?.unlocked).toBe(false);
    expect(player.getInventory()).toHaveLength(0);
    expect(player.getEquipment().weapon).toBeNull();
  });

  it('preserves the once-per-run completion guard across save/load', async () => {
    const { player, bus } = await makePlayer();
    bus.emitSync('combat:bossDefeated', { type: 'keeper' });
    expect(player.getProgression().completedRuns).toBe(1);

    const loaded = new PlayerSystem(bus, gameplayConfig);
    await loaded.initialize({
      eventBus: bus,
      config: {},
      sharedState: new Map<string, any>([
        ['inputSystem', { getMovementVector: () => ({ x: 0, y: 0 }) }],
        ['worldSystem', { isSolidAt: () => false }],
      ]),
    });
    loaded.deserialize(player.serialize());

    bus.emitSync('combat:bossDefeated', { type: 'keeper' });
    expect(loaded.getProgression().completedRuns).toBe(1);
  });

  it('blurs a configurable fraction of current-level XP on death', async () => {
    const { player, bus } = await makePlayer();
    const ended: any[] = [];
    bus.on('player:runEnded', (data: any) => {
      ended.push(data);
    });

    bus.emitSync('player:addMemory', { amount: 5 });
    expect(player.getProgression().experience).toBe(50);

    bus.emitSync('player:damage', { amount: 999, source: 'enemy' });

    const expectedLoss = Math.floor(50 * gameplayConfig.roguelike.deathXpLoss);
    expect(player.getProgression().experience).toBe(50 - expectedLoss);
    expect(ended).toHaveLength(1);
    expect(ended[0].lostXp).toBe(expectedLoss);
  });
});

describe('items and equipment', () => {
  it('consumes a healing item and restores health', async () => {
    const { player, bus } = await makePlayer();
    bus.emitSync('player:addItem', {
      item: {
        id: 'memory_elixir',
        name: 'Memory Elixir',
        description: '',
        type: 'consumable',
        rarity: 'common',
        stats: { heal: 50, manaRestore: 30 },
        maxStack: 10,
        quantity: 1,
      },
    });
    bus.emitSync('player:damage', { amount: 50, source: 'enemy' });
    expect(player.getStats().health).toBe(50);

    expect(player.useItem('memory_elixir')).toBe(true);

    expect(player.getStats().health).toBe(100);
    expect(player.getInventory()).toHaveLength(0);
  });

  it('applies equipment stats on equip and removes them on unequip', async () => {
    const { player, bus } = await makePlayer();
    bus.emitSync('player:addItem', {
      item: {
        id: 'echo_dagger',
        name: 'Echo Dagger',
        description: '',
        type: 'weapon',
        rarity: 'uncommon',
        stats: { damage: 10, critChance: 0.15, speed: 1.5 },
        maxStack: 1,
        quantity: 1,
      },
    });

    expect(player.equipItem('echo_dagger')).toBe(true);
    expect(player.getStats().damage).toBe(20);
    expect(player.getStats().critChance).toBeCloseTo(0.2);
    expect(player.getStats().attackSpeed).toBeCloseTo(1.5);
    expect(player.getEquipment().weapon?.id).toBe('echo_dagger');
    expect(player.getInventory()).toHaveLength(0);

    expect(player.unequipSlot('weapon')).toBe(true);
    expect(player.getStats().damage).toBe(10);
    expect(player.getStats().attackSpeed).toBeCloseTo(1);
    expect(player.getInventory()).toHaveLength(1);
  });

  it('does not let player crit gear amplify incoming enemy crits', async () => {
    const { player, bus } = await makePlayer();
    bus.emitSync('player:addItem', {
      item: {
        id: 'echo_amulet',
        name: 'Echo Amulet',
        description: '',
        type: 'accessory',
        rarity: 'rare',
        stats: { critMultiplier: 0.25 },
        maxStack: 1,
        quantity: 1,
      },
    });
    player.equipItem('echo_amulet');
    expect(player.getStats().critMultiplier).toBeCloseTo(2.25);

    bus.emitSync('player:damage', { amount: 10, source: 'enemy', critical: true });

    // Incoming crits stay at the global 2.0x, not the player's 2.25x.
    expect(player.getStats().health).toBe(80);
  });

  it('round-trips equipped items through save/load', async () => {
    const { player, bus } = await makePlayer();
    bus.emitSync('player:addItem', {
      item: {
        id: 'echo_dagger',
        name: 'Echo Dagger',
        description: '',
        type: 'weapon',
        rarity: 'uncommon',
        stats: { damage: 10, critChance: 0.15, speed: 1.5 },
        maxStack: 1,
        quantity: 1,
      },
    });
    player.equipItem('echo_dagger');

    const loaded = new PlayerSystem(bus, gameplayConfig);
    await loaded.initialize({
      eventBus: bus,
      config: {},
      sharedState: new Map<string, any>([
        ['inputSystem', { getMovementVector: () => ({ x: 0, y: 0 }) }],
        ['worldSystem', { isSolidAt: () => false }],
      ]),
    });
    loaded.deserialize(player.serialize());

    expect(loaded.getEquipment().weapon?.id).toBe('echo_dagger');
    expect(loaded.getStats().damage).toBe(20);
  });
});

describe('inventory stacking', () => {
  it('splits loot quantities into legal stacks instead of overfilling maxStack', async () => {
    const { player, bus } = await makePlayer();

    bus.emitSync('player:addItem', {
      item: {
        id: 'authored_blade',
        name: 'Authored Blade',
        description: '',
        type: 'weapon',
        rarity: 'rare',
        stats: { damage: 15 },
        maxStack: 1,
        quantity: 3,
      },
    });

    expect(player.getInventory()).toHaveLength(3);
    expect(player.getInventory().every((item) => item.quantity === 1)).toBe(true);
  });
});

describe('progression curve', () => {
  it('uses the authored XP curve for the next threshold', async () => {
    const { player, bus } = await makePlayer();

    bus.emitSync('player:addMemory', { amount: 10 });

    expect(player.getProgression().level).toBe(2);
    expect(player.getProgression().experienceToNext).toBe(gameplayConfig.progression.xpCurve[2]);
  });
});

describe('dash', () => {
  it('covers the configured distance and spends stamina', async () => {
    const { player, bus } = await makePlayer();
    const staminaBefore = player.getStats().stamina;
    const startX = player.getState().position.x;

    bus.emitSync('player:dash', {});

    expect(player.getStats().stamina).toBe(staminaBefore - gameplayConfig.player.dashStaminaCost);
    expect(player.getState().dashing).toBe(true);

    player.update(0.15);

    expect(player.getState().dashing).toBe(false);
    expect(player.getState().position.x - startX).toBeCloseTo(
      gameplayConfig.player.dashDistance,
      0
    );
  });

  it('refuses to dash without stamina', async () => {
    const { player, bus } = await makePlayer();
    (player.getStats() as any).stamina = 0;

    bus.emitSync('player:dash', {});

    expect(player.getState().dashing).toBe(false);
  });
});

describe('combat lifecycle', () => {
  it('despawns corpses once the corpse timer elapses', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'scavenger', x: 30, y: 0, properties: {} });
    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 60,
      damage: 1000,
      critical: false,
      knockbackForce: 0,
    });

    expect(combat.getEntities().size).toBe(1);

    for (let i = 0; i < 5; i++) combat.update(0.5);

    expect(combat.getEntities().size).toBe(0);
  });

  it('lets enemy projectiles connect with the player', async () => {
    const { combat, bus } = await makeCombat();
    const hits: any[] = [];
    bus.on('player:damage', (data: any) => {
      hits.push(data);
    });

    bus.emitSync('projectile:fire', {
      sourceId: 'enemy_1',
      x: -100,
      y: 0,
      vx: 400,
      vy: 0,
      damage: 8,
    });

    for (let i = 0; i < 6; i++) combat.update(0.05);

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ amount: 8, source: 'enemy_1' });
  });
});

describe('damage over time', () => {
  it('ticks burn damage without locking the target out of direct hits', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'guardian', x: 0, y: 0, properties: {} });

    const guardian = Array.from(combat.getEntities().values())[0];
    expect(guardian.stats.health).toBe(200);

    bus.emitSync('combat:applyStatus', {
      targetId: guardian.id,
      effect: { type: 'burn', duration: 2, magnitude: 20, sourceId: 'player' },
    });

    combat.update(1.0);
    expect(guardian.stats.health).toBeCloseTo(180, 5);

    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 10,
      damage: 50,
      critical: false,
      knockbackForce: 0,
    });
    expect(guardian.stats.health).toBeLessThan(180);
  });
});

describe('chunk-driven enemy spawning', () => {
  it('spawns chunk enemies once, scales them by depth, and despawns on unload', async () => {
    const { combat, bus } = await makeCombat();
    const chunk = {
      x: 1,
      y: 1,
      biome: 'ruins',
      entities: [
        { type: 'memoryFragment', x: 520, y: 520, properties: {} },
        { type: 'scavenger', x: 540, y: 540, properties: { depth: 4 } },
      ],
    };

    bus.emitSync('world:chunkGenerated', { chunk });

    const entities = Array.from(combat.getEntities().values());
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('scavenger');
    // 50 base health * (1 + 4 * depthScaling.healthPerDepth)
    expect(entities[0].stats.maxHealth).toBe(60);

    // Re-streaming a cached chunk must not duplicate its enemies
    bus.emitSync('world:chunkGenerated', { chunk });
    expect(combat.getEntities().size).toBe(1);

    bus.emitSync('world:chunkUnloaded', { x: 1, y: 1 });
    expect(combat.getEntities().size).toBe(0);
  });
});
