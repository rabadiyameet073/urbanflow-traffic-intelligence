/**
 * Minimal Cloudflare Workers globals that are not part of the DOM lib.
 * Declared locally instead of pulling in `@cloudflare/workers-types`, which
 * would conflict with the DOM `lib` used by the sibling browser package.
 */

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

/** Hibernation-API attachment helpers (Module 21 §6.1). */
interface WebSocket {
  serializeAttachment?(value: unknown): void;
  deserializeAttachment?(): unknown;
}
