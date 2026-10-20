import * as PIXI from 'pixi.js';
import type { EventBus } from '@core/EventBus';
import type { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';
import type { RenderSystem } from '@graphics/RenderSystem';
import type { PlayerSystem } from '@gameplay/PlayerSystem';
import type { CombatEntity, CombatSystem } from '@gameplay/CombatSystem';
import { loadTextureAtlas } from './TextureAtlas';
import type { TextureAtlas } from './TextureAtlas';
import spriteAtlas from '@assets/data/sprite_atlas.json';
import { resolveAssetUrl } from '@utils/assetUrl';

interface AnimationClip {
  atlas: TextureAtlas;
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
}

interface ActorView {
  container: PIXI.Container;
  sprite: PIXI.Sprite;
  clips: Map<string, AnimationClip>;
  current: string;
  time: number;
  frame: number;
  facing: 1 | -1;
}

interface HudBar {
  fill: PIXI.Graphics;
  width: number;
  color: number;
}

const ENEMY_ALIASES: Record<string, string> = {
  memoryEcho: 'echo',
};

export class ActorRenderer implements IGameModule {
  readonly name = 'actorRenderer';
  readonly version = '1.0.0';
  readonly dependencies = ['renderSystem', 'playerSystem', 'combatSystem'];
  readonly tokenBudget = 1800;

  private eventBus: EventBus;
  private renderSystem!: RenderSystem;
  private playerSystem!: PlayerSystem;
  private combatSystem!: CombatSystem;
  private app: PIXI.Application | null = null;

  private player: ActorView | null = null;
  private actors = new Map<string, ActorView>();
  private warnedEnemyTypes = new Set<string>();
  private hud: PIXI.Container | null = null;
  private hudBars: HudBar[] = [];
  private hudValues: PIXI.Text[] = [];
  private hudIconTextures = new Map<string, PIXI.Texture>();
  private lastHudRatios: number[] = [];
  private lastHudLabels: string[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.renderSystem = context.sharedState.get('renderSystem');
    this.playerSystem = context.sharedState.get('playerSystem');
    this.combatSystem = context.sharedState.get('combatSystem');
    this.app = this.renderSystem.getApp();

    const layer = this.renderSystem.getLayer('midground');
    if (!layer) {
      console.warn('[ActorRenderer] midground layer missing');
      return;
    }

    await this.loadPlayer(layer);
    await this.loadEnemies();
    await this.loadHud();
  }

  private async loadPlayer(layer: PIXI.Container): Promise<void> {
    const clips = new Map<string, AnimationClip>();
    for (const [name, definition] of Object.entries(spriteAtlas.player.animations)) {
      const atlas = await loadTextureAtlas(
        definition.texture,
        definition.frames,
        1,
        spriteAtlas.player.frameSize.width,
        spriteAtlas.player.frameSize.height
      );
      clips.set(name, {
        atlas,
        row: 0,
        frames: definition.frames,
        fps: definition.fps,
        loop: definition.loop,
      });
    }

    const sprite = new PIXI.Sprite();
    sprite.anchor.set(spriteAtlas.player.origin.x, spriteAtlas.player.origin.y);

    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, -2, 22, 8);
    shadow.fill({ color: 0x05060c, alpha: 0.4 });

    const container = new PIXI.Container();
    container.label = 'player';
    container.addChild(shadow);
    container.addChild(sprite);
    layer.addChild(container);

    this.player = {
      container,
      sprite,
      clips,
      current: '',
      time: 0,
      frame: 0,
      facing: 1,
    };
    this.play(this.player, 'idle');
  }

  private async loadEnemies(): Promise<void> {
    await Promise.all(
      Object.entries(spriteAtlas.enemies).map(async ([key, definition]) => {
        const atlas = await loadTextureAtlas(
          definition.texture,
          definition.columns,
          definition.rows,
          definition.frameWidth,
          definition.frameHeight
        );
        this.enemyAtlases.set(key, {
          atlas,
          animations: definition.animations,
          origin: definition.origin,
        });
      })
    );
  }

  private enemyAtlases = new Map<
    string,
    {
      atlas: TextureAtlas;
      animations: Record<string, { row: number; frames: number; fps: number; loop: boolean }>;
      origin: { x: number; y: number };
    }
  >();

  private async loadHud(): Promise<void> {
    const uiLayer = this.renderSystem.getLayer('ui');
    if (!uiLayer) return;

    for (const [name, path] of Object.entries(spriteAtlas.ui)) {
      this.hudIconTextures.set(name, await PIXI.Assets.load<PIXI.Texture>(resolveAssetUrl(path)));
    }

    this.hud = new PIXI.Container();
    this.hud.label = 'hud';
    const order = ['health', 'mana', 'stamina'];
    const colors = [0xe44852, 0x5cb0ff, 0xe2be5c];

    for (let i = 0; i < order.length; i++) {
      const texture = this.hudIconTextures.get(order[i]);
      if (!texture) continue;
      const icon = new PIXI.Sprite(texture);
      icon.width = 40;
      icon.height = 40;
      icon.position.set(i * 168, 0);
      this.hud.addChild(icon);

      const track = new PIXI.Graphics();
      track.roundRect(46, 12, 108, 12, 6);
      track.fill({ color: 0x11121f, alpha: 0.9 });
      track.roundRect(46, 12, 108, 12, 6);
      track.stroke({ color: 0x4d4636, width: 1, alpha: 0.8 });
      this.hud.addChild(track);

      const fill = new PIXI.Graphics();
      fill.position.set(47, 13);
      this.hud.addChild(fill);
      this.hudBars.push({ fill, width: 106, color: colors[i] });

      const value = new PIXI.Text({
        text: '0',
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          fill: 0xd8d2c0,
        },
      });
      value.position.set(46, 28);
      this.hud.addChild(value);
      this.hudValues.push(value);
    }

    const title = new PIXI.Text({
      text: 'MEMORY WALKER',
      style: {
        fontFamily: 'Cinzel, serif',
        fontSize: 13,
        fill: 0xffd98a,
        letterSpacing: 2,
      },
    });
    title.position.set(2, -22);
    this.hud.addChild(title);

    uiLayer.addChild(this.hud);
  }

  update(deltaTime: number): void {
    if (!this.player) return;

    this.updatePlayer(deltaTime);
    this.updateEnemies(deltaTime);
    this.updateHud();
  }

  private updatePlayer(deltaTime: number): void {
    const state = this.playerSystem.getState();
    const player = this.player!;
    player.container.position.set(state.position.x, state.position.y);
    player.facing = state.facing;
    player.container.scale.x = state.facing;
    this.eventBus.emitSync('camera:move', {
      x: state.position.x,
      y: state.position.y,
      lerp: 0.14,
    });

    let animation = 'idle';
    if (this.isOneShotPlaying(player)) animation = player.current;
    else if (state.attacking) animation = 'attack';
    else if (state.dashing) animation = 'dash';
    else if (Math.abs(state.velocity.x) > 5 || Math.abs(state.velocity.y) > 5) animation = 'walk';

    this.play(player, animation);
    this.advance(player, deltaTime);

    if (state.invincible) {
      player.sprite.alpha = 0.55 + Math.sin(performance.now() / 60) * 0.3;
    } else {
      player.sprite.alpha = 1;
    }
  }

  private updateEnemies(deltaTime: number): void {
    const layer = this.renderSystem.getLayer('midground');
    if (!layer) return;

    const live = new Set<string>();
    for (const [id, entity] of this.combatSystem.getEntities()) {
      const atlasKey = ENEMY_ALIASES[entity.type] ?? entity.type; // aikit:allow-secret
      const definition = this.enemyAtlases.get(atlasKey);
      if (!definition) {
        if (!this.warnedEnemyTypes.has(entity.type)) {
          this.warnedEnemyTypes.add(entity.type);
          console.warn(`[ActorRenderer] No sprite atlas for enemy type "${entity.type}"`);
        }
        continue;
      }
      live.add(id);

      let actor = this.actors.get(id);
      if (!actor) {
        actor = this.createEnemy(id, entity, definition, layer);
        this.actors.set(id, actor);
      }

      actor.container.position.set(entity.position.x, entity.position.y + 6);
      actor.facing = entity.sprite.facing;
      actor.container.scale.x = entity.sprite.facing;

      const animation = this.isOneShotPlaying(actor) ? actor.current : this.enemyAnimation(entity);
      this.play(actor, animation);
      this.advance(actor, deltaTime);
      actor.sprite.alpha = entity.state.alive
        ? 1
        : Math.max(0.15, actor.sprite.alpha - deltaTime * 0.8);
    }

    for (const [id, actor] of this.actors) {
      if (live.has(id)) continue;
      actor.container.destroy({ children: true });
      this.actors.delete(id);
    }
  }

  private createEnemy(
    id: string,
    entity: CombatEntity,
    definition: {
      atlas: TextureAtlas;
      animations: Record<string, { row: number; frames: number; fps: number; loop: boolean }>;
      origin: { x: number; y: number };
    },
    layer: PIXI.Container
  ): ActorView {
    const clips = new Map<string, AnimationClip>();
    for (const [name, animation] of Object.entries(definition.animations)) {
      clips.set(name, {
        atlas: definition.atlas,
        row: animation.row,
        frames: animation.frames,
        fps: animation.fps,
        loop: animation.loop,
      });
    }

    const sprite = new PIXI.Sprite();
    sprite.anchor.set(definition.origin.x, definition.origin.y);

    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, -2, Math.max(12, entity.sprite.width * 0.55), 7);
    shadow.fill({ color: 0x05060c, alpha: 0.36 });

    const container = new PIXI.Container();
    container.label = `enemy_${id}`;
    container.addChild(shadow);
    container.addChild(sprite);
    layer.addChild(container);

    const actor: ActorView = {
      container,
      sprite,
      clips,
      current: '',
      time: 0,
      frame: 0,
      facing: entity.sprite.facing,
    };
    this.play(actor, 'idle');
    return actor;
  }

  private enemyAnimation(entity: CombatEntity): string {
    if (!entity.state.alive) return 'death';
    switch (entity.sprite.animation) {
      case 'attack':
        return 'attack';
      case 'walk':
        return 'walk';
      default:
        return 'idle';
    }
  }

  private isOneShotPlaying(actor: ActorView): boolean {
    const clip = actor.clips.get(actor.current);
    return !!clip && !clip.loop && actor.frame < clip.frames - 1;
  }

  private play(actor: ActorView, name: string): void {
    if (actor.current === name) return;
    const clip = actor.clips.get(name) ?? actor.clips.get('idle');
    if (!clip) return;
    actor.current = clip === actor.clips.get(name) ? name : 'idle';
    actor.time = 0;
    actor.frame = 0;
    actor.sprite.texture = clip.atlas.frameAt(0, clip.row) ?? PIXI.Texture.EMPTY;
  }

  private advance(actor: ActorView, deltaTime: number): void {
    const clip = actor.clips.get(actor.current);
    if (!clip) return;

    if (!clip.loop && actor.frame >= clip.frames - 1) return;

    actor.time += deltaTime * clip.fps;
    while (actor.time >= 1) {
      actor.time -= 1;
      actor.frame = clip.loop ? (actor.frame + 1) % clip.frames : actor.frame + 1;
    }
    actor.sprite.texture = clip.atlas.frameAt(actor.frame, clip.row) ?? PIXI.Texture.EMPTY;
  }

  private updateHud(): void {
    if (!this.hud || !this.app) return;
    const camera = this.renderSystem.getCamera();
    const screen = this.app.screen;
    this.hud.position.set(
      camera.x + (24 - screen.width / 2) / camera.zoom,
      camera.y + (screen.height - 62 - screen.height / 2) / camera.zoom
    );
    this.hud.scale.set(1 / camera.zoom);

    const stats = this.playerSystem.getStats();
    const ratios = [
      stats.health / stats.maxHealth,
      stats.mana / stats.maxMana,
      stats.stamina / stats.maxStamina,
    ];
    const labels = [
      `${Math.ceil(stats.health)} / ${stats.maxHealth}`,
      `${Math.ceil(stats.mana)} / ${stats.maxMana}`,
      `${Math.ceil(stats.stamina)} / ${stats.maxStamina}`,
    ];

    for (let i = 0; i < this.hudBars.length; i++) {
      const bar = this.hudBars[i];
      const ratio = Math.max(0, Math.min(1, ratios[i] ?? 0));
      const label = labels[i] ?? '';
      if (this.lastHudRatios[i] === ratio && this.lastHudLabels[i] === label) continue;
      this.lastHudRatios[i] = ratio;
      this.lastHudLabels[i] = label;
      this.hudValues[i].text = label;

      bar.fill.clear();
      if (ratio <= 0) continue;
      bar.fill.roundRect(0, 0, Math.max(3, bar.width * ratio), 10, 5);
      bar.fill.fill({ color: bar.color, alpha: 0.95 });
      bar.fill.roundRect(0, 0, Math.max(3, bar.width * ratio), 4, 2);
      bar.fill.fill({ color: 0xffffff, alpha: 0.22 });
    }
  }

  async shutdown(): Promise<void> {
    this.player?.container.destroy({ children: true });
    this.player = null;
    for (const actor of this.actors.values()) {
      actor.container.destroy({ children: true });
    }
    this.actors.clear();
    this.hud?.destroy({ children: true });
    this.hud = null;
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        actors: Array.from(this.actors.keys()),
        hudIcons: Array.from(this.hudIconTextures.keys()),
      },
      checksum: 'actors',
    };
  }

  deserialize(_state: ModuleState): void {
    // Presentation state is rebuilt from gameplay state every frame.
  }
}
