import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/EventBus';
import { ConfigSchemas } from '@core/ConfigManager';
import { CombatSystem } from '@gameplay/CombatSystem';
import { ENEMY_DEFINITIONS, selectEliteModifier } from '@gameplay/enemyCatalog';
import gameplayConfigJson from '@data/gameplay.config.json';

const gameplayConfig = ConfigSchemas.gameplay.parse(gameplayConfigJson);

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

const step = (combat: CombatSystem, seconds: number, delta = 0.05): void => {
  const steps = Math.round(seconds / delta);
  for (let i = 0; i < steps; i++) combat.update(delta);
};

describe('enemy catalog', () => {
  it('spawns every enemy type in the world spawn tables with its authored stats', async () => {
    const { combat, bus } = await makeCombat();

    expect(ENEMY_DEFINITIONS.length).toBeGreaterThanOrEqual(13);

    ENEMY_DEFINITIONS.forEach((definition, index) => {
      bus.emitSync('entity:spawn', {
        type: definition.type,
        x: 10_000 + index * 500,
        y: 10_000,
        properties: {},
      });
    });

    expect(combat.getEntities().size).toBe(ENEMY_DEFINITIONS.length);

    for (const definition of ENEMY_DEFINITIONS) {
      const entity = Array.from(combat.getEntities().values()).find(
        (candidate) => candidate.type === definition.type
      );
      expect(entity, `missing spawn for ${definition.type}`).toBeDefined();
      expect(entity!.stats.maxHealth).toBe(definition.stats.maxHealth);
      expect(entity!.stats.damage).toBe(definition.stats.damage);
      expect(entity!.ai.attackWindup).toBe(definition.attack.windup);
      expect(entity!.ai.retreatDuration).toBe(definition.attack.retreat);
      expect(entity!.ai.attackKind).toBe(
        definition.archetype === 'ranged' ? 'projectile' : 'melee'
      );
    }
  });
});

describe('elite modifiers', () => {
  it('gates elites by depth and applies authored multipliers', async () => {
    const { combat, bus } = await makeCombat();

    expect(selectEliteModifier(0, 5, 10)).toBeNull();
    expect(selectEliteModifier(0, 20, 10)?.name).toBe('Veteran');

    (combat as any).rng = () => 0;
    bus.emitSync('world:chunkGenerated', {
      chunk: {
        x: 5,
        y: 0,
        biome: 'ruins',
        entities: [{ type: 'scavenger', x: 10_000, y: 10_000, properties: { depth: 20 } }],
      },
    });

    const entity = Array.from(combat.getEntities().values())[0];
    expect(entity.eliteName).toBe('Veteran');
    expect(entity.eliteColor).toBe(16755200);
    // Depth 20 doubles base health to 100; Veteran adds 1.5x -> 150.
    expect(entity.stats.maxHealth).toBe(150);
  });

  it('does not roll random elites on hand-tuned bosses', async () => {
    const { combat, bus } = await makeCombat();
    (combat as any).rng = () => 0;
    bus.emitSync('world:chunkGenerated', {
      chunk: {
        x: 6,
        y: 0,
        biome: 'sanctuary',
        entities: [{ type: 'keeper', x: 20_000, y: 20_000, properties: { depth: 20 } }],
      },
    });

    const keeper = Array.from(combat.getEntities().values()).find(
      (entity) => entity.type === 'keeper'
    )!;
    expect(keeper.eliteName).toBeUndefined();
    // Depth 20 doubles the Keeper's 1000 HP, with no elite multiplier.
    expect(keeper.stats.maxHealth).toBe(2000);
  });
});

describe('boss phases', () => {
  it('crosses authored thresholds once and applies their multipliers', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'forgotten', x: 10_000, y: 10_000 });
    const boss = Array.from(combat.getEntities().values())[0];
    const phases: any[] = [];
    const abilities: any[] = [];
    const shots: any[] = [];
    bus.on('combat:bossPhase', (data: any) => {
      phases.push(data);
    });
    bus.on('combat:bossAbility', (data: any) => {
      abilities.push(data);
    });
    bus.on('projectile:fire', (data: any) => {
      shots.push(data);
    });

    (combat as any).dealDamage(boss.id, 'player', 200, 'true', false, { x: 0, y: 0 }, []);
    expect(boss.phaseIndex).toBe(1);
    expect(boss.stats.speed).toBe(84);
    expect(phases).toHaveLength(1);
    expect(abilities.map((entry) => entry.ability)).toContain('forgotten_army');
    expect(combat.getEntities().size).toBe(3);

    combat.update(0.4);
    (combat as any).dealDamage(boss.id, 'player', 200, 'true', false, { x: 0, y: 0 }, []);
    expect(boss.phaseIndex).toBe(2);
    expect(boss.stats.damage).toBe(53);
    expect(phases).toHaveLength(2);
    expect(abilities.map((entry) => entry.ability)).toContain('void_domain');
    expect(shots).toHaveLength(8);
  });
});

