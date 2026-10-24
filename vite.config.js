import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js + GSAP + the scene ship as one chunk on purpose: everything is
    // needed before the first frame.
    chunkSizeWarningLimit: 900,
  },
});
