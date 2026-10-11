import { test, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

const ASSETS_ROOT = path.resolve(__dirname, '../assets/sprites');

const requiredAssets = [
  'player/idle.png',
  'player/walk.png',
  'player/attack.png',
  'player/dash.png',
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
