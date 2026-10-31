/**
 * Module 24: Meta Model API Provider (Muse Spark 1.3)
 * Connects directly to dev.meta.ai / api.meta.ai OpenAI-compatible completions.
 */
import { PROMPTS } from '../prompts.js';
import { DiagnosisV1, DiagnosisV1Schema } from '../schemas.js';

export interface MetaCompletionResult<T> {
  ok: boolean;
  value?: T;
  source: 'muse-spark';
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  latencyMs: number;
  error?: string;
}

export class MetaProvider {
  public readonly name = 'meta' as const;
  private apiKey?: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey?: string, baseUrl = 'https://api.dev.meta.ai/v1', model = 'muse-spark-1.3') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  public async diagnose(
    windowData: unknown,
    signal?: AbortSignal,
  ): Promise<MetaCompletionResult<DiagnosisV1>> {
    if (!this.isAvailable()) {
      return {
        ok: false,
        source: 'muse-spark',
        tokensIn: 0,
        tokensOut: 0,
        costMicroUsd: 0,
        latencyMs: 0,
        error: 'META_API_KEY_NOT_CONFIGURED',
      };
    }

    const t0 = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: PROMPTS['diagnose.v1'] },
            {
              role: 'user',
              content: `Analyze this 60-second traffic window metrics and respond strictly with JSON conforming to the Diagnosis schema:\n${JSON.stringify(windowData)}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 700,
          temperature: 0.1,
        }),
        signal,
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        return {
          ok: false,
          source: 'muse-spark',
          tokensIn: 0,
          tokensOut: 0,
          costMicroUsd: 0,
          latencyMs,
          error: `HTTP_${response.status}`,
        };
      }

      const body = (await response.json()) as any;
      const text = body.choices?.[0]?.message?.content ?? '{}';
      const parsedJson = JSON.parse(text);
      const validated = DiagnosisV1Schema.parse(parsedJson);

      const tokensIn = body.usage?.prompt_tokens ?? 400;
      const tokensOut = body.usage?.completion_tokens ?? 250;
      // Rates: $1.25 / 1M in, $4.25 / 1M out -> Micro-USD
      const costMicroUsd = Math.round(tokensIn * 1.25 + tokensOut * 4.25);

      return {
        ok: true,
        value: validated,
        source: 'muse-spark',
        tokensIn,
        tokensOut,
        costMicroUsd,
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        source: 'muse-spark',
        tokensIn: 0,
        tokensOut: 0,
        costMicroUsd: 0,
        latencyMs: Date.now() - t0,
        error: err.name === 'AbortError' ? 'TIMEOUT' : err.message,
      };
    }
  }
}
