import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    'process.env.DISABLE_HMR': JSON.stringify(process.env.DISABLE_HMR),
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'frontend'),
    },
  },
  root: path.resolve(process.cwd(), 'frontend'),
  build: {
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
