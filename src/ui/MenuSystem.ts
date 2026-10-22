/**
 * Menu System - User Interface, Title Screen, Pause Menu, Tutorial, Story & Settings
 *
 * Implements standard Metroidvania HUD & UI overlay adhering to the Memory Light design language:
 * deep indigo backgrounds (#0A0A14, #1F2442), pale gold accents (#FFD98A), and memory cyan highlights (#6FE7FF).
 */

import type { EventBus } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import type { GameApplication } from '@core/GameApplication';
import type { SaveSystem } from '@gameplay/SaveSystem';
import { buildVictorySummary } from './victorySummary';

export class MenuSystem implements IGameModule {
  readonly name = 'menuSystem';
  readonly version = '1.0.0';
  readonly dependencies: string[] = ['saveSystem', 'playerSystem'];
  readonly tokenBudget = 1500;

  private eventBus: EventBus;
  private gameApp: GameApplication | null = null;
  private saveSystem: SaveSystem | null = null;
  private playerSystem: any = null;

  private overlayContainer: HTMLDivElement | null = null;
  private isMenuOpen = false;
  private hasGameStarted = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.gameApp = context.sharedState.get('gameApplication');
    this.saveSystem = context.sharedState.get('saveSystem');
    this.playerSystem = context.sharedState.get('playerSystem');

    this.createDomOverlay();
    this.setupEventListeners();

    // Listen for save/load notifications
    this.eventBus.on('game:saved', () => this.showToast('Run saved successfully!'));
    this.eventBus.on('game:loaded', () => {
      this.showToast('Run loaded!');
      this.closeMenu();
    });
    this.eventBus.on('player:runCompleted', (data: any) => this.showVictory(data));
    this.eventBus.on('player:inventoryChanged', () => this.refreshInventoryIfOpen());
    this.eventBus.on('player:equipmentChanged', () => this.refreshInventoryIfOpen());
    this.eventBus.on('player:runEnded', (data: any) => {
      this.showToast(
        data?.permadeath
          ? 'The run ends here. Your memories return to the void.'
          : `Memory blurred: ${data?.lostXp ?? 0} XP lost.`
      );
    });

    this.eventBus.emit('menuSystem:ready', {});
  }

  private createDomOverlay(): void {
    if (typeof document === 'undefined') return;

    const gameContainer = document.getElementById('game-container') || document.body;

    const existing = document.getElementById('menu-system-root');
    if (existing) existing.remove();

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'menu-system-root';
    this.overlayContainer.innerHTML = `
      <style>
        #menu-system-root {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 200;
          font-family: 'Inter', sans-serif;
          color: #e8e8e8;
        }

        .menu-modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(10, 10, 20, 0.88);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.25s ease, visibility 0.25s ease;
          pointer-events: auto;
        }

        .menu-modal-backdrop.active {
          opacity: 1;
          visibility: visible;
        }

        .menu-card {
          background: linear-gradient(135deg, rgba(31, 36, 66, 0.95) 0%, rgba(15, 17, 34, 0.98) 100%);
          border: 1px solid rgba(111, 231, 255, 0.25);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(111, 231, 255, 0.15);
          border-radius: 8px;
          padding: 2.2rem;
          width: 90%;
          max-width: 480px;
          text-align: center;
        }

        .menu-title {
          font-family: 'Cinzel', serif;
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: 2px;
          background: linear-gradient(90deg, #ffd98a, #6fe7ff, #ffd98a);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 0.3rem;
        }

        .menu-subtitle {
          font-size: 0.85rem;
          color: #a0a6c2;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 1.5rem;
        }

        .menu-save-info {
          background: rgba(111, 231, 255, 0.08);
          border: 1px solid rgba(111, 231, 255, 0.2);
          border-radius: 4px;
          padding: 0.6rem;
          margin-bottom: 1.2rem;
          font-size: 0.8rem;
          color: #b0e5ff;
        }

        .menu-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .menu-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(111, 231, 255, 0.3);
          color: #ffffff;
          padding: 0.75rem 1.2rem;
          font-size: 0.95rem;
          font-weight: 500;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .menu-btn:hover:not(:disabled) {
          background: rgba(111, 231, 255, 0.2);
          border-color: #6fe7ff;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(111, 231, 255, 0.25);
        }

        .menu-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          border-color: rgba(255, 255, 255, 0.1);
        }

        .menu-btn-primary {
          background: linear-gradient(90deg, rgba(255, 217, 138, 0.25), rgba(111, 231, 255, 0.25));
          border-color: #ffd98a;
          color: #fff6df;
        }

        .menu-footer-hint {
          margin-top: 1.4rem;
          font-size: 0.75rem;
          color: #7b829e;
        }

        /* Sub-Modals (Story, Tutorial, Settings) */
        .sub-modal-content {
          text-align: left;
          max-height: 70vh;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .sub-modal-content h3 {
          font-family: 'Cinzel', serif;
          color: #ffd98a;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
          font-size: 1.1rem;
        }

        .sub-modal-content p {
          font-size: 0.9rem;
          line-height: 1.5;
          color: #cdd3ea;
          margin-bottom: 0.8rem;
        }

        .control-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 0.5rem;
          font-size: 0.85rem;
        }

        .control-table th, .control-table td {
          padding: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .control-table th {
          color: #6fe7ff;
          text-align: left;
        }

        .control-badge {
          background: rgba(111, 231, 255, 0.15);
          border: 1px solid rgba(111, 231, 255, 0.35);
          border-radius: 3px;
          padding: 2px 6px;
          font-family: monospace;
          color: #e0f7ff;
        }

        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .setting-row label {
          font-size: 0.9rem;
        }

        .inventory-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          text-align: left;
        }

        .inventory-row strong {
          color: #ffd98a;
        }

        .inventory-meta {
          font-size: 0.75rem;
          color: #8f96b3;
          margin-top: 2px;
        }

        .inventory-actions .menu-btn {
          width: auto;
          padding: 4px 10px;
          font-size: 0.75rem;
        }

        .setting-slider {
          accent-color: #6fe7ff;
          cursor: pointer;
        }

        /* Top HUD Menu Button */
        #hud-menu-trigger {
          position: absolute;
          top: 12px;
          right: 16px;
          background: rgba(10, 10, 20, 0.7);
          border: 1px solid rgba(111, 231, 255, 0.4);
          color: #6fe7ff;
          border-radius: 4px;
          padding: 6px 14px;
          font-size: 0.8rem;
          cursor: pointer;
          pointer-events: auto;
          transition: background 0.2s, border-color 0.2s;
        }

        #hud-menu-trigger:hover {
          background: rgba(111, 231, 255, 0.25);
          border-color: #ffd98a;
        }

        /* Toast notifications */
        #menu-toast {
          position: absolute;
          bottom: 24px;
          right: 24px;
          background: rgba(15, 20, 40, 0.92);
          border: 1px solid #6fe7ff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
          color: #e0f7ff;
          padding: 10px 18px;
          border-radius: 4px;
          font-size: 0.85rem;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.25s ease;
          pointer-events: none;
        }

        #menu-toast.show {
          opacity: 1;
          transform: translateY(0);
        }
      </style>

      <!-- HUD Menu Button -->
      <button id="hud-menu-trigger">Menu [ESC]</button>

      <!-- Main Pause / Title Menu Modal -->
      <div id="main-menu-backdrop" class="menu-modal-backdrop">
        <div class="menu-card">
          <div class="menu-title">MEMORY RECONSTRUCTION</div>
          <div class="menu-subtitle">Action-Roguelike Metroidvania</div>
          <div id="menu-save-info" class="menu-save-info" style="display: none;"></div>

          <div class="menu-buttons">
            <button id="btn-resume" class="menu-btn menu-btn-primary">Resume Run</button>
            <button id="btn-save" class="menu-btn">Save Game</button>
            <button id="btn-load" class="menu-btn">Load Game</button>
            <button id="btn-inventory" class="menu-btn">Inventory & Equipment</button>
            <button id="btn-story" class="menu-btn">Story & Lore</button>
            <button id="btn-tutorial" class="menu-btn">Tutorial & Controls</button>
            <button id="btn-settings" class="menu-btn">Settings</button>
          </div>

          <div class="menu-footer-hint">Press [ESC] at any time to toggle menu</div>
        </div>
      </div>

      <!-- Inventory Modal -->
      <div id="inventory-backdrop" class="menu-modal-backdrop">
        <div class="menu-card" style="max-width: 640px;">
          <div class="menu-title" style="font-size: 1.8rem;">INVENTORY</div>
          <div class="menu-subtitle">Equipment & Consumables</div>
          <div id="inventory-list" class="sub-modal-content"></div>
          <button id="btn-close-inventory" class="menu-btn menu-btn-primary" style="margin-top: 1.2rem; width: 100%;">Close</button>
        </div>
      </div>

      <!-- Story Modal -->
      <div id="story-backdrop" class="menu-modal-backdrop">
        <div class="menu-card" style="max-width: 580px;">
          <div class="menu-title" style="font-size: 1.8rem;">CHRONICLES</div>
          <div class="menu-subtitle">The Fractured Timeline</div>
          <div class="sub-modal-content">
            <h3>The Shattering</h3>
            <p>Centuries ago, the Core Memory Crystal of the ancient realm shattered. The catastrophe tore the continuum into drifting biomes, each suspended in deep stasis.</p>
            <h3>The Memory Echoes</h3>
            <p>Corrupted by the temporal void, ancient denizens and sentinels forgot their origin, turning hostile. They wander as scavengers, crystal guardians, and forgotten shadows.</p>
            <h3>Your Purpose</h3>
            <p>You awaken as a <strong>Memory Walker</strong>. Guided by the pale gold sanctuary light, you collect glowing Memory Fragments, gain levels, awaken latent disciplines (slash, dash, heal, shield, ultimate), and piece together the forgotten history.</p>
          </div>
          <button id="btn-close-story" class="menu-btn menu-btn-primary" style="margin-top: 1.2rem; width: 100%;">Return</button>
        </div>
      </div>

      <!-- Tutorial Modal -->
      <div id="tutorial-backdrop" class="menu-modal-backdrop">
        <div class="menu-card" style="max-width: 560px;">
          <div class="menu-title" style="font-size: 1.8rem;">HOW TO PLAY</div>
          <div class="menu-subtitle">Controls & Mechanics</div>
          <div class="sub-modal-content">
            <h3>Controls</h3>
            <table class="control-table">
              <tr><th>Action</th><th>Key</th></tr>
              <tr><td>Movement</td><td><span class="control-badge">W</span> <span class="control-badge">A</span> <span class="control-badge">S</span> <span class="control-badge">D</span> / Arrows</td></tr>
              <tr><td>Melee Slash</td><td><span class="control-badge">Space</span> or <span class="control-badge">J</span></td></tr>
              <tr><td>Dash</td><td><span class="control-badge">Shift</span> or <span class="control-badge">K</span></td></tr>
              <tr><td>Abilities</td><td><span class="control-badge">1</span>, <span class="control-badge">2</span>, <span class="control-badge">3</span> (Heal / Shield / Ultimate)</td></tr>
              <tr><td>Pause / Menu</td><td><span class="control-badge">Escape</span></td></tr>
            </table>

            <h3>Core Gameplay Loop</h3>
            <p>• <strong>Explore Biomes</strong>: Ruins, forests, caves, crystal depths, voids and the sanctuary.<br>
               • <strong>Collect Fragments</strong>: Shards grant XP and memory; chaining pickups or kills within 4s builds Memory Surge.<br>
               • <strong>Fight with Intent</strong>: Slashes hit a 120° cone and confirmed hits build the combo. Enemy windups are telegraphed—dash out or interrupt them with a heavy hit.<br>
               • <strong>Loot & Grow</strong>: Kills roll authored loot; memory pickups feed XP while equipment and consumables enter the inventory.<br>
               • <strong>Inventory</strong>: Open Inventory & Equipment in this menu to use consumables or equip weapons, armor and accessories.<br>
               • <strong>Finish the Run</strong>: Depth tracks your deepest chunk. Death blurs current-level XP; defeating the Keeper completes the run.</p>
          </div>
          <button id="btn-close-tutorial" class="menu-btn menu-btn-primary" style="margin-top: 1.2rem; width: 100%;">Got it!</button>
        </div>
      </div>

      <!-- Settings Modal -->
      <div id="settings-backdrop" class="menu-modal-backdrop">
        <div class="menu-card" style="max-width: 440px;">
          <div class="menu-title" style="font-size: 1.8rem;">SETTINGS</div>
          <div class="menu-subtitle">Audio & Presentation</div>
          <div class="sub-modal-content">
            <div class="setting-row">
              <label for="slider-master">Master Volume</label>
              <input type="range" id="slider-master" class="setting-slider" min="0" max="100" value="80">
            </div>
            <div class="setting-row">
              <label for="slider-music">Music Volume</label>
              <input type="range" id="slider-music" class="setting-slider" min="0" max="100" value="70">
            </div>
            <div class="setting-row">
              <label for="slider-sfx">SFX Volume</label>
              <input type="range" id="slider-sfx" class="setting-slider" min="0" max="100" value="80">
            </div>
            <div class="setting-row">
              <label for="toggle-shake">Screen Shake</label>
              <input type="checkbox" id="toggle-shake" checked style="cursor: pointer;">
            </div>
          </div>
          <button id="btn-close-settings" class="menu-btn menu-btn-primary" style="margin-top: 1.2rem; width: 100%;">Save Settings</button>
        </div>
      </div>

      <!-- Victory Modal -->
      <div id="victory-backdrop" class="menu-modal-backdrop">
        <div class="menu-card">
          <div class="menu-title">MEMORY RESTORED</div>
          <div class="menu-subtitle">The Keeper Has Fallen</div>
          <div id="victory-stats" class="menu-save-info" style="display: block;"></div>
          <button id="btn-victory-continue" class="menu-btn menu-btn-primary" style="margin-top: 1.2rem; width: 100%;">Continue Walking</button>
        </div>
      </div>

      <!-- Toast Element -->
      <div id="menu-toast">Notification</div>
    `;

    gameContainer.appendChild(this.overlayContainer);
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        this.toggleMenu();
      }
    });

    const trigger = document.getElementById('hud-menu-trigger');
    trigger?.addEventListener('click', () => this.toggleMenu());

    // Button actions
    document.getElementById('btn-resume')?.addEventListener('click', () => this.closeMenu());
    document.getElementById('btn-save')?.addEventListener('click', () => {
      if (this.saveSystem) {
        this.saveSystem.saveGame();
        this.refreshSaveInfo();
      }
    });
    document.getElementById('btn-load')?.addEventListener('click', async () => {
      if (this.saveSystem) {
        await this.saveSystem.loadGame();
      }
    });

    document.getElementById('btn-inventory')?.addEventListener('click', () => {
      this.renderInventory();
      this.openSubModal('inventory-backdrop');
    });
    document
      .getElementById('btn-close-inventory')
      ?.addEventListener('click', () => this.closeSubModal('inventory-backdrop'));

    document.getElementById('inventory-list')?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest(
        '[data-inventory-action]'
      ) as HTMLElement | null;
      if (!target || !this.playerSystem) return;

      const action = target.dataset.inventoryAction;
      const itemId = target.dataset.itemId;
      const slot = target.dataset.slot;

      if (action === 'use' && itemId) this.playerSystem.useItem(itemId);
      else if (action === 'equip' && itemId) this.playerSystem.equipItem(itemId);
      else if (action === 'unequip' && slot) this.playerSystem.unequipSlot(slot);

      this.renderInventory();
    });

    // Sub-modal triggers
    document
      .getElementById('btn-story')
      ?.addEventListener('click', () => this.openSubModal('story-backdrop'));
    document
      .getElementById('btn-close-story')
      ?.addEventListener('click', () => this.closeSubModal('story-backdrop'));

    document
      .getElementById('btn-tutorial')
      ?.addEventListener('click', () => this.openSubModal('tutorial-backdrop'));
    document
      .getElementById('btn-close-tutorial')
      ?.addEventListener('click', () => this.closeSubModal('tutorial-backdrop'));

    document.getElementById('btn-settings')?.addEventListener('click', () => {
      this.populateSettings();
      this.openSubModal('settings-backdrop');
    });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.applyAndSaveSettings();
      this.closeSubModal('settings-backdrop');
    });

    document.getElementById('btn-victory-continue')?.addEventListener('click', () => {
      document.getElementById('victory-backdrop')?.classList.remove('active');
      this.gameApp?.resume();
    });
  }

  private showVictory(data: any): void {
    if (typeof document === 'undefined') return;
    const stats = document.getElementById('victory-stats');
    if (stats) {
      const summary = buildVictorySummary(data);
      stats.innerHTML = `
        <div>Depth reached: <strong>${summary.depth}</strong></div>
        <div>Runs completed: <strong>${summary.runs}</strong></div>
        <div>Memory Walker level: <strong>${summary.level}</strong></div>
        <div>Fragments carried: <strong>${summary.fragments}</strong></div>
      `;
    }
    document.getElementById('victory-backdrop')?.classList.add('active');
    this.gameApp?.pause();
  }

  private refreshInventoryIfOpen(): void {
    if (
      typeof document !== 'undefined' &&
      document.getElementById('inventory-backdrop')?.classList.contains('active')
    ) {
      this.renderInventory();
    }
  }

  private renderInventory(): void {
    if (typeof document === 'undefined') return;
    const list = document.getElementById('inventory-list');
    if (!list) return;

    if (!this.playerSystem) {
      list.innerHTML = '<p>Inventory unavailable.</p>';
      return;
    }

    const inventory = this.playerSystem.getInventory?.() ?? [];
    const equipment = this.playerSystem.getEquipment?.() ?? {};
    const escape = (value: any) =>
      String(value ?? '').replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return entities[character];
      });
    const statLine = (item: any) =>
      Object.entries(item.stats ?? {})
        .map(([key, value]) => `${escape(key)} ${escape(value)}`)
        .join(' &middot; ');

    const slots = ['weapon', 'armor', 'accessory'];
    let html = '<h3>Equipped</h3>';
    for (const slot of slots) {
      const item = equipment[slot];
      html += `
        <div class="inventory-row">
          <div>
            <strong>${escape(slot)}</strong>: ${item ? escape(item.name) : 'Empty'}
            ${item ? `<div class="inventory-meta">${statLine(item)}</div>` : ''}
          </div>
          ${item ? `<div class="inventory-actions"><button class="menu-btn" data-inventory-action="unequip" data-slot="${escape(slot)}">Unequip</button></div>` : ''}
        </div>`;
    }

    html += '<h3>Backpack</h3>';
    if (inventory.length === 0) {
      html += '<p>Your backpack is empty.</p>';
    } else {
      for (const item of inventory) {
        const canEquip =
          item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory';
        const canUse = item.type === 'consumable' || item.type === 'memory';
        const action = canEquip
          ? `<button class="menu-btn" data-inventory-action="equip" data-item-id="${escape(item.id)}">Equip</button>`
          : canUse
            ? `<button class="menu-btn" data-inventory-action="use" data-item-id="${escape(item.id)}">Use</button>`
            : '';

        html += `
          <div class="inventory-row">
            <div>
              <strong>${escape(item.name)}</strong> x${item.quantity}
              <span class="inventory-meta"> ${escape(item.rarity)} ${escape(item.type)}</span>
              <div class="inventory-meta">${escape(item.description)}</div>
              <div class="inventory-meta">${statLine(item)}</div>
            </div>
            ${action ? `<div class="inventory-actions">${action}</div>` : ''}
          </div>`;
      }
    }

    list.innerHTML = html;
  }

  toggleMenu(): void {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu(): void {
    this.isMenuOpen = true;
    const modal = document.getElementById('main-menu-backdrop');
    modal?.classList.add('active');

    this.refreshSaveInfo();

    if (this.gameApp) {
      this.gameApp.pause();
    }
  }

  closeMenu(): void {
    this.isMenuOpen = false;
    document.querySelectorAll('.menu-modal-backdrop').forEach((m) => m.classList.remove('active'));

    if (this.gameApp) {
      this.gameApp.resume();
    }
  }

  private openSubModal(id: string): void {
    document.getElementById(id)?.classList.add('active');
  }

  private closeSubModal(id: string): void {
    document.getElementById(id)?.classList.remove('active');
  }

  private refreshSaveInfo(): void {
    const infoEl = document.getElementById('menu-save-info');
    const loadBtn = document.getElementById('btn-load') as HTMLButtonElement | null;
    if (!infoEl || !this.saveSystem) return;

    if (this.saveSystem.hasSave()) {
      const meta = this.saveSystem.getSaveMetadata();
      if (meta) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `<strong>Saved Run</strong>: Level ${meta.level} • Fragments: ${meta.fragments} • Time: ${meta.playTime}`;
      }
      if (loadBtn) loadBtn.disabled = false;
    } else {
      infoEl.style.display = 'none';
      if (loadBtn) loadBtn.disabled = true;
    }
  }

  private populateSettings(): void {
    if (!this.saveSystem) return;
    const settings = this.saveSystem.loadSettings();

    const master = document.getElementById('slider-master') as HTMLInputElement | null;
    const music = document.getElementById('slider-music') as HTMLInputElement | null;
    const sfx = document.getElementById('slider-sfx') as HTMLInputElement | null;
    const shake = document.getElementById('toggle-shake') as HTMLInputElement | null;

    if (master) master.value = String(settings.masterVolume);
    if (music) music.value = String(settings.musicVolume);
    if (sfx) sfx.value = String(settings.sfxVolume);
    if (shake) shake.checked = settings.screenShake;
  }

  private applyAndSaveSettings(): void {
    if (!this.saveSystem) return;

    const master = Number(
      (document.getElementById('slider-master') as HTMLInputElement)?.value ?? 80
    );
    const music = Number(
      (document.getElementById('slider-music') as HTMLInputElement)?.value ?? 70
    );
    const sfx = Number((document.getElementById('slider-sfx') as HTMLInputElement)?.value ?? 80);
    const shake = (document.getElementById('toggle-shake') as HTMLInputElement)?.checked ?? true;

    this.saveSystem.saveSettings({
      masterVolume: master,
      musicVolume: music,
      sfxVolume: sfx,
      screenShake: shake,
    });

    // Apply audio volume to AudioSystem via EventBus
    void this.eventBus.emit('audio:volume', {
      master: master / 100,
      music: music / 100,
      sfx: sfx / 100,
    });

    this.showToast('Settings saved!');
  }

  showToast(message: string): void {
    const toast = document.getElementById('menu-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  update(_deltaTime: number): void {
    void _deltaTime;
  }

  async shutdown(): Promise<void> {
    this.overlayContainer?.remove();
    await Promise.resolve();
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: { isMenuOpen: this.isMenuOpen },
      checksum: 'menuSystem',
    };
  }

  deserialize(_state: ModuleState): void {
    void _state;
  }
}
