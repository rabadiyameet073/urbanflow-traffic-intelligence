/**
 * Module 25 §5.2: the frozen tuned-params record must not rot.
 * `contracts.ts` is the source of truth (Rule 12); `params.tuned.json` is the
 * published provenance file. This test is the only thing keeping them honest,
 * and it fails loudly on any silent divergence.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ADAPTIVE_PARAMS, AdaptiveParamsSchema } from '../src/contracts.js';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/control/params.tuned.json');

describe('Module 25 §5.2 — tuned params record', () => {
  it('records exactly the frozen contract defaults', () => {
    const record = JSON.parse(readFileSync(FILE, 'utf8')) as { commit: string | null; params: unknown };
    expect(AdaptiveParamsSchema.safeParse(record.params).success).toBe(true);
    expect(record.params).toEqual(DEFAULT_ADAPTIVE_PARAMS);
    // §5.2 asks for the git commit; null is the honest "not yet stamped" state,
    // anything else must look like a real hash — never a placeholder string.
    if (record.commit !== null) {
      expect(record.commit).toMatch(/^[0-9a-f]{7,40}$/);
    }
  });
});
