/// <reference types="vite/client" />

declare module '*.json' {
  const value: any;
  export default value;
}

declare module '*.wgsl' {
  const value: string;
  export default value;
}

declare module '*.glsl' {
  const value: string;
  export default value;
}

interface ImportMetaEnv {
  readonly GAME_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global game access for debugging
interface Window {
  __GAME__: any;
  __MODULE_REGISTRY__: any;
  __TESTING_HARNESS__: any;
  __GAME_RNG__: () => number;
}
