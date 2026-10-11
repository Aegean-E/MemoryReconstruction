/**
 * Utility Functions - Common helpers for the game
 */

// Math utilities
export const MathUtils = {
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  },
  
  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  },
  
  lerpVec2(a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
    return {
      x: this.lerp(a.x, b.x, t),
      y: this.lerp(a.y, b.y, t)
    };
  },
  
  distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },
  
  distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  },
  
  angle(from: { x: number; y: number }, to: { x: number; y: number }): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  },
  
  normalize(vec: { x: number; y: number }): { x: number; y: number } {
    const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: vec.x / len, y: vec.y / len };
  },
  
  rotate(vec: { x: number; y: number }, angle: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: vec.x * cos - vec.y * sin,
      y: vec.x * sin + vec.y * cos
    };
  },
  
  randomRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  },
  
  randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  
  randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  },
  
  randomWeighted<T>(items: Array<{ item: T; weight: number }>): T {
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const { item, weight } of items) {
      random -= weight;
      if (random <= 0) return item;
    }
    
    return items[items.length - 1].item;
  }
};

// Color utilities
export const ColorUtils = {
  hexToRgb(hex: number): { r: number; g: number; b: number } {
    return {
      r: (hex >> 16) & 0xff,
      g: (hex >> 8) & 0xff,
      b: hex & 0xff
    };
  },
  
  rgbToHex(r: number, g: number, b: number): number {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  },
  
  lerpColor(a: number, b: number, t: number): number {
    const ca = this.hexToRgb(a);
    const cb = this.hexToRgb(b);
    return this.rgbToHex(
      Math.round(MathUtils.lerp(ca.r, cb.r, t)),
      Math.round(MathUtils.lerp(ca.g, cb.g, t)),
      Math.round(MathUtils.lerp(ca.b, cb.b, t))
    );
  },
  
  hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    switch (i % 6) {
      case 0: return { r: v, g: t, b: p };
      case 1: return { r: q, g: v, b: p };
      case 2: return { r: p, g: v, b: t };
      case 3: return { r: p, g: q, b: v };
      case 4: return { r: t, g: p, b: v };
      case 5: return { r: v, g: p, b: q };
    }
    return { r: 0, g: 0, b: 0 };
  },
  
  getContrastColor(hex: number): number {
    const { r, g, b } = this.hexToRgb(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? 0x000000 : 0xffffff;
  }
};

// String utilities
export const StringUtils = {
  format(template: string, ...args: any[]): string {
    return template.replace(/{(\d+)}/g, (match, index) => {
      return args[index] !== undefined ? args[index] : match;
    });
  },
  
  capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  
  camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  },
  
  kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  },
  
  truncate(str: string, maxLength: number, suffix = '...'): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
  },
  
  padZero(num: number, length: number): string {
    return num.toString().padStart(length, '0');
  }
};

// Time utilities
export const TimeUtils = {
  formatMs(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  },
  
  formatSeconds(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${StringUtils.padZero(secs, 2)}`;
  },
  
  now(): number {
    return performance.now();
  },
  
  timestamp(): number {
    return Date.now();
  }
};

// Array utilities
export const ArrayUtils = {
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },
  
  chunk<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  },
  
  unique<T>(array: T[]): T[] {
    return [...new Set(array)];
  },
  
  groupBy<T, K>(array: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of array) {
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  },
  
  flatten<T>(arrays: T[][]): T[] {
    return arrays.reduce((acc, arr) => acc.concat(arr), []);
  }
};

// Object utilities
export const ObjectUtils = {
  deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  },
  
  deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
          targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        (result as any)[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        (result as any)[key] = sourceValue;
      }
    }
    return result;
  },
  
  pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      if (key in obj) result[key] = obj[key];
    }
    return result;
  },
  
  omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const result = { ...obj };
    for (const key of keys) {
      delete result[key];
    }
    return result;
  }
};

// Event emitter utility
export class EventEmitter<T extends Record<string, any>> {
  private listeners = new Map<keyof T, Set<Function>>();
  
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }
  
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): boolean {
    return this.listeners.get(event)?.delete(listener) ?? false;
  }
  
  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(data);
      } catch (err) {
        console.error(`[EventEmitter] Error in listener for ${String(event)}:`, err);
      }
    });
  }
  
  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): () => void {
    const wrapper = (data: T[K]) => {
      this.off(event, wrapper);
      listener(data);
    };
    return this.on(event, wrapper);
  }
  
  clear(): void {
    this.listeners.clear();
  }
}

// Pool utility for object pooling
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;
  
  constructor(createFn: () => T, resetFn: (obj: T) => void, maxSize = 100) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }
  
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }
  
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }
  
  clear(): void {
    this.pool = [];
  }
  
  size(): number {
    return this.pool.length;
  }
}

// Deterministic RNG
export class DeterministicRNG {
  private state: number;
  
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  
  nextBool(probability = 0.5): boolean {
    return this.next() < probability;
  }
  
  nextChoice<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
  
  getState(): number {
    return this.state;
  }
  
  setState(state: number): void {
    this.state = state >>> 0;
  }
  
  clone(): DeterministicRNG {
    const rng = new DeterministicRNG(0);
    rng.state = this.state;
    return rng;
  }
}