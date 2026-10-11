/**
 * Memory Reconstruction - Main Entry Point
 * 
 * This is the primary entry point for the game. It initializes all core systems,
 * sets up the game loop, and manages the application lifecycle.
 * 
 * AI COMPATIBILITY: This file is designed to be readable by any AI agent.
 * All initialization is explicit and follows the module contract.
 */

import { GameApplication } from '@core/GameApplication';
import { ModuleRegistry } from '@core/ModuleRegistry';
import { EventBus } from '@core/EventBus';
import { ConfigManager } from '@core/ConfigManager';
import { AssetManager } from '@engine/AssetManager';
import { RenderSystem } from '@graphics/RenderSystem';
import { InputSystem } from '@engine/InputSystem';
import { AudioSystem } from '@audio/AudioSystem';
import { WorldSystem } from '@gameplay/WorldSystem';
import { PlayerSystem } from '@gameplay/PlayerSystem';
import { CombatSystem } from '@gameplay/CombatSystem';
import { AISystem } from '@ai/AISystem';
import { TestingHarness } from '@testing/TestingHarness';

// Import configuration
import graphicsConfig from '@assets/data/graphics.config.json';
import audioConfig from '@assets/data/audio.config.json';
import gameplayConfig from '@assets/data/gameplay.config.json';
import aiConfig from '@assets/data/ai.config.json';

/**
 * Main game initialization
 * Follows the module contract for RLM compatibility
 */
async function main(): Promise<void> {
  // Initialize loading screen
  const loadingScreen = document.getElementById('loading-screen')!;
  const loadingProgress = document.getElementById('loading-progress') as HTMLElement;
  const loadingText = document.getElementById('loading-text')!;
  
  const updateLoading = (progress: number, text: string) => {
    loadingProgress.style.width = `${progress}%`;
    loadingText.textContent = text;
  };

  try {
    updateLoading(5, 'Initializing core systems...');
    
    // Create core infrastructure
    const eventBus = new EventBus();
    const configManager = new ConfigManager({
      graphics: graphicsConfig,
      audio: audioConfig,
      gameplay: gameplayConfig,
      ai: aiConfig
    });
    
    // Create module registry (for RLM state management)
    const moduleRegistry = new ModuleRegistry(eventBus);
    
    updateLoading(15, 'Loading assets...');
    
    // Initialize asset manager
    const assetManager = new AssetManager(eventBus);
    await assetManager.initialize();
    
    updateLoading(30, 'Setting up graphics...');
    
    // Initialize render system
    const renderSystem = new RenderSystem(eventBus, configManager.get('graphics'));
    await renderSystem.initialize();
    
    updateLoading(45, 'Initializing audio...');
    
    // Initialize audio system
    const audioSystem = new AudioSystem(eventBus, configManager.get('audio'));
    await audioSystem.initialize();
    
    updateLoading(55, 'Setting up input...');
    
    // Initialize input system
    const inputSystem = new InputSystem(eventBus);
    await inputSystem.initialize();
    
    updateLoading(65, 'Creating world...');
    
    // Initialize gameplay systems
    const worldSystem = new WorldSystem(eventBus, configManager.get('gameplay'));
    await worldSystem.initialize();
    
    const playerSystem = new PlayerSystem(eventBus, configManager.get('gameplay'));
    await playerSystem.initialize();
    
    const combatSystem = new CombatSystem(eventBus, configManager.get('gameplay'));
    await combatSystem.initialize();
    
    updateLoading(80, 'Initializing AI layer...');
    
    // Initialize AI system (for RLM compatibility and testing)
    const aiSystem = new AISystem(eventBus, configManager.get('ai'));
    await aiSystem.initialize();
    
    updateLoading(90, 'Setting up testing harness...');
    
    // Initialize testing harness (for AI testability)
    const testingHarness = new TestingHarness(eventBus, moduleRegistry);
    await testingHarness.initialize();
    
    updateLoading(95, 'Registering modules...');
    
    // Register all modules for RLM state management
    moduleRegistry.register('render', renderSystem);
    moduleRegistry.register('audio', audioSystem);
    moduleRegistry.register('input', inputSystem);
    moduleRegistry.register('world', worldSystem);
    moduleRegistry.register('player', playerSystem);
    moduleRegistry.register('combat', combatSystem);
    moduleRegistry.register('ai', aiSystem);
    moduleRegistry.register('testing', testingHarness);
    
    updateLoading(100, 'Starting game...');
    
    // Create and start the game application
    const game = new GameApplication({
      eventBus,
      configManager,
      moduleRegistry,
      assetManager,
      renderSystem,
      inputSystem,
      audioSystem,
      worldSystem,
      playerSystem,
      combatSystem,
      aiSystem,
      testingHarness
    });
    
    // Hide loading screen
    loadingScreen.classList.add('hidden');
    
    // Start the game loop
    await game.start();
    
    // Expose for debugging and AI access
    (window as any).__GAME__ = game;
    (window as any).__MODULE_REGISTRY__ = moduleRegistry;
    (window as any).__TESTING_HARNESS__ = testingHarness;
    
    console.log('[Game] Memory Reconstruction initialized successfully');
    console.log('[Game] AI Testing Harness available at window.__TESTING_HARNESS__');
    console.log('[Game] Module Registry available at window.__MODULE_REGISTRY__');
    
  } catch (error) {
    console.error('[Game] Failed to initialize:', error);
    loadingText.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    loadingText.style.color = '#ff4444';
  }
}

// Start the game
main();

/**
 * RLM STATE EXPORT
 * This allows the entire game state to be serialized for RLM context management
 */
export function exportGameState(): string {
  const game = (window as any).__GAME__;
  if (!game) return '{}';
  return JSON.stringify(game.serialize(), null, 2);
}

/**
 * RLM STATE IMPORT
 * Restore game from serialized state
 */
export async function importGameState(stateJson: string): Promise<void> {
  const game = (window as any).__GAME__;
  if (!game) throw new Error('Game not initialized');
  const state = JSON.parse(stateJson);
  await game.deserialize(state);
}