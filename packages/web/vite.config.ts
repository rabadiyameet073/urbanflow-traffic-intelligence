import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Version stamped into debug bundles as `__APP_VERSION__` (Module 16 §6). */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Module 30 §9: build & loading.
 *
 * - ES2022 target (the spec's floor; every browser we support ships it).
 * - `sourcemap = true` so a stack trace maps back to `src` — the error notice
 *   (§7) and Playwright flows both rely on it being readable.
 * - Manual chunks keep the hero (core + worker) small and let the heavier
 *   panels (charts, copilot, camera) load independently instead of blocking
 *   first paint of the twin canvas.
 *
 * The `size-limit` JS ≤ 350 KB gz budget (§9) is enforced by `scripts/fitness.mjs`
 * in the toolchain rather than a new devDependency (Rule 18: no dependency for
 * one helper).
 */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Multi-page build (Module 30 §9): the live dashboard plus the
      // System Explorer briefing page (`/system.html`). Both share the
      // design tokens and the `core` chunk stays split out.
      input: {
        main: 'index.html',
        system: 'system.html',
      },
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules')) return undefined;
          if (id.includes('@urbanflow/core')) return 'core';
          if (id.includes('/ui/copilot/') || id.includes('copilot/client')) return 'copilot';
          if (id.includes('/ui/charts/') || id.includes('chart')) return 'charts';
          if (id.includes('/ui/camera/') || id.includes('camera')) return 'camera';
          return undefined;
        },
      },
    },
  },
});
