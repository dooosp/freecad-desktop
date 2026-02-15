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
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          chartjs: ['chart.js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}', 'backend/**/*.test.{js,jsx}', 'scripts/**/*.test.{js,jsx}'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}', 'backend/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}'],
      exclude: ['**/*.test.{js,jsx}', 'node_modules/**', 'dist/**', 'coverage/**', 'artifacts/**', 'src/contracts/**'],
    },
  },
});
