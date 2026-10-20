import type { BiomeConfig, TileData } from './WorldSystem';

export function resolveTileColor(tile: TileData, biome: BiomeConfig): number {
  const colors = biome.colorPalette;
  const variant = Number.isFinite(tile.variant) ? Math.floor(tile.variant) : 0;
  const index = Math.min(Math.max(variant, 0), colors.length - 1);
  return colors[index];
}
