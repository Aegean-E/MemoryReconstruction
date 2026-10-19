/**
 * Audio System - Adaptive audio with spatial support
 *
 * Implements vertical layering for adaptive music,
 * spatial audio for SFX, and high-quality playback.
 */

import type { EventBus } from '@core/EventBus';
import { GameEvents } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import type { AudioConfig } from '@core/ConfigManager';
import type { AssetManager } from '@engine/AssetManager';

export interface AudioLayer {
  name: string;
  gainNode: GainNode;
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  volume: number;
  loop: boolean;
  playing: boolean;
}

export interface SpatialSound {
  id: string;
  source: AudioBufferSourceNode;
  panner: PannerNode;
  gain: GainNode;
  position: { x: number; y: number; z: number };
}

export class AudioSystem implements IGameModule {
  readonly name = 'audioSystem';
  readonly version = '1.0.0';
  readonly dependencies = ['assetManager'];
  readonly tokenBudget = 2000;

  private eventBus: EventBus;
  private config: AudioConfig;
  private assetManager!: AssetManager;

  // Web Audio API
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;

  // Music layers (vertical layering)
  private musicLayers = new Map<string, AudioLayer>();
  private currentMusicTheme = '';
  private targetIntensity = 0;
  private currentIntensity = 0;
  private crossfadeDuration = 2.0;

  // SFX
  private sfxPool: AudioBufferSourceNode[] = [];
  private maxSfxChannels = 32;

  // Spatial audio
  private spatialSounds = new Map<string, SpatialSound>();
  private listenerPosition = { x: 0, y: 0, z: 0 };

  // State
  private muted = false;
  private suspended = false;

