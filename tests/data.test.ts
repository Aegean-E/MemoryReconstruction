import { describe, expect, it } from 'vitest';
import { ConfigSchemas } from '@core/ConfigManager';
import enemiesJson from '@data/enemies.json';
import itemsJson from '@data/items.json';
import gameplayConfigJson from '@data/gameplay.config.json';

const items = Object.values(itemsJson as Record<string, any[]>).flat();
const itemIds = new Set(items.map((item) => item.id));
const enemies = (enemiesJson as any).enemies as any[];
const eliteModifiers = (enemiesJson as any).eliteModifiers as any[];

const statKeys = [
  'health',
  'maxHealth',
  'damage',
  'speed',
  'armor',
  'resistance',
  'knockbackResistance',
  'xpValue',
  'memoryValue',
];

describe('content data integrity', () => {
  it('has unique enemy ids and types', () => {
    expect(new Set(enemies.map((enemy) => enemy.id)).size).toBe(enemies.length);
    expect(new Set(enemies.map((enemy) => enemy.type)).size).toBe(enemies.length);
  });

  it('gives every enemy finite, non-negative stats and ranges', () => {
    for (const enemy of enemies) {
      for (const key of statKeys) {
        expect(Number.isFinite(enemy.stats[key]), `${enemy.type}.${key}`).toBe(true);
        expect(enemy.stats[key], `${enemy.type}.${key}`).toBeGreaterThanOrEqual(0);
      }
      expect(enemy.stats.maxHealth).toBeGreaterThan(0);
      expect(enemy.ai.aggroRange).toBeGreaterThan(0);
      expect(enemy.ai.attackRange).toBeGreaterThan(0);
      expect(enemy.ai.attackCooldown).toBeGreaterThan(0);
      expect(enemy.hitbox.width).toBeGreaterThan(0);
      expect(enemy.hitbox.height).toBeGreaterThan(0);
    }
  });

  it('resolves every loot row and keeps quantities legal', () => {
    for (const enemy of enemies) {
      for (const row of enemy.lootTable ?? []) {
        expect(itemIds.has(row.item), `${enemy.type} -> ${row.item}`).toBe(true);
        expect(row.chance).toBeGreaterThanOrEqual(0);
        expect(row.chance).toBeLessThanOrEqual(1);
        expect(row.min).toBeGreaterThanOrEqual(1);
        expect(row.max).toBeGreaterThanOrEqual(row.min);
      }
    }
  });

  it('orders boss phases from highest to lowest health threshold', () => {
    for (const enemy of enemies) {
      const phases = enemy.phases ?? [];
      for (let index = 0; index < phases.length; index++) {
        const threshold = phases[index].healthThreshold;
        expect(threshold).toBeGreaterThan(0);
        expect(threshold).toBeLessThan(1);
        if (index > 0) {
          expect(threshold).toBeLessThan(phases[index - 1].healthThreshold);
        }
      }
    }
  });

  it('keeps elite modifiers numeric and bounded', () => {
    expect(eliteModifiers.length).toBeGreaterThan(0);
    for (const elite of eliteModifiers) {
      expect(typeof elite.name).toBe('string');
      expect(elite.chance).toBeGreaterThanOrEqual(0);
      expect(elite.chance).toBeLessThanOrEqual(1);
      expect(elite.healthMult).toBeGreaterThan(0);
      expect(elite.damageMult).toBeGreaterThan(0);
      expect(elite.xpMult).toBeGreaterThan(0);
      expect(Number.isInteger(elite.color)).toBe(true);
    }
  });

  it('has unique, stackable item definitions', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) {
      expect(typeof item.name).toBe('string');
      expect(item.maxStack).toBeGreaterThanOrEqual(1);
      expect(item.stats && typeof item.stats).toBe('object');
    }
  });

  it('parses the gameplay config and the new tuning defaults', () => {
    const config = ConfigSchemas.gameplay.parse(gameplayConfigJson);
    expect(config.combat.eliteMinDepth).toBeGreaterThanOrEqual(0);
    expect(config.roguelike.deathXpLoss).toBeGreaterThanOrEqual(0);
    expect(config.roguelike.deathXpLoss).toBeLessThanOrEqual(1);
  });
});
