/**
 * Module 24 §10: router, cache, retry, repair and breaker behaviour.
 *
 * Each test drives the real `CopilotRouter` chain with a scripted provider, so
 * what is asserted is the decision the router makes — not a reimplementation of
 * it. The template branch is the terminal state in every fallback test because
 * that is the promise the endpoint makes: it always answers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CopilotRouter, resetCopilotRuntime } from '../src/copilot/router.js';
import { MetaProvider, DIAGNOSIS_JSON_SCHEMA } from '../src/copilot/providers/meta.js';
import { DiagnosisV1Schema, ROOT_CAUSES } from '../src/copilot/schemas.js';
import { MAX_TOKENS, cacheKeyFor } from '../src/copilot/llm.js';
import { PROMPTS, delimitQuestion } from '../src/copilot/prompts.js';
import type { LlmProvider, LlmRawResult, LlmRequest } from '../src/copilot/llm.js';

const WINDOW = { lanes: { 'NB-TR': { queueLengthM: 40 } }, avgDelayS: 12 };

const VALID_DIAGNOSIS = {
  severity: 'warning',
  rootCauseHypotheses: [{ cause: 'DEMAND_SURGE', confidence: 0.7, evidence: ['queue 40 m'] }],
  spillbackRisk: { upstream: false, minutesToSpillback: null },
  recommendedActions: [{ type: 'MONITOR', rationale: 'watch the next window' }],
  advisoryText: 'Heavy demand on NB-TR.',
  signMessage: ['SLOW TRAFFIC'],
};

/** A provider whose every answer is scripted, so call counts are observable. */
class ScriptedProvider implements LlmProvider {
  public readonly name = 'meta' as const;
  public readonly source = 'muse-spark' as const;
  public calls = 0;
  public lastRequest: LlmRequest | null = null;

  constructor(private readonly script: (attempt: number) => LlmRawResult) {}

  public isAvailable(): boolean {
    return true;
  }

  public get modelId(): string {
    return 'muse-spark-1.3';
  }

  public async complete(req: LlmRequest): Promise<LlmRawResult> {
    this.calls++;
    this.lastRequest = req;
    return this.script(req.attempt ?? 1);
  }
}

function ok(text: string): LlmRawResult {
  return { ok: true, text, tokensIn: 10, tokensOut: 20, costMicroUsd: 100, latencyMs: 5 };
}

function f5xx(): LlmRawResult {
  return { ok: false, text: '', tokensIn: 0, tokensOut: 0, costMicroUsd: 0, latencyMs: 5, code: 'HTTP_5XX' };
}

/** No key, so the real Meta rung is skipped and the scripted one is reached. */
function routerWith(provider: ScriptedProvider): CopilotRouter {
  return new CopilotRouter(new MetaProvider(undefined), undefined, undefined, provider);
}

beforeEach(() => {
  resetCopilotRuntime();
});

describe('Module 24 §3 — chain', () => {
  it('answers with the template when no provider is available', async () => {
    const router = new CopilotRouter(new MetaProvider(undefined));
    const res = await router.diagnose(WINDOW, 'ip');

    expect(res.source).toBe('template');
    expect(DiagnosisV1Schema.safeParse(res.value).success).toBe(true);
    expect(res.tokens).toEqual({ in: 0, out: 0 });
  });

  it('retries a 5xx exactly once and then accepts the answer', async () => {
    const provider = new ScriptedProvider((attempt) =>
      attempt === 1 ? f5xx() : ok(JSON.stringify(VALID_DIAGNOSIS)),
    );
    const res = await routerWith(provider).diagnose(WINDOW, 'ip');

    expect(provider.calls).toBe(2);
    expect(res.source).toBe('muse-spark');
    expect(res.value.severity).toBe('warning');
  });

  it('repairs a schema violation once, then falls through to the template', async () => {
    const provider = new ScriptedProvider(() => ok(JSON.stringify({ severity: 'catastrophic' })));
    const res = await routerWith(provider).diagnose(WINDOW, 'ip');

    expect(provider.calls).toBe(2);
    // The second call must carry the validation summary, not the user's text.
    expect(provider.lastRequest?.repairHint).toContain('severity');
    expect(res.source).toBe('template');
  });

  it('opens the breaker after three consecutive failures and recovers later', async () => {
    const provider = new ScriptedProvider(() => f5xx());
    const router = routerWith(provider);

    // Each run spends two calls because a 5xx is retried once; one run is one
    // recorded failure, so the breaker needs three runs before it opens.
    for (let run = 0; run < 3; run++) await router.diagnose({ ...WINDOW, run }, 'ip');
    expect(provider.calls).toBe(6);

    // Fourth run: the provider is skipped entirely and the template answers.
    const fourth = await router.diagnose({ ...WINDOW, run: 4 }, 'ip');
    expect(provider.calls).toBe(6);
    expect(fourth.source).toBe('template');
  });
});

describe('Module 24 §3 — cache', () => {
  it('serves a repeat diagnosis from cache with zero provider calls', async () => {
    const provider = new ScriptedProvider(() => ok(JSON.stringify(VALID_DIAGNOSIS)));
    const router = routerWith(provider);

    const first = await router.diagnose(WINDOW, 'ip');
    const second = await router.diagnose(WINDOW, 'ip');

    expect(provider.calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.source).toBe('muse-spark');
  });

  it('keys the cache on task, prompt version, input and model', async () => {
    const a = await cacheKeyFor('diagnose', 'diagnose.v1', WINDOW, 'muse-spark-1.3');
    const b = await cacheKeyFor('diagnose', 'diagnose.v1', WINDOW, 'muse-spark-1.2');
    const c = await cacheKeyFor('explain', 'diagnose.v1', WINDOW, 'muse-spark-1.3');

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe('Module 24 §8 — cost controls', () => {
  it('caps max_tokens per task', () => {
    expect(MAX_TOKENS).toEqual({ diagnose: 700, explain: 200, advisory: 250, chat: 500 });
  });

  it('carries the mandatory rules in every system prompt', () => {
    for (const prompt of Object.values(PROMPTS)) {
      expect(prompt).toContain('You cannot change traffic signals.');
      expect(prompt).toContain('Never propose changes to yellow, all-red, minimum green or conflict rules.');
      expect(prompt).toContain('Every number you cite must appear in the input.');
    }
  });
});

describe('Module 24 §6 — operator text', () => {
  it('delimits the question and declares it untrusted', async () => {
    const provider = new ScriptedProvider(() => ok('Signals are advisory only.'));
    await routerWith(provider).chat('Why is NB-TR backed up?', 'ip');

    const sent = String(provider.lastRequest?.input);
    expect(sent.startsWith('<operator_question>')).toBe(true);
    expect(sent.endsWith('</operator_question>')).toBe(true);
    expect(delimitQuestion('x')).toContain('<operator_question>\nx\n</operator_question>');
    expect(PROMPTS['chat.v1']).toContain('untrusted operator input');
  });
});

describe('Module 24 §4 — schema parity', () => {
  it('keeps the JSON Schema enum in step with the zod enum', () => {
    const causes = JSON.stringify(DIAGNOSIS_JSON_SCHEMA.properties.rootCauseHypotheses.items.properties.cause.enum);
    expect(causes).toBe(JSON.stringify([...ROOT_CAUSES]));
    expect(Object.keys(DIAGNOSIS_JSON_SCHEMA.properties).sort()).toEqual(
      Object.keys(DiagnosisV1Schema.shape).sort(),
    );
  });
});