  constructor(eventBus: EventBus, config: AudioConfig) {
    this.eventBus = eventBus;
    this.config = config;
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.assetManager = context.sharedState.get('assetManager');

    // Create audio context
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.config.sampleRate,
    });

    // Create gain nodes
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.config.masterVolume;
    this.masterGain.connect(this.audioContext.destination);

    this.musicGain = this.audioContext.createGain();
    this.musicGain.gain.value = this.config.musicVolume;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.audioContext.createGain();
    this.sfxGain.gain.value = this.config.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    this.voiceGain = this.audioContext.createGain();
    this.voiceGain.gain.value = this.config.voiceVolume;
    this.voiceGain.connect(this.masterGain);

    // Setup listener for spatial audio
    if (this.config.spatialAudio.enabled) {
      this.setupListener();
    }

    // Setup event listeners
    this.setupEventListeners();

    // Handle auto-suspend/resume
    this.setupAutoResume();

    this.eventBus.emit('audioSystem:ready', {});
  }

  private setupListener(): void {
    if (!this.audioContext) return;

    const listener = this.audioContext.listener;
    listener.positionX.value = this.listenerPosition.x;
    listener.positionY.value = this.listenerPosition.y;
    listener.positionZ.value = this.listenerPosition.z;
  }

  private setupAutoResume(): void {
    const resume = async () => {
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };

    document.addEventListener('click', resume);
    document.addEventListener('keydown', resume);
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.AUDIO_PLAY_SFX, (data: any) => this.playSfx(data));
    this.eventBus.on(GameEvents.AUDIO_PLAY_MUSIC, (data: any) => this.playMusic(data));
    this.eventBus.on(GameEvents.AUDIO_STOP_MUSIC, (data: any) => this.stopMusic(data));
    this.eventBus.on(GameEvents.AUDIO_SET_VOLUME, (data: any) => this.setVolume(data));
    this.eventBus.on('audio:spatial', (data: any) => this.playSpatial(data));
    this.eventBus.on('audio:setIntensity', (data: any) => this.setIntensity(data));
    this.eventBus.on('camera:move', (data: any) => this.updateListener(data));
  }

  // Music System (Adaptive/Vertical Layering)

  /**
   * Play adaptive music with vertical layering
   */
  async playMusic(data: {
    theme: string;
    intensity?: number;
    crossfade?: number;
    layers?: string[];
  }): Promise<void> {
    if (!this.audioContext || !this.musicGain) return;

    // Stop current music if different theme
    if (this.currentMusicTheme && this.currentMusicTheme !== data.theme) {
      await this.stopMusic({ crossfade: data.crossfade ?? this.crossfadeDuration });
    }

    this.currentMusicTheme = data.theme;
    this.targetIntensity = data.intensity ?? 1.0;
    this.crossfadeDuration = data.crossfade ?? this.config.adaptiveMusic.crossfadeDuration;

    // Load and start layers
    const layers = data.layers ?? this.getDefaultLayers(data.theme);

    for (const layerName of layers) {
      await this.startMusicLayer(layerName);
    }

    // Update intensity
    this.updateMusicIntensity();
  }

  private getDefaultLayers(theme: string): string[] {
    // Default layer configuration per theme
    const themes: Record<string, string[]> = {
      exploration: ['ambient', 'melody', 'percussion'],
      combat: ['ambient', 'melody', 'percussion', 'intensity'],
      boss: ['ambient', 'melody', 'percussion', 'intensity', 'choir'],
      menu: ['ambient', 'melody'],
      victory: ['fanfare', 'ambient'],
    };
    return themes[theme] ?? ['ambient', 'melody'];
  }

  private async startMusicLayer(layerName: string): Promise<void> {
    if (!this.audioContext || !this.musicGain) return;

    const buffer = await this.loadAudioBuffer(`music/${this.currentMusicTheme}/${layerName}`);
    if (!buffer) return;

    const layerGain = this.audioContext.createGain();
    layerGain.gain.value = 0;
    layerGain.connect(this.musicGain);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(layerGain);
    source.start(0);

    const layer: AudioLayer = {
      name: layerName,
      gainNode: layerGain,
      source,
      buffer,
      volume: this.getLayerBaseVolume(layerName),
      loop: true,
      playing: true,
    };

    this.musicLayers.set(layerName, layer);
  }

  private getLayerBaseVolume(layerName: string): number {
    const volumes: Record<string, number> = {
      ambient: 0.4,
      melody: 0.6,
      percussion: 0.5,
      intensity: 0.7,
      choir: 0.3,
      fanfare: 0.8,
    };
    return volumes[layerName] ?? 0.5;
  }

  private updateMusicIntensity(): void {
    if (!this.audioContext) return;

    // Smooth intensity transition
    const delta = (this.targetIntensity - this.currentIntensity) * 0.02;
    this.currentIntensity += delta;

    // Update layer volumes based on intensity
    for (const [name, layer] of this.musicLayers) {
      if (!layer.playing) continue;

      let targetVolume = layer.volume;

      // Intensity-reactive layers
      if (name === 'intensity' || name === 'percussion') {
        targetVolume *= this.currentIntensity;
      } else if (name === 'ambient') {
        targetVolume *= 1 - this.currentIntensity * 0.3;
      }

      // Smooth volume change
      const currentVol = layer.gainNode.gain.value;
      layer.gainNode.gain.value += (targetVolume - currentVol) * 0.05;
    }
  }

  async stopMusic(data: { crossfade?: number } = {}): Promise<void> {
    const crossfade = data.crossfade ?? this.crossfadeDuration;

    for (const [name, layer] of this.musicLayers) {
      if (!layer.playing) continue;

      layer.playing = false;

      // Fade out
      const startVol = layer.gainNode.gain.value;
      const startTime = this.audioContext!.currentTime;

      layer.gainNode.gain.setValueAtTime(startVol, startTime);
      layer.gainNode.gain.linearRampToValueAtTime(0, startTime + crossfade);

      // Stop after fade
      setTimeout(() => {
        layer.source?.stop();
        layer.source?.disconnect();
        layer.gainNode.disconnect();
        this.musicLayers.delete(name);
      }, crossfade * 1000);
    }

    this.currentMusicTheme = '';
    this.targetIntensity = 0;
  }

  setIntensity(data: { intensity: number }): void {
    this.targetIntensity = Math.max(0, Math.min(1, data.intensity));
  }

  // SFX System

  async playSfx(data: {
    name: string;
    volume?: number;
    pitch?: number;
    loop?: boolean;
    spatial?: boolean;
    position?: { x: number; y: number; z: number };
  }): Promise<void> {
    if (!this.audioContext || !this.sfxGain) return;

    const buffer = await this.loadAudioBuffer(`sfx/${data.name}`);
    if (!buffer) {
      console.warn(`[AudioSystem] SFX not found: ${data.name}`);
      return;
    }

    if (data.spatial && this.config.spatialAudio.enabled) {
      this.playSpatialSfx(buffer, data);
    } else {
      this.playRegularSfx(buffer, data);
    }
  }

  private playRegularSfx(buffer: AudioBuffer, data: any): void {
    if (!this.audioContext || !this.sfxGain) return;

    // Get or create source
    let source = this.sfxPool.pop() || this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = data.pitch ?? 1;
    source.loop = data.loop ?? false;

    const gain = this.audioContext.createGain();
    gain.gain.value = (data.volume ?? 1) * this.config.sfxVolume;
    gain.connect(this.sfxGain);

    source.connect(gain);
    source.start(0);

    // Return to pool when done
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.sfxPool.length < this.maxSfxChannels) {
        this.sfxPool.push(source);
      }
    };
  }

  private playSpatialSfx(buffer: AudioBuffer, data: any): void {
    if (!this.audioContext || !this.sfxGain) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = data.pitch ?? 1;

    const panner = this.audioContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'exponential';
    panner.rolloffFactor = this.config.spatialAudio.rolloffFactor;
    panner.maxDistance = this.config.spatialAudio.maxDistance;
    panner.refDistance = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0;

    const position = data.position ?? { x: 0, y: 0, z: 0 };
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const gain = this.audioContext.createGain();
    gain.gain.value = (data.volume ?? 1) * this.config.sfxVolume;

    source.connect(panner).connect(gain).connect(this.sfxGain);
    source.start(0);

    // Cleanup
    source.onended = () => {
      source.disconnect();
      panner.disconnect();
      gain.disconnect();
    };
  }

  async playSpatial(data: {
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    volume?: number;
    loop?: boolean;
  }): Promise<void> {
    if (!this.audioContext || !this.sfxGain) return;

    const buffer = await this.loadAudioBuffer(`sfx/${data.name}`);
    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = data.loop ?? false;

    const panner = this.audioContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'exponential';
    panner.rolloffFactor = this.config.spatialAudio.rolloffFactor;
    panner.maxDistance = this.config.spatialAudio.maxDistance;

    const gain = this.audioContext.createGain();
    gain.gain.value = (data.volume ?? 1) * this.config.sfxVolume;

    source.connect(panner).connect(gain).connect(this.sfxGain);
    source.start(0);

    const spatialSound: SpatialSound = {
      id: data.id,
      source,
      panner,
      gain,
      position: data.position,
    };

    this.spatialSounds.set(data.id, spatialSound);
    this.updateSpatialPosition(data.id, data.position);
  }

  updateSpatialPosition(id: string, position: { x: number; y: number; z: number }): void {
    const sound = this.spatialSounds.get(id);
    if (sound) {
      sound.position = position;
      sound.panner.positionX.value = position.x;
      sound.panner.positionY.value = position.y;
      sound.panner.positionZ.value = position.z;
    }
  }

  stopSpatial(id: string): void {
    const sound = this.spatialSounds.get(id);
    if (sound) {
      sound.source.stop();
      sound.source.disconnect();
      sound.panner.disconnect();
      sound.gain.disconnect();
      this.spatialSounds.delete(id);
    }
  }

  private updateListener(data: { x: number; y: number }): void {
    if (!this.audioContext) return;

    this.listenerPosition.x = data.x;
    this.listenerPosition.y = data.y;

    const listener = this.audioContext.listener;
    listener.positionX.value = data.x;
    listener.positionY.value = data.y;
  }

  // Volume Control

  setVolume(data: { type: 'master' | 'music' | 'sfx' | 'voice'; volume: number }): void {
    const volume = Math.max(0, Math.min(1, data.volume));

    switch (data.type) {
      case 'master':
        this.config.masterVolume = volume;
        this.masterGain!.gain.value = volume;
        break;
      case 'music':
        this.config.musicVolume = volume;
        this.musicGain!.gain.value = volume;
        break;
      case 'sfx':
        this.config.sfxVolume = volume;
        this.sfxGain!.gain.value = volume;
        break;
      case 'voice':
        this.config.voiceVolume = volume;
        this.voiceGain!.gain.value = volume;
        break;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.config.masterVolume;
    }
  }

  // Asset Loading

  private async loadAudioBuffer(path: string): Promise<AudioBuffer | null> {
    if (!this.audioContext) return null;

    // Check cache first
    const cached = this.assetManager.get(path);
    if (cached instanceof AudioBuffer) return cached;

    try {
      const arrayBuffer = this.assetManager.get(path)!;
      if (!arrayBuffer) {
        // Try to load from network
        const response = await fetch(`/assets/audio/${path}.ogg`);
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        return this.decodeAudioData(buffer);
      }
      return this.decodeAudioData(arrayBuffer as ArrayBuffer);
    } catch (err) {
      console.error(`[AudioSystem] Failed to load audio: ${path}`, err);
      return null;
    }
  }

  private decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      this.audioContext!.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });
  }

  pauseAll(): void {
    this.audioContext?.suspend();
    this.suspended = true;
  }

  resumeAll(): void {
    this.audioContext?.resume();
    this.suspended = false;
  }

  update(_deltaTime: number): void {
    this.updateMusicIntensity();
  }

  async shutdown(): Promise<void> {
    // Stop all sounds
    for (const layer of this.musicLayers.values()) {
      layer.source?.stop();
      layer.source?.disconnect();
      layer.gainNode.disconnect();
    }
    this.musicLayers.clear();

    for (const sound of this.spatialSounds.values()) {
      sound.source.stop();
      sound.source.disconnect();
      sound.panner.disconnect();
      sound.gain.disconnect();
    }
    this.spatialSounds.clear();

    // Close audio context
    await this.audioContext?.close();
    this.audioContext = null;
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        config: this.config,
        currentMusicTheme: this.currentMusicTheme,
        targetIntensity: this.targetIntensity,
        currentIntensity: this.currentIntensity,
        muted: this.muted,
        musicLayers: Array.from(this.musicLayers.entries()).map(([name, layer]) => [
          name,
          { name, volume: layer.volume, playing: layer.playing },
        ]),
      },
      checksum: 'audio',
    };
  }

  deserialize(state: ModuleState): void {
    if (state.data.config) this.config = { ...this.config, ...state.data.config };
    if (state.data.currentMusicTheme) this.currentMusicTheme = state.data.currentMusicTheme;
    if (state.data.targetIntensity !== undefined) this.targetIntensity = state.data.targetIntensity;
    if (state.data.currentIntensity !== undefined)
      this.currentIntensity = state.data.currentIntensity;
    if (state.data.muted !== undefined) this.setMuted(state.data.muted);
  }

  // Debug
  getState() {
    return {
      musicLayers: Array.from(this.musicLayers.keys()),
      currentTheme: this.currentMusicTheme,
      intensity: this.currentIntensity,
      targetIntensity: this.targetIntensity,
      spatialSounds: this.spatialSounds.size,
      contextState: this.audioContext?.state,
    };
  }
}
