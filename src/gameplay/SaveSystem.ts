/**
 * Save System - Local persistence for GameState and progression
 *
 * Implements persistent save/load capabilities using Web Storage (localStorage),
 * coordinating with GameApplication and ModuleRegistry for deterministic serialization.
 */

import type { EventBus } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';

export const SAVE_KEY_V1 = 'memory_reconstruction_save_v1';
export const SETTINGS_KEY_V1 = 'memory_reconstruction_settings_v1';

export interface SaveMetadata {
  level: number;
  fragments: number;
  playTime: string;
  date: string;
  seed: number;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  bloom: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 80,
  musicVolume: 70,
  sfxVolume: 80,
  screenShake: true,
  bloom: true,
};

export class SaveSystem implements IGameModule {
  readonly name = 'saveSystem';
  readonly version = '1.0.0';
  readonly dependencies: string[] = [];
  readonly tokenBudget = 1000;

  private eventBus: EventBus;
  private storage: Storage | null;
  private gameApp: any = null;

  constructor(eventBus: EventBus, storage?: Storage) {
    this.eventBus = eventBus;
    this.storage =
      storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.gameApp = context.sharedState.get('gameApplication');

    this.eventBus.on('game:save', () => {
      this.saveGame();
    });
    this.eventBus.on('game:load', () => {
      void this.loadGame();
    });
    this.eventBus.on('game:deleteSave', () => {
      this.deleteSave();
    });

    this.eventBus.emit('saveSystem:ready', { hasSave: this.hasSave() });
  }

  setGameApp(gameApp: any): void {
    this.gameApp = gameApp;
  }

  hasSave(): boolean {
    if (!this.storage) return false;
    try {
      return this.storage.getItem(SAVE_KEY_V1) !== null;
    } catch {
      return false;
    }
  }

  getSaveMetadata(): SaveMetadata | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(SAVE_KEY_V1);
      if (!raw) return null;
      const state = JSON.parse(raw);

      const playerProg = state?.modules?.playerSystem?.data?.progression ?? {};
      const level = playerProg.level ?? 1;
      const fragments = playerProg.memoryFragments ?? 0;
      const seconds = Math.floor(state.playTime ?? 0);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      const playTime = `${minutes}m ${remainingSeconds}s`;
      const date = state.timestamp ? new Date(state.timestamp).toLocaleString() : 'Unknown';

      return {
        level,
        fragments,
        playTime,
        date,
        seed: state.seed ?? 0,
      };
    } catch {
      return null;
    }
  }

  saveGame(): { success: boolean; timestamp: number; error?: string } {
    if (!this.storage) {
      return { success: false, timestamp: 0, error: 'Storage unavailable' };
    }
    if (!this.gameApp || typeof this.gameApp.serialize !== 'function') {
      return { success: false, timestamp: 0, error: 'GameApplication not ready' };
    }

    try {
      const state = this.gameApp.serialize();
      const payload = JSON.stringify(state);
      this.storage.setItem(SAVE_KEY_V1, payload);

      this.eventBus.emit('game:saved', {
        timestamp: state.timestamp,
        metadata: this.getSaveMetadata(),
      });

      return { success: true, timestamp: state.timestamp };
    } catch (err: any) {
      console.error('[SaveSystem] Save failed:', err);
      return { success: false, timestamp: 0, error: err.message };
    }
  }

  async loadGame(): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.storage) {
      return { success: false, error: 'Storage unavailable' };
    }
    if (!this.gameApp || typeof this.gameApp.deserialize !== 'function') {
      return { success: false, error: 'GameApplication not ready' };
    }

    try {
      const raw = this.storage.getItem(SAVE_KEY_V1);
      if (!raw) return { success: false, error: 'No save found' };

      const state = JSON.parse(raw);
      await this.gameApp.deserialize(state);

      this.eventBus.emit('game:loaded', {
        timestamp: state.timestamp,
        metadata: this.getSaveMetadata(),
      });

      return { success: true, data: state };
    } catch (err: any) {
      console.error('[SaveSystem] Load failed:', err);
      return { success: false, error: err.message };
    }
  }

  deleteSave(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.removeItem(SAVE_KEY_V1);
      this.eventBus.emit('game:saveDeleted', {});
      return true;
    } catch {
      return false;
    }
  }

  // Settings persistence
  loadSettings(): GameSettings {
    if (!this.storage) return { ...DEFAULT_SETTINGS };
    try {
      const raw = this.storage.getItem(SETTINGS_KEY_V1);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: Partial<GameSettings>): void {
    if (!this.storage) return;
    try {
      const current = this.loadSettings();
      const updated = { ...current, ...settings };
      this.storage.setItem(SETTINGS_KEY_V1, JSON.stringify(updated));
      this.eventBus.emit('settings:updated', updated);
    } catch (err) {
      console.warn('[SaveSystem] Failed to save settings:', err);
    }
  }

  update(_deltaTime: number): void {
    void _deltaTime;
  }

  async shutdown(): Promise<void> {
    await Promise.resolve();
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        hasSave: this.hasSave(),
        metadata: this.getSaveMetadata(),
      },
      checksum: 'saveSystem',
    };
  }

  deserialize(_state: ModuleState): void {
    void _state;
  }
}
