import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Base './' makes the built site work from any folder or sub-path
// (GitHub Pages project sites, Vercel previews, or a local folder).
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        stats: fileURLToPath(new URL('./stats.html', import.meta.url)),
      },
    },
  },
});