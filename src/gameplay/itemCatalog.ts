/**
 * Item Catalog - Authored item lookup for loot drops and inventory rewards.
 *
 * `src/data/items.json` groups items by category. Combat loot tables only carry
 * ids, so this module flattens the categories into one map and exposes the
 * definition a drop needs to become a real inventory item.
 */

import itemsJson from '@data/items.json';

export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'key' | 'memory';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: ItemRarity;
  stats: Record<string, number | string | boolean>;
  maxStack: number;
  abilities?: string[];
}

interface ItemFile {
  weapons: ItemDefinition[];
  armor: ItemDefinition[];
  accessories: ItemDefinition[];
  consumables: ItemDefinition[];
  keys: ItemDefinition[];
  memories: ItemDefinition[];
}

const raw = itemsJson as unknown as ItemFile;

const BY_ID = new Map<string, ItemDefinition>(
  [
    ...raw.weapons,
    ...raw.armor,
    ...raw.accessories,
    ...raw.consumables,
    ...raw.keys,
    ...raw.memories,
  ].map((item) => [item.id, item])
);

export function getItemDefinition(id: string): ItemDefinition | undefined {
  return BY_ID.get(id);
}
