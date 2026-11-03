/// <reference types="vite/client" />

/**
 * Build-time environment surface for the web app (Module 22 §2). Only `VITE_`
 * prefixed vars are inlined by Vite, and only the ones declared here are used.
 * Augmenting `ImportMetaEnv` keeps `tsc` honest about the keys we read.
 */
interface ImportMetaEnv {
  /**
   * Edge gateway origin for the Copilot / EVP calls. Empty (or unset) means
   * same-origin. On Vercel this is injected at build time (see
   * `docs/DEPLOY.md` §2b); a runtime `<meta name="urbanflow-api-base">` still
   * wins over it so a Pages/GitHub mirror can override without a rebuild.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * App version, inlined at build time from `packages/web/package.json` by
 * `vite.config.ts` (`define`). Part of a debug bundle's identity (Module 16 §6);
 * core may not read it, so it arrives as a build constant rather than an import.
 */
declare const __APP_VERSION__: string;
