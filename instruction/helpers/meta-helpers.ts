/**
 * Small, tested helpers for page metadata (module 33).
 * - fitTitle: keep <title> within a length budget without cutting mid-word.
 * - jsonLdScript: serialise JSON-LD safely for embedding in <script type="application/ld+json">.
 */

/** Trim to `max` characters on a word boundary, appending an ellipsis if shortened. */
export function fitTitle(title: string, max = 60): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const budget = max - 1;
  const cut = clean.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > budget * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:–—-]+$/, '')}…`;
}

/** Escape characters that could terminate or confuse an inline script block. */
export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}
