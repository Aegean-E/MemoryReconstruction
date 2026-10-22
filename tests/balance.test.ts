import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/EventBus';
import { ConfigSchemas } from '@core/ConfigManager';
import { PlayerSystem } from '@gameplay/PlayerSystem';
import { CombatSystem } from '@gameplay/CombatSystem';
import { ENEMY_DEFINITIONS } from '@gameplay/enemyCatalog';
import gameplayConfigJson from '@data/gameplay.config.json';

const gameplayConfig = ConfigSchemas.gameplay.parse(gameplayConfigJson);

interface DuelResult {
  enemy: string;
  level: number;
  outcome: 'victory' | 'death' | 'timeout';
  ttk: number;
  damageDealt: number;
  damageTaken: number;
  hits: number;
  playerHealth: number;
  enemyHealth: number;
}

const createDuel = async (
  level: number
): Promise<{
  bus: EventBus;
  player: PlayerSystem;
  combat: CombatSystem;
}> => {
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
  for (let index = 1; index < level; index++) {
    bus.emitSync('player:grantLevel', {});
  }

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
      ['playerSystem', player],
    ]),
  });

  return { bus, player, combat };
};

const runDuel = async (enemyType: string, level: number): Promise<DuelResult> => {
  const { bus, player, combat } = await createDuel(level);
  player.setPosition(0, 0);

  let damageDealt = 0;
  let damageTaken = 0;
  let hits = 0;
  let playerDead = false;

  bus.on('combat:damage', (data: any) => {
    if (data?.sourceId === 'player') {
      damageDealt += Number(data.amount) || 0;
      hits++;
    }
  });
  bus.on('player:damage', (data: any) => {
    damageTaken += Number(data.amount) || 0;
  });
  bus.on('player:death', () => {
    playerDead = true;
  });

  bus.emitSync('entity:spawn', { type: enemyType, x: 80, y: 0, properties: {} });
  const enemy = Array.from(combat.getEntities().values())[0];
  if (!enemy) {
    throw new Error(`enemy did not spawn: ${enemyType}`);
  }

  const delta = 1 / 60;
  let outcome: DuelResult['outcome'] = 'timeout';
  let ttk = 0;

  for (let step = 0; step < 1800; step++) {
    const distance = Math.hypot(
      enemy.position.x - player.getState().position.x,
      enemy.position.y - player.getState().position.y
    );
    // Stationary DPS check: attack only when the facing cone can reach.
    if (distance <= gameplayConfig.combat.meleeOffset + gameplayConfig.combat.meleeRange) {
      bus.emitSync('player:attack', {});
    }

    player.update(delta);
    combat.update(delta);
    ttk = (step + 1) * delta;

    if (!enemy.state.alive) {
      outcome = 'victory';
      break;
    }
    if (playerDead) {
      outcome = 'death';
      break;
    }
  }

  return {
    enemy: enemyType,
    level,
    outcome,
    ttk,
    damageDealt,
    damageTaken,
    hits,
    playerHealth: player.getStats().health,
    enemyHealth: enemy.stats.health,
  };
};

describe('balance duels', () => {
  it('lets a level-1 player beat a scavenger', async () => {
    const result = await runDuel('scavenger', 1);
    expect(result.outcome).toBe('victory');
    expect(result.ttk).toBeGreaterThan(0);
    expect(result.hits).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and loadout', async () => {
    const first = await runDuel('scavenger', 1);
    const second = await runDuel('scavenger', 1);
    expect(second).toEqual(first);
  });

  it('does not let a level-1 player kill the Keeper in 30 simulated seconds', async () => {
    const result = await runDuel('keeper', 1);
    expect(result.outcome).not.toBe('victory');
  });

  it('can print a balance matrix when BALANCE_REPORT=1', async () => {
    if (process.env.BALANCE_REPORT !== '1') return;

    const rows: DuelResult[] = [];
    for (const level of [1, 5, 10]) {
      for (const definition of ENEMY_DEFINITIONS) {
        rows.push(await runDuel(definition.type, level));
      }
    }

    console.table(
      rows.map((row) => ({
        enemy: row.enemy,
        level: row.level,
        outcome: row.outcome,
        ttk: row.ttk.toFixed(2),
        damageDealt: row.damageDealt,
        damageTaken: row.damageTaken,
        hits: row.hits,
      }))
    );
    expect(rows).toHaveLength(ENEMY_DEFINITIONS.length * 3);
  });
});
