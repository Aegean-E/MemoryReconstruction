import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus } from '@core/EventBus';
import { SaveSystem } from '@gameplay/SaveSystem';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('SaveSystem', () => {
  let bus: EventBus;
  let storage: MockStorage;
  let saveSystem: SaveSystem;

  beforeEach(async () => {
    bus = new EventBus();
    storage = new MockStorage();
    saveSystem = new SaveSystem(bus, storage);

    const mockGameApp = {
      serialize: () => ({
        version: '0.1.0',
        timestamp: 1234567890,
        seed: 42,
        running: true,
        paused: false,
        frameCount: 100,
        playTime: 120,
        modules: {
          playerSystem: {
            version: '1.0.0',
            timestamp: 1234567890,
            data: {
              stats: { health: 80, maxHealth: 100 },
              progression: { level: 3, memoryFragments: 15 },
            },
            checksum: 'player',
          },
        },
        rngState: '12345',
      }),
      deserialize: async (_state: any) => {},
    };

    await saveSystem.initialize({
      eventBus: bus,
      config: {},
      sharedState: new Map([['gameApplication', mockGameApp]]),
    });
  });

  it('detects when no save file exists', () => {
    expect(saveSystem.hasSave()).toBe(false);
    expect(saveSystem.getSaveMetadata()).toBeNull();
  });

  it('saves game state and generates readable metadata', () => {
    const result = saveSystem.saveGame();
    expect(result.success).toBe(true);
    expect(saveSystem.hasSave()).toBe(true);

    const meta = saveSystem.getSaveMetadata();
    expect(meta).not.toBeNull();
    expect(meta?.level).toBe(3);
    expect(meta?.fragments).toBe(15);
    expect(meta?.playTime).toContain('2m');
  });

  it('loads saved game state through gameApplication', async () => {
    saveSystem.saveGame();
    let loadedState: any = null;

    saveSystem.setGameApp({
      serialize: () => ({}) as any,
      deserialize: async (state: any) => {
        loadedState = state;
      },
    });

    const result = await saveSystem.loadGame();
    expect(result.success).toBe(true);
    expect(loadedState).not.toBeNull();
    expect(loadedState.seed).toBe(42);
    expect(loadedState.modules.playerSystem.data.progression.level).toBe(3);
  });

  it('deletes existing save', () => {
    saveSystem.saveGame();
    expect(saveSystem.hasSave()).toBe(true);

    saveSystem.deleteSave();
    expect(saveSystem.hasSave()).toBe(false);
  });
});
