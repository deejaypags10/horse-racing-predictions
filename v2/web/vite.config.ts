/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API only accepts Host 127.0.0.1/localhost; pin it explicitly.
    proxy: { '/api': { target: 'http://127.0.0.1:8765', changeOrigin: false, headers: { Host: '127.0.0.1:8765' } } },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
