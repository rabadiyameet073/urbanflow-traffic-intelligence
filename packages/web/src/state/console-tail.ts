/**
 * Module 16 §6: rolling console tail for the debug bundle.
 *
 * The bundle ships the *last 50* console lines so a filed bug carries its own
 * trail without growing unbounded or retaining anything user-typed. Wrapping
 * happens once at boot; the originals are chained, so devtools still show the
 * messages as before.
 */
const MAX_LINES = 50;
const tail: string[] = [];
let installed = false;

function describe(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

function record(level: string, args: unknown[]): void {
  tail.push(`[${level}] ${args.map(describe).join(' ')}`);
  if (tail.length > MAX_LINES) tail.shift();
}

/** Wrap console.log/warn/error once. Called from `main.ts` before anything else logs. */
export function installConsoleTail(): void {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      record(level, args);
      original(...args);
    };
  }
}

/** Snapshot of the tail, oldest first — the shape `createDebugBundle` expects. */
export function getConsoleTail(): string[] {
  return [...tail];
}
