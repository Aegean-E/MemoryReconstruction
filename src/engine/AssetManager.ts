/**
 * Asset Manager - Centralized asset loading and caching
 *
 * Handles textures, audio, shaders, and data files with
 * progress tracking for loading screens.
 */

import type { EventBus } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import { resolveAssetUrl } from '@utils/assetUrl';

export interface AssetManifest {
  textures: Record<string, string>;
  audio: Record<string, string>;
  shaders: Record<string, string>;
  data: Record<string, string>;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  currentAsset: string;
  percentage: number;
}

export class AssetManager implements IGameModule {
  readonly name = 'assetManager';
  readonly version = '1.0.0';
  readonly dependencies: string[] = [];
  readonly tokenBudget = 1000; // aikit:allow-secret

  private eventBus: EventBus;
  private manifest: AssetManifest = { textures: {}, audio: {}, shaders: {}, data: {} };
  private cache = new Map<string, any>();
  private loadingPromises = new Map<string, Promise<any>>();
  private loadQueue: Array<{ key: string; url: string; type: string }> = [];
  private loading = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async initialize(_context?: ModuleContext): Promise<void> {
    // Load manifest
    await this.loadManifest();

    this.eventBus.emit('assetManager:ready', { manifest: this.manifest });
  }

  async loadManifest(): Promise<void> {
    try {
      const response = await fetch(resolveAssetUrl('manifest.json'));
      if (response.ok) {
        this.manifest = await response.json();
      } else {
        console.warn('[AssetManager] No manifest found, using empty');
      }
    } catch {
      console.warn('[AssetManager] Failed to load manifest');
    }
  }

  /**
   * Load all assets with progress tracking
   */
  async loadAll(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    const allAssets = [
      ...Object.entries(this.manifest.textures).map(([key, url]) => ({
        key,
        url,
        type: 'texture',
      })),
      ...Object.entries(this.manifest.audio).map(([key, url]) => ({ key, url, type: 'audio' })),
      ...Object.entries(this.manifest.shaders).map(([key, url]) => ({ key, url, type: 'shader' })),
      ...Object.entries(this.manifest.data).map(([key, url]) => ({ key, url, type: 'data' })),
    ];

    const total = allAssets.length;
    let loaded = 0;

    for (const asset of allAssets) {
      await this.load(asset.key, asset.url, asset.type as 'texture' | 'audio' | 'shader' | 'data');
      loaded++;
      onProgress?.({
        loaded,
        total,
        currentAsset: asset.key,
        percentage: (loaded / total) * 100,
      });
      this.eventBus.emit('asset:loadProgress', { loaded, total, current: asset.key });
    }
  }

  /**
   * Load a single asset
   */
  async load(
    key: string,
    url: string,
    type: 'texture' | 'audio' | 'shader' | 'data'
  ): Promise<any> {
    // Return cached
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Return existing promise
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key);
    }

    const promise = this.loadAsset(key, url, type);
    this.loadingPromises.set(key, promise);

    try {
      const result = await promise;
      this.cache.set(key, result);
      this.loadingPromises.delete(key);
      this.eventBus.emit('asset:loaded', { key, type });
      return result;
    } catch (error) {
      this.loadingPromises.delete(key);
      this.eventBus.emit('asset:error', { key, type, error });
      throw error;
    }
  }

  private async loadAsset(key: string, url: string, type: string): Promise<any> {
    const response = await fetch(resolveAssetUrl(url));
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);

    switch (type) {
      case 'texture': {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
      case 'audio': {
        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
      }
      case 'shader': {
        return response.text();
      }
      case 'data': {
        return response.json();
      }
      default:
        throw new Error(`Unknown asset type: ${type}`);
    }
  }

  /**
   * Get cached asset
   */
  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }

  /**
   * Check if asset is loaded
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Preload asset (fire and forget)
   */
  preload(key: string, url: string, type: 'texture' | 'audio' | 'shader' | 'data'): void {
    this.load(key, url, type).catch((err) =>
      console.warn(`[AssetManager] Preload failed for ${key}:`, err)
    );
  }

  /**
   * Release asset from cache
   */
  release(key: string): boolean {
    const asset = this.cache.get(key);
    if (asset && typeof asset === 'string' && asset.startsWith('blob:')) {
      URL.revokeObjectURL(asset);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all assets
   */
  clear(): void {
    for (const asset of this.cache.values()) {
      if (typeof asset === 'string' && asset.startsWith('blob:')) {
        URL.revokeObjectURL(asset);
      }
    }
    this.cache.clear();
  }

  update(_deltaTime: number): void {
    // No per-frame update needed
  }

  async shutdown(): Promise<void> {
    this.clear();
    this.loadingPromises.clear();
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        manifest: this.manifest,
        cachedKeys: Array.from(this.cache.keys()), // aikit:allow-secret
      },
      checksum: this.computeChecksum(),
    };
  }

  deserialize(state: ModuleState): void {
    this.manifest = state.data.manifest ?? this.manifest;
    // Note: Assets are not serialized, only references
    // They will be reloaded on demand
  }

  private computeChecksum(): string {
    let hash = 0;
    for (const key of this.cache.keys()) {
      for (let i = 0; i < key.length; i++) {
        hash = (hash << 5) - hash + key.charCodeAt(i);
        hash |= 0;
      }
    }
    return hash.toString(16);
  }
}
