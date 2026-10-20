import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'assets',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    hmr: {
      overlay: true
    }
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@graphics': path.resolve(__dirname, 'src/graphics'),
      '@audio': path.resolve(__dirname, 'src/audio'),
      '@gameplay': path.resolve(__dirname, 'src/gameplay'),
      '@ai': path.resolve(__dirname, 'src/ai'),
      '@testing': path.resolve(__dirname, 'src/testing'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@assets': path.resolve(__dirname, 'assets'),
      '@data': path.resolve(__dirname, 'src/data')
    }
  },
  define: {
    'import.meta.env.GAME_VERSION': JSON.stringify(process.env.npm_package_version)
  }
});