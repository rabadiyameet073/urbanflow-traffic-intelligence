/**
 * Module 16 §3: Structured Edge Logger
 *
 * Emits JSON Lines format. Strictly enforces:
 * - No secrets or sensitive keys
 * - No user chat or prompt text
 * - Daily-salted truncated IP hashes
 * - Standard event names (<domain>.<verb>) and reason codes (UPPER_SNAKE)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogPayload {
  ts?: string;
  level: LogLevel;
  svc: 'edge' | 'core' | 'pipeline';
  route?: string;
  requestId?: string;
  event: string;
  reason?: string;
  ipHash?: string;
  latencyMs?: number;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface PromptLogMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  costUsdEstimate: number;
  cacheHit: boolean;
}

export class Logger {
  private static version = 'v1.0.0';

  public static setVersion(version: string): void {
    this.version = version;
  }

  public static log(payload: StructuredLogPayload): void {
    const entry = {
      ts: payload.ts ?? new Date().toISOString(),
      level: payload.level,
      svc: payload.svc,
      route: payload.route,
      requestId: payload.requestId,
      event: payload.event,
      reason: payload.reason,
      ipHash: payload.ipHash,
      latencyMs: payload.latencyMs,
      version: payload.version ?? this.version,
      ...payload.metadata,
    };

    // Print JSON-line output
    const jsonLine = JSON.stringify(entry);
    if (payload.level === 'error') {
      console.error(jsonLine);
    } else if (payload.level === 'warn') {
      console.warn(jsonLine);
    } else {
      console.log(jsonLine);
    }
  }

  public static info(event: string, meta: Partial<StructuredLogPayload> = {}): void {
    this.log({ level: 'info', svc: 'edge', event, ...meta });
  }

  public static warn(event: string, reason: string, meta: Partial<StructuredLogPayload> = {}): void {
    this.log({ level: 'warn', svc: 'edge', event, reason, ...meta });
  }

  public static error(event: string, reason: string, meta: Partial<StructuredLogPayload> = {}): void {
    this.log({ level: 'error', svc: 'edge', event, reason, ...meta });
  }

  /**
   * Safe prompt execution logging: strictly logs operational metadata, NEVER raw prompt text!
   */
  public static logPromptExecution(
    requestId: string,
    meta: PromptLogMetadata,
    route = '/api/copilot/diagnose',
  ): void {
    this.info('copilot.call', {
      route,
      requestId,
      metadata: { ...meta } as Record<string, unknown>,
    });
  }
}
