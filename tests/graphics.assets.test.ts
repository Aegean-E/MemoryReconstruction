import { test, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

const ASSETS_ROOT = path.resolve(__dirname, '../assets/graphs');

const requiredAssets = [
  'player/graph1.png',
  'player/graph2.png',
  'player/graph3.png',
  'player/graph4.png',
  'enemies/scavenger.png',
  'enemies/guardian.png',
  'enemies/echo.png',
  'tilesets/ruins.png',
  'tilesets/forest.png',
  'tilesets/caves.png',
  'tilesets/crystal.png',
  'tilesets/void.png',
  'tilesets/sanctuary.png',
  'ui/health.png',
  'ui/mana.png',
  'ui/stamina.png',
  'particles/spark.png',
  'particles/smoke.png',
  'particles/blood.png',
  'particles/magic.png',
];

test('graphics assets exist', async () => {
  for (const rel of requiredAssets) {
    const full = path.join(ASSETS_ROOT, rel);
    await expect(fs.access(full)).resolves.toBeUndefined();
  }
});

test('graphics config exists', async () => {
  const cfg = path.resolve(__dirname, '../assets/data/graphics.config.json');
  const data = await fs.readFile(cfg, 'utf-8');
  const json = JSON.parse(data);
  expect(json).toHaveProperty('resolution');
  expect(json).toHaveProperty('rendering');
  expect(json).toHaveProperty('layers');
});

test('sprite atlas references generated art', async () => {
  const file = path.resolve(__dirname, '../assets/data/sprite_atlas.json');
  const atlas = JSON.parse(await fs.readFile(file, 'utf-8'));

  expect(atlas.version).toBe('2.0.0');
  expect(Object.keys(atlas.enemies)).toHaveLength(13);
  expect(Object.keys(atlas.tilesets)).toHaveLength(6);
  expect(Object.keys(atlas.backgrounds)).toHaveLength(6);

  const references = new Set<string>();
  for (const animation of Object.values<any>(atlas.player.animations)) {
    references.add(animation.texture);
  }
  for (const enemy of Object.values<any>(atlas.enemies)) {
    references.add(enemy.texture);
  }
  for (const tileset of Object.values<any>(atlas.tilesets)) {
    references.add(tileset.texture);
    expect(tileset.rowMap).toHaveProperty('floor');
    expect(tileset.rowMap).toHaveProperty('wall');
    expect(tileset.rowMap).toHaveProperty('hazard');
  }
  for (const group of ['backgrounds', 'props', 'ui', 'particles'] as const) {
    for (const reference of Object.values<string>(atlas[group])) {
      references.add(reference);
    }
  }

  expect(references.size).toBeGreaterThan(40);
  for (const reference of references) {
    await expect(fs.access(path.resolve(__dirname, '../assets', reference))).resolves.toBeUndefined();
  }
});
