import { defineConfig } from 'vite';

// Relative base so the built site works from any folder (e.g. GitHub Pages).
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 2000 } });
