import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:18080',
        changeOrigin: true,
      },
      '/artifacts': {
        target: 'http://localhost:18080',
        changeOrigin: true,
      },
      '/configs': {
        target: 'http://localhost:18080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
