// @ts-check
/**
 * Checks the built public page's metadata (module 33).
 * Usage: node helpers/check-meta.mjs <path/to/index.html> [--json]
 * Exit 0 = all checks pass, 1 = failures, 2 = usage error.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const asJson = args.includes('--json');
if (!file) {
  console.error('Usage: node helpers/check-meta.mjs <index.html> [--json]');
  process.exit(2);
}

const html = readFileSync(file, 'utf8');
/** @type {{name: string, ok: boolean, detail: string}[]} */
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });

const first = (re) => (html.match(re) ?? [])[1];

const title = first(/<title>([^<]*)<\/title>/i);
check('title present', title, title ?? 'missing');
check('title length 10-60', title && title.length >= 10 && title.length <= 60, `${title?.length ?? 0} chars`);

const description = first(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
check('meta description 50-160', description && description.length >= 50 && description.length <= 160, `${description?.length ?? 0} chars`);

check('html lang', /<html[^>]*\slang=["'][a-z-]+["']/i.test(html));
check('viewport (no zoom lock)', /name=["']viewport["']/i.test(html) && !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\D|$)/i.test(html));
check('charset utf-8', /<meta\s+charset=["']utf-8["']/i.test(html));
check('canonical link', /<link\s+rel=["']canonical["']\s+href=["']https?:\/\//i.test(html));
check('theme-color', /name=["']theme-color["']/i.test(html));
check('exactly one h1 or app root h1', (html.match(/<h1[\s>]/gi) ?? []).length <= 1);
check('skip link', /href=["']#[^"']+["'][^>]*>\s*Skip/i.test(html));
check('noscript fallback', /<noscript>[\s\S]*<\/noscript>/i.test(html));

for (const prop of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) {
  check(`${prop}`, new RegExp(`property=["']${prop}["']\\s+content=["'][^"']+["']`, 'i').test(html));
}
for (const name of ['twitter:card', 'twitter:title', 'twitter:image']) {
  check(`${name}`, new RegExp(`name=["']${name}["']\\s+content=["'][^"']+["']`, 'i').test(html));
}

const ogImage = first(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
check('og:image absolute URL', ogImage && /^https?:\/\//.test(ogImage), ogImage ?? 'missing');

const ldBlocks = [...html.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
check('JSON-LD present', ldBlocks.length > 0);
for (const [i, m] of ldBlocks.entries()) {
  let ok = true;
  try {
    JSON.parse(m[1] ?? '');
  } catch {
    ok = false;
  }
  check(`JSON-LD #${i + 1} parses`, ok);
}

check('no inline event handlers', !/\son[a-z]+=["']/i.test(html));
check('no inline style attributes', !/\sstyle=["']/i.test(html));
check('no analytics scripts', !/google-analytics|googletagmanager|mixpanel|segment\.com|hotjar/i.test(html));

const failed = results.filter((r) => !r.ok);
if (asJson) {
  console.log(JSON.stringify({ file, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
} else {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
}
process.exit(failed.length === 0 ? 0 : 1);