describe('keeper phase abilities', () => {
  it('teleports, fires a beam spread and then a true-ending ring', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'keeper', x: 10_000, y: 10_000 });
    const boss = Array.from(combat.getEntities().values())[0];
    const abilities: string[] = [];
    const shots: any[] = [];
    bus.on('combat:bossAbility', (data: any) => {
      abilities.push(data.ability);
    });
    bus.on('projectile:fire', (data: any) => {
      shots.push(data);
    });

    (combat as any).dealDamage(boss.id, 'player', 300, 'true', false, { x: 0, y: 0 }, []);
    expect(boss.phaseIndex).toBe(1);
    expect(boss.position.x).toBe(120);
    expect(abilities).toContain('timeline_shift');

    boss.state.invincible = false;
    (combat as any).dealDamage(boss.id, 'player', 300, 'true', false, { x: 0, y: 0 }, []);
    expect(boss.phaseIndex).toBe(2);
    expect(abilities).toContain('reconstruction_beam');
    expect(shots).toHaveLength(3);

    boss.state.invincible = false;
    (combat as any).dealDamage(boss.id, 'player', 300, 'true', false, { x: 0, y: 0 }, []);
    expect(boss.phaseIndex).toBe(3);
    expect(abilities).toContain('true_ending');
    expect(shots).toHaveLength(15);
  });
});

describe('damage-over-time boss phases', () => {
  it('crosses a phase threshold when a damage-over-time tick lands', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'forgotten', x: 10_000, y: 10_000 });
    const boss = Array.from(combat.getEntities().values())[0];

    (combat as any).applyTickDamage(boss, 200, 'player');

    expect(boss.phaseIndex).toBe(1);
    expect(boss.stats.speed).toBe(84);
    // forgotten_army still executes from the DoT-triggered phase.
    expect(combat.getEntities().size).toBe(3);
  });
});

describe('telegraphed attacks', () => {
  it('does not deal damage before the windup elapses', async () => {
    const { combat, bus } = await makeCombat();
    const hits: any[] = [];
    bus.on('player:damage', (data: any) => {
      hits.push(data);
    });

    bus.emitSync('entity:spawn', { type: 'scavenger', x: 40, y: 0, properties: {} });

    // idle -> chase -> attack -> windup begins, but the strike is still ahead.
    step(combat, 0.25);
    expect(hits).toHaveLength(0);

    step(combat, 0.5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({ source: expect.stringContaining('scavenger') });
  });

  it('does not cancel a windup from ordinary light-hit knockback', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'scavenger', x: 40, y: 0, properties: {} });
    step(combat, 0.2);

    const enemy = Array.from(combat.getEntities().values())[0];
    expect(enemy.ai.attackPhase).toBe('windup');
    const timerBefore = enemy.ai.attackTimer;

    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 60,
      damage: 10,
      critical: false,
      knockbackForce: 300,
    });
    combat.update(0.05);

    expect(enemy.ai.attackPhase).toBe('windup');
    expect(enemy.ai.attackTimer).toBeLessThan(timerBefore);
  });

  it('cancels a windup when a heavy hit interrupts it', async () => {
    const { combat, bus } = await makeCombat();
    const hits: any[] = [];
    bus.on('player:damage', (data: any) => {
      hits.push(data);
    });

    bus.emitSync('entity:spawn', { type: 'scavenger', x: 40, y: 0, properties: {} });
    step(combat, 0.2);

    const enemy = Array.from(combat.getEntities().values())[0];
    expect(enemy.ai.attackPhase).toBe('windup');

    bus.emitSync('combat:attack', {
      sourceId: 'player',
      x: 0,
      y: 0,
      radius: 60,
      damage: 25,
      critical: false,
      knockbackForce: 0,
    });

    expect(enemy.ai.attackPhase).toBe('ready');
    step(combat, 0.2);
    expect(hits).toHaveLength(0);
  });

  it('ranged enemies fire a projectile after their windup', async () => {
    const { combat, bus } = await makeCombat();
    const shots: any[] = [];
    const hits: any[] = [];
    bus.on('projectile:fire', (data: any) => {
      shots.push(data);
    });
    bus.on('player:damage', (data: any) => {
      hits.push(data);
    });

    bus.emitSync('entity:spawn', { type: 'spirit', x: 100, y: 0, properties: {} });

    step(combat, 1.0);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(shots[0]).toMatchObject({ team: 'enemy', targetId: 'player' });

    step(combat, 0.6);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('skirmishers retreat after a strike instead of standing in melee', async () => {
    const { combat, bus } = await makeCombat();
    let strikeX: number | null = null;
    bus.on('player:damage', () => {
      const enemy = Array.from(combat.getEntities().values())[0];
      strikeX = enemy.position.x;
    });

    bus.emitSync('entity:spawn', { type: 'memoryEcho', x: 50, y: 0, properties: {} });
    step(combat, 0.9);

    expect(strikeX).not.toBeNull();
    const enemy = Array.from(combat.getEntities().values())[0];
    expect(enemy.position.x).toBeGreaterThan(strikeX!);
    // The retreat is allowed to outrun the 1.2x attack range without being
    // cancelled back into a chase on the next frame.
    expect(enemy.ai.attackPhase).toBe('recovery');
    expect(enemy.position.x).toBeGreaterThan(enemy.ai.attackRange * 1.2);
  });

  it('hostile projectiles pass through other enemies', async () => {
    const { combat, bus } = await makeCombat();
    bus.emitSync('entity:spawn', { type: 'spirit', x: 100, y: 0, properties: {} });
    bus.emitSync('entity:spawn', { type: 'scavenger', x: 60, y: 0, properties: {} });

    const scavenger = Array.from(combat.getEntities().values()).find(
      (entity) => entity.type === 'scavenger'
    )!;
    const healthBefore = scavenger.stats.health;

    step(combat, 1.8);

    expect(scavenger.stats.health).toBe(healthBefore);
  });
});
