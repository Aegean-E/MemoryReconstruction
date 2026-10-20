import { describe, expect, it } from 'vitest';
import { resolveTileColor } from '@gameplay/tileColors';
import type { BiomeConfig, TileData } from '@gameplay/WorldSystem';

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
