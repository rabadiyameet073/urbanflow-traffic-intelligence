/**
 * Module 21: Typed Environment & Runtime Configuration
 */
import { z } from 'zod';

export const EnvSchema = z.object({
  META_API_KEY: z.string().optional(),
  EVP_HMAC_SECRET: z.string().default('dev_evp_secret_key_32_chars_long'),
  META_MODEL: z.string().default('muse-spark-1.3'),
  META_API_BASE: z.string().default('https://api.dev.meta.ai/v1'),
  AI_DAILY_CAP: z.string().default('1500'),
  ALLOWED_ORIGINS: z.string().default('https://urbanflow.pages.dev,http://localhost:5173'),
  WORKERS_AI_MODEL: z.string().default('@cf/meta/llama-3.1-8b-instruct'),
});

export type Env = z.infer<typeof EnvSchema> & {
  ROOM?: any; // Cloudflare DurableObjectNamespace
};

export function parseEnv(raw: unknown): Env {
  return EnvSchema.parse(raw);
}
