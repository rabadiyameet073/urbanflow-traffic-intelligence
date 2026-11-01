/**
 * Module 21 §3: Typed Environment & Runtime Configuration
 *
 * `EVP_HMAC_SECRET` is a *secret*, typed as optional with **no default**. A
 * default secret would ship inside the bundle, and anyone who read it could
 * forge a signed EVP request that every check below would accept. A gateway
 * without the secret answers `PROVIDER_UNAVAILABLE` on the routes that need it
 * and reports `evp: false` on `/api/health`, which is the behaviour Module 21 §3
 * asks for: degraded and visible, never silently permissive.
 */
import { z } from 'zod';

/** Module 21 §3: the shortest secret we will sign with. HMAC-SHA256 keys below
 *  the block size still work, but a short key is the only thing standing between
 *  a stranger and a forged green light, so it is rejected explicitly. */
export const MIN_EVP_SECRET_LENGTH = 16;

export const EnvSchema = z.object({
  META_API_KEY: z.string().optional(),
  EVP_HMAC_SECRET: z.string().optional(),
  META_MODEL: z.string().default('muse-spark-1.3'),
  // Module 21 §3: default `https://api.meta.ai/v1` — re-check on dev.meta.ai
  // before deploying; the `dev.` host is not the documented production base.
  META_API_BASE: z.string().url().default('https://api.meta.ai/v1'),
  AI_DAILY_CAP: z.string().default('1500'),
  ALLOWED_ORIGINS: z.string().default('https://urbanflow-ai.pages.dev,http://localhost:5173'),
  WORKERS_AI_MODEL: z.string().default('@cf/meta/llama-3.1-8b-instruct'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DB_NAME: z.string().default('urbanflow'),
});

export type Env = z.infer<typeof EnvSchema> & {
  ROOM?: any; // AUDIT-OK(A5): Cloudflare DurableObjectNamespace binding — real types need @cloudflare/workers-types (Rule 18)
  AI?: any; // AUDIT-OK(A5): Workers AI binding (Module 24 fallback provider) — same binding-type rationale
};

export function parseEnv(raw: unknown): Env {
  return EnvSchema.parse(raw ?? {});
}

/**
 * The usable EVP signing secret, or `null` when the deployment has not set one.
 * Every caller that signs or verifies must go through this function so the
 * "unconfigured" path is one decision, not five.
 */
export function evpSecret(env: Env): string | null {
  const secret = env.EVP_HMAC_SECRET?.trim() ?? '';
  return secret.length >= MIN_EVP_SECRET_LENGTH ? secret : null;
}

