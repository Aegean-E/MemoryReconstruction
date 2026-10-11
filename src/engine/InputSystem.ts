/**
 * Input System - Handles keyboard, mouse, and gamepad input
 * 
 * Provides unified input handling with action mapping,
 * supporting both direct polling and event-driven patterns.
 */

import { EventBus, GameEvents } from '@core/EventBus';
import { IGameModule, ModuleContext, ModuleState } from '@core/ModuleRegistry';

export const KeyCode = {
  // Movement
  W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  
  // Actions
  Space: 'Space', Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft',
  E: 'KeyE', Q: 'KeyQ', R: 'KeyR', F: 'KeyF',
  J: 'KeyJ', K: 'KeyK', L: 'KeyL',
  
  // UI
  Escape: 'Escape', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace',
  
  // Numbers
  Digit1: 'Digit1', Digit2: 'Digit2', Digit3: 'Digit3', Digit4: 'Digit4',
  Digit5: 'Digit5', Digit6: 'Digit6', Digit7: 'Digit7', Digit8: 'Digit8',
  Digit9: 'Digit9', Digit0: 'Digit0'
} as const;

export type KeyCode = typeof KeyCode[keyof typeof KeyCode];

export const MouseButton = {
  Left: 0, Middle: 1, Right: 2, Back: 3, Forward: 4
} as const;

export type MouseButton = typeof MouseButton[keyof typeof MouseButton];

export const GamepadButton = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  Back: 8, Start: 9,
  LeftStick: 10, RightStick: 11,
  DPadUp: 12, DPadDown: 13, DPadLeft: 14, DPadRight: 15
} as const;

export type GamepadButton = typeof GamepadButton[keyof typeof GamepadButton];

export const GamepadAxis = {
  LeftX: 0, LeftY: 1, RightX: 2, RightY: 3
} as const;

export type GamepadAxis = typeof GamepadAxis[keyof typeof GamepadAxis];

export interface InputAction {
  name: string;
  keys: KeyCode[];
  mouseButtons?: MouseButton[];
  gamepadButtons?: GamepadButton[];
  gamepadAxes?: { axis: GamepadAxis; threshold: number; direction: 1 | -1 }[];
}

export interface InputState {
  keys: Set<KeyCode>;
  mouseButtons: Set<MouseButton>;
  mousePosition: { x: number; y: number };
  mouseDelta: { x: number; y: number };
  wheelDelta: { x: number; y: number };
  gamepads: Map<number, GamepadState>;
  actions: Map<string, boolean>;
}

export interface GamepadState {
  connected: boolean;
  id: string;
  index: number;
  buttons: Map<GamepadButton, boolean>;
  axes: Map<GamepadAxis, number>;
  timestamp: number;
}

export class InputSystem implements IGameModule {
  readonly name = 'inputSystem';
  readonly version = '1.0.0';
  readonly dependencies: string[] = [];
  readonly tokenBudget = 500;

