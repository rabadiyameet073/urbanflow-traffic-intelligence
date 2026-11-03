/**
 * Module 30 §2 & Module 51 §2.7: Text-only DOM helper.
 *
 * The application never assigns `innerHTML`: every dynamic value is appended as
 * a text node, which makes XSS structurally impossible and keeps the audit
 * (A9 - no innerHTML in /src) clean. Presentational styling lives in CSS
 * classes only; this helper has no `style` escape hatch on purpose.
 */

/** Anything that can become a child node. Falsy values are skipped. */
export type Child = Node | string | number | null | undefined | false;

/** Event listener map keyed by event name. */
export type Listeners = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
};

export interface ElementOptions {
  /** Space-separated class list. */
  class?: string;
  /** Accessible label (`aria-label`). */
  label?: string;
  /** `role` attribute. */
  role?: string;
  /** Plain attribute bag; numbers and booleans are stringified. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /** Typed event listeners. */
  on?: Listeners;
  /** Initial `textContent`, set as a text node. */
  text?: string;
}

/**
 * Create an element with children, attributes and listeners.
 *
 * @param tag     Tag name, e.g. `'section'`.
 * @param options Attributes, classes and listeners.
 * @param children Child nodes or text values (strings are never parsed as HTML).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (options.class) el.className = options.class;
  if (options.label) el.setAttribute('aria-label', options.label);
  if (options.role) el.setAttribute('role', options.role);
  if (options.text !== undefined) el.textContent = options.text;

  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }

  if (options.on) {
    for (const [name, handler] of Object.entries(options.on)) {
      if (handler) el.addEventListener(name, handler as EventListener);
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  return el;
}

/** Append children to an existing container, skipping falsy entries. */
export function appendChildren(parent: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

/** Toggle a class without touching other classes. */
export function setClass(el: Element, name: string, on: boolean): void {
  el.classList.toggle(name, on);
}

/** Shorthand for `document.getElementById` with an error when missing. */
export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
}

/** Shorthand for `document.getElementById` that may legitimately be absent. */
export function maybeById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