  private eventBus: EventBus;
  private state: InputState;
  private actionMap = new Map<string, InputAction>();
  private previousState: InputState;
  private canvas: HTMLCanvasElement | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.state = this.createInitialState();
    this.previousState = this.createInitialState();
  }

  private createInitialState(): InputState {
    return {
      keys: new Set(),
      mouseButtons: new Set(),
      mousePosition: { x: 0, y: 0 },
      mouseDelta: { x: 0, y: 0 },
      wheelDelta: { x: 0, y: 0 },
      gamepads: new Map(),
      actions: new Map()
    };
  }

  async initialize(context: ModuleContext): Promise<void> {
    this.canvas = document.querySelector('canvas') ?? null;
    if (!this.canvas) {
      console.warn('[InputSystem] No canvas found, input may not work');
    }
    
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.setupGamepadListeners();
    this.setupActionMap();
    
    // Poll gamepads
    setInterval(() => this.pollGamepads(), 100);
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const code = e.code as KeyCode;
      if (!this.state.keys.has(code)) {
        this.state.keys.add(code);
        this.eventBus.emitSync(GameEvents.INPUT_KEY_DOWN, { code, repeat: e.repeat });
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const code = e.code as KeyCode;
      this.state.keys.delete(code);
      this.eventBus.emitSync(GameEvents.INPUT_KEY_UP, { code });
    });

    // Prevent default for game keys
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.isGameKey(e.code)) {
        e.preventDefault();
      }
    });
  }

  private setupMouseListeners(): void {
    // Use canvas for mouse events, fallback to window
    const canvas = this.canvas;
    const target = canvas ?? window;
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;
      
      this.state.mouseDelta.x = newX - this.state.mousePosition.x;
      this.state.mouseDelta.y = newY - this.state.mousePosition.y;
      this.state.mousePosition.x = newX;
      this.state.mousePosition.y = newY;
      
      this.eventBus.emitSync(GameEvents.INPUT_MOUSE_MOVE, { 
        x: this.state.mousePosition.x, 
        y: this.state.mousePosition.y,
        deltaX: this.state.mouseDelta.x,
        deltaY: this.state.mouseDelta.y
      });
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      this.state.mouseButtons.add(e.button as MouseButton);
      this.eventBus.emitSync(GameEvents.INPUT_MOUSE_DOWN, { button: e.button });
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      this.state.mouseButtons.delete(e.button as MouseButton);
      this.eventBus.emitSync(GameEvents.INPUT_MOUSE_UP, { button: e.button });
    };
    
    const handleWheel = (e: WheelEvent) => {
      this.state.wheelDelta.x = e.deltaX;
      this.state.wheelDelta.y = e.deltaY;
    };
    
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    
    target.addEventListener('mousemove', handleMouseMove);
    target.addEventListener('mousedown', handleMouseDown);
    target.addEventListener('mouseup', handleMouseUp);
    target.addEventListener('wheel', handleWheel);
    target.addEventListener('contextmenu', handleContextMenu);
    
    // Store for cleanup if needed
    this._mouseListeners = {
      target,
      handleMouseMove,
      handleMouseDown,
      handleMouseUp,
      handleWheel,
      handleContextMenu
    };
  }

  private _mouseListeners: {
    target: EventTarget;
    handleMouseMove: (e: MouseEvent) => void;
    handleMouseDown: (e: MouseEvent) => void;
    handleMouseUp: (e: MouseEvent) => void;
    handleWheel: (e: WheelEvent) => void;
    handleContextMenu: (e: MouseEvent) => void;
  } | null = null;

  private setupGamepadListeners(): void {
    window.addEventListener('gamepadconnected', (e) => {
      console.log('[InputSystem] Gamepad connected:', e.gamepad.id);
      this.updateGamepadState(e.gamepad);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('[InputSystem] Gamepad disconnected:', e.gamepad.id);
      this.state.gamepads.delete(e.gamepad.index);
    });
  }

  private pollGamepads(): void {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) this.updateGamepadState(gp);
    }
  }

  private updateGamepadState(gp: Gamepad): void {
    let state = this.state.gamepads.get(gp.index);
    if (!state) {
      state = {
        connected: true,
        id: gp.id,
        index: gp.index,
        buttons: new Map(),
        axes: new Map(),
        timestamp: gp.timestamp
      };
      this.state.gamepads.set(gp.index, state);
    }

    // Update buttons
    for (let i = 0; i < gp.buttons.length; i++) {
      const pressed = gp.buttons[i].pressed;
      state.buttons.set(i as GamepadButton, pressed);
    }

    // Update axes
    for (let i = 0; i < gp.axes.length; i++) {
      state.axes.set(i as GamepadAxis, gp.axes[i]);
    }

    state.timestamp = gp.timestamp;
  }

  private setupActionMap(): void {
    // Define default action mappings
    this.registerAction({
      name: 'moveUp',
      keys: [KeyCode.W, KeyCode.ArrowUp],
      gamepadButtons: [GamepadButton.DPadUp],
      gamepadAxes: [{ axis: GamepadAxis.LeftY, threshold: 0.5, direction: -1 }]
    });

    this.registerAction({
      name: 'moveDown',
      keys: [KeyCode.S, KeyCode.ArrowDown],
      gamepadButtons: [GamepadButton.DPadDown],
      gamepadAxes: [{ axis: GamepadAxis.LeftY, threshold: 0.5, direction: 1 }]
    });

    this.registerAction({
      name: 'moveLeft',
      keys: [KeyCode.A, KeyCode.ArrowLeft],
      gamepadButtons: [GamepadButton.DPadLeft],
      gamepadAxes: [{ axis: GamepadAxis.LeftX, threshold: 0.5, direction: -1 }]
    });

    this.registerAction({
      name: 'moveRight',
      keys: [KeyCode.D, KeyCode.ArrowRight],
      gamepadButtons: [GamepadButton.DPadRight],
      gamepadAxes: [{ axis: GamepadAxis.LeftX, threshold: 0.5, direction: 1 }]
    });

    this.registerAction({
      name: 'attack',
      keys: [KeyCode.Space, KeyCode.KeyJ],
      mouseButtons: [MouseButton.Left],
      gamepadButtons: [GamepadButton.A, GamepadButton.X]
    });

    this.registerAction({
      name: 'dash',
      keys: [KeyCode.Shift, KeyCode.KeyK],
      mouseButtons: [MouseButton.Right],
      gamepadButtons: [GamepadButton.B, GamepadButton.RB]
    });

    this.registerAction({
      name: 'interact',
      keys: [KeyCode.E, KeyCode.KeyL],
      gamepadButtons: [GamepadButton.Y]
    });

    this.registerAction({
      name: 'pause',
      keys: [KeyCode.Escape],
      gamepadButtons: [GamepadButton.Start]
    });
  }

  /**
   * Register a custom action mapping
   */
  registerAction(action: InputAction): void {
    this.actionMap.set(action.name, action);
  }

  /**
   * Check if action is currently pressed
   */
  isActionPressed(name: string): boolean {
    return this.state.actions.get(name) ?? false;
  }

  /**
   * Check if action was just pressed this frame
   */
  isActionJustPressed(name: string): boolean {
    return this.isActionPressed(name) && !this.previousState.actions.get(name);
  }

  /**
   * Check if action was just released this frame
   */
  isActionJustReleased(name: string): boolean {
      return !this.isActionPressed(name) && !!this.previousState.actions.get(name);
  }

  /**
   * Get movement vector from input
   */
  getMovementVector(): { x: number; y: number } {
    let x = 0, y = 0;
    
    if (this.isActionPressed('moveLeft')) x -= 1;
    if (this.isActionPressed('moveRight')) x += 1;
    if (this.isActionPressed('moveUp')) y -= 1;
    if (this.isActionPressed('moveDown')) y += 1;
    
    // Normalize diagonal
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len;
      y /= len;
    }
    
    return { x, y };
  }

  /**
   * Get mouse position in world coordinates
   */
  getMouseWorldPosition(camera: { x: number; y: number; zoom: number }): { x: number; y: number } {
    return {
      x: (this.state.mousePosition.x - window.innerWidth / 2) / camera.zoom + camera.x,
      y: (this.state.mousePosition.y - window.innerHeight / 2) / camera.zoom + camera.y
    };
  }

  update(deltaTime: number): void {
    // Update action states
    for (const [name, action] of this.actionMap) {
      let pressed = false;
      
      // Check keys
      for (const key of action.keys) {
        if (this.state.keys.has(key)) { pressed = true; break; }
      }
      
      // Check mouse
      if (!pressed && action.mouseButtons) {
        for (const btn of action.mouseButtons) {
          if (this.state.mouseButtons.has(btn)) { pressed = true; break; }
        }
      }
      
      // Check gamepad buttons
      if (!pressed && action.gamepadButtons) {
        for (const gpState of this.state.gamepads.values()) {
          for (const btn of action.gamepadButtons) {
            if (gpState.buttons.get(btn)) { pressed = true; break; }
          }
          if (pressed) break;
        }
      }
      
      // Check gamepad axes
      if (!pressed && action.gamepadAxes) {
        for (const gpState of this.state.gamepads.values()) {
          for (const axisMap of action.gamepadAxes) {
            const value = gpState.axes.get(axisMap.axis) ?? 0;
            if (value * axisMap.direction > axisMap.threshold) {
              pressed = true;
              break;
            }
          }
          if (pressed) break;
        }
      }
      
      this.state.actions.set(name, pressed);
    }

    // Emit gamepad event if any connected
    if (this.state.gamepads.size > 0) {
      this.eventBus.emitSync(GameEvents.INPUT_GAMEPAD, {
        gamepads: Array.from(this.state.gamepads.entries()).map(([index, state]) => ({
          index,
          id: state.id,
          buttons: Object.fromEntries(state.buttons),
          axes: Object.fromEntries(state.axes)
        }))
      });
    }
  }

  /**
   * Call at end of frame to track just-pressed/released
   */
  endFrame(): void {
    this.previousState = {
      keys: new Set(this.state.keys),
      mouseButtons: new Set(this.state.mouseButtons),
      mousePosition: { ...this.state.mousePosition },
      mouseDelta: { x: 0, y: 0 },
      wheelDelta: { x: 0, y: 0 },
      gamepads: new Map(this.state.gamepads),
      actions: new Map(this.state.actions)
    };
    
    // Reset deltas
    this.state.mouseDelta = { x: 0, y: 0 };
    this.state.wheelDelta = { x: 0, y: 0 };
  }

  async shutdown(): Promise<void> {
    // Listeners are on window, cleanup not strictly needed
  }

  serialize(): ModuleState {
    return {
      version: this.version,
      timestamp: Date.now(),
      data: {
        actionMap: Array.from(this.actionMap.entries()),
        currentActions: Object.fromEntries(this.state.actions)
      },
      checksum: 'input'
    };
  }

  deserialize(state: ModuleState): void {
    if (state.data.actionMap) {
      this.actionMap = new Map(state.data.actionMap);
    }
  }

  private isGameKey(code: string): boolean {
    const gameKeys = [
      KeyCode.W, KeyCode.A, KeyCode.S, KeyCode.D,
      KeyCode.ArrowUp, KeyCode.ArrowDown, KeyCode.ArrowLeft, KeyCode.ArrowRight,
      KeyCode.Space, KeyCode.Shift, KeyCode.Control, KeyCode.E, KeyCode.Q,
      KeyCode.R, KeyCode.F, KeyCode.Escape
    ];
    return gameKeys.includes(code as KeyCode);
  }

  // Debug helpers
  getState(): Readonly<InputState> { return this.state; }
  getActionMap(): Readonly<Map<string, InputAction>> { return this.actionMap; }
}