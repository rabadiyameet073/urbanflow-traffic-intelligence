#!/usr/bin/env node
/**
 * Module 10 §8: Architectural Fitness Functions, as an executable gate.
 *
 * The module lists seven properties that must be checked automatically. Five of
 * them need no external tool: they are statements about the repository's own text
 * and its build output, so they are checked here with Node's standard library
 * rather than by adding dependency-cruiser, size-limit and ESLint to a frozen
 * tree (Rule 18: every new dependency is a supply-chain decision).
 *
 *   purity    core imports no Node/DOM globals and reads no clock       (ADR-001)
 *   deps      the package dependency law: core standalone, only core+db shared (§3, ADR-0021)
 *   cycles    no circular imports                                       (§3.4)
 *   writer    only the Safety Kernel builds a SignalState               (E1, §2 S1)
 *   size      total JS ≤ 350 KB gz                                      (§8, Module 15 §1)
 *   secrets   no env secret value appears in the built bundle           (Module 14 §4.1)
 *   headers   the static origin ships the hardening set it claims       (Module 14 §4.2)
 *
 * Not covered here, and named so the gap is not mistaken for coverage:
 * determinism across two browsers (vitest, Node only), and zod↔Spark schema
 * parity (a Python-side test).
 *
 * Usage:
 *   node scripts/fitness.mjs                 # all checks
 *   node scripts/fitness.mjs --only=size     # one or more, comma separated
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = join(ROOT, 'packages', 'core', 'src');
const DIST_DIR = join(ROOT, 'packages', 'web', 'dist');
const BUDGET_GZ_BYTES = 350 * 1024;

/**
 * Workspace package name -> TypeScript source directory. `db` is a root-level
 * shared persistence package (ADR-0021); the rest live under packages/.
 */
const PKG_SRC = {
  core: join(ROOT, 'packages', 'core', 'src'),
  edge: join(ROOT, 'packages', 'edge', 'src'),
  web: join(ROOT, 'packages', 'web', 'src'),
  bench: join(ROOT, 'packages', 'bench', 'src'),
  db: join(ROOT, 'db', 'src'),
};
// Package names that may be imported across a package boundary (ADR-001/0021).
const SHAREABLE = new Set(['core', 'db']);

// --------------------------------------------------------------------- helpers

/** Recursively list files under `dir` whose name ends with one of `exts`. */
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Remove comments and string/template literals so that prose mentioning
 * `Math.random` (as `helpers/rng.ts` does, to promise it never uses it) cannot be
 * mistaken for a call. Regex literals are left alone; none in this tree contain
 * a quote character.
 */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        // Keep newlines so reported line numbers still match the file.
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const rel = (file) => relative(ROOT, file).split(sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*)(['"])([^'"]+)\1/g;

function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const found = [];
  for (const match of src.matchAll(IMPORT_RE)) found.push(match[2]);
  return found;
}

/** Resolve an import specifier to a file in this repo, or null if external. */
function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(fromFile), specifier);
    const candidates = [base, base.replace(/\.js$/, '.ts'), join(base, 'index.ts')];
    return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
  }
  if (specifier.startsWith('@urbanflow/')) {
    const pkg = specifier.slice('@urbanflow/'.length);
    const srcDir = PKG_SRC[pkg] ?? join(ROOT, 'packages', pkg, 'src');
    const entry = join(srcDir, 'index.ts');
    return existsSync(entry) ? entry : null;
  }
  return null;
}

// ---------------------------------------------------------------------- checks

const checks = {};

/** ADR-001 / Module 10 §3: core reads no clock, no DOM, no Node, no randomness. */
checks.purity = () => {
  const banned = [
    [/\bDate\s*\.\s*now\b/, 'Date.now'],
    [/\bnew\s+Date\s*\(\s*\)/, 'new Date()'],
    [/\bMath\s*\.\s*random\b/, 'Math.random'],
    [/\bperformance\s*\.\s*now\b/, 'performance.now'],
    [/\bnavigator\b/, 'navigator'],
    [/\bwindow\b/, 'window'],
    [/\bdocument\b/, 'document'],
    [/\blocalStorage\b/, 'localStorage'],
    [/\bsessionStorage\b/, 'sessionStorage'],
    [/\bsetTimeout\s*\(/, 'setTimeout'],
    [/\bsetInterval\s*\(/, 'setInterval'],
    [/\bfetch\s*\(/, 'fetch()'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bprocess\s*\.\s*(?:env|argv|exit|cwd)\b/, 'process.*'],
    [/\brequire\s*\(/, 'require()'],
  ];
  const failures = [];
  for (const file of walk(CORE_DIR, ['.ts'])) {
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    for (const [pattern, label] of banned) {
      const match = pattern.exec(code);
      if (match) failures.push(`${rel(file)}:${lineOf(code, match.index)} uses ${label}`);
    }
  }
  return failures;
};

/** Module 10 §3: core imports nothing from siblings; only core and db are shareable (ADR-0021). */
checks.deps = () => {
  const failures = [];

  for (const [pkg, dir] of Object.entries(PKG_SRC)) {
    for (const file of walk(dir, ['.ts'])) {
      for (const specifier of importsOf(file)) {
        const location = rel(file);
        if (specifier.startsWith('.') || specifier.startsWith('@urbanflow/')) {
          if (specifier.startsWith('@urbanflow/')) {
            const target = specifier.slice('@urbanflow/'.length);
            // Rule (ADR-001/0021): only core and db are shareable; a sibling
            // import outside that set is a layering breach.
            if (!SHAREABLE.has(target) && target !== pkg) {
              failures.push(`${location} imports ${specifier} (only core and db may be shared across packages)`);
            }
            if (pkg === 'core') {
              failures.push(`${location} imports ${specifier} (core must not depend on a sibling)`);
            }
            if (pkg === 'db' && target !== 'core' && target !== 'db') {
              failures.push(`${location} imports ${specifier} (db may only depend on core)`);
            }
          }
          continue;
        }
        if (specifier.startsWith('node:')) {
          if (pkg !== 'bench') failures.push(`${location} imports ${specifier} (Node built-in outside bench)`);
          continue;
        }
        // Bare specifiers: zod is the only runtime library core is allowed.
        if (pkg === 'core' && specifier !== 'zod') {
          failures.push(`${location} imports "${specifier}" (core may only import zod or relative modules)`);
        }
      }
    }
  }
  return failures;
};

/** Module 10 §3.4: no circular imports, across and within packages. */
checks.cycles = () => {
  const files = [];
  for (const dir of Object.values(PKG_SRC)) {
    files.push(...walk(dir, ['.ts']));
  }
  const graph = new Map(files.map((file) => [file, []]));
  for (const file of files) {
    for (const specifier of importsOf(file)) {
      const target = resolveSpecifier(file, specifier);
      if (target && graph.has(target)) graph.get(file).push(target);
    }
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map(files.map((file) => [file, WHITE]));
  const failures = [];
  const stack = [];

  const visit = (node) => {
    colour.set(node, GREY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (colour.get(next) === GREY) {
        const start = stack.indexOf(next);
        failures.push(`cycle: ${stack.slice(start).map(rel).join(' -> ')} -> ${rel(next)}`);
      } else if (colour.get(next) === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    colour.set(node, BLACK);
  };

  for (const file of files) if (colour.get(file) === WHITE) visit(file);
  return failures;
};

/**
 * Module 13 §2 E1: the Safety Kernel is the only writer of `SignalState`.
 *
 * "Writer" means producing a state that governs the intersection. Two files are
 * exempt and both are declarations rather than decisions: `contracts.ts` holds the
 * type and the single frozen boot state, and `control/kernel.ts` builds every
 * state after it. Anywhere else, an `indication:` property is a second writer.
 */
checks.writer = () => {
  const exempt = [join(CORE_DIR, 'control', 'kernel.ts'), join(CORE_DIR, 'contracts.ts')].map((p) =>
    resolve(p),
  );
  const failures = [];
  const pattern = /\bindication\s*:/;
  for (const file of walk(CORE_DIR, ['.ts'])) {
    if (exempt.includes(resolve(file))) continue;
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    const match = pattern.exec(code);
    if (match) {
      failures.push(
        `${rel(file)}:${lineOf(code, match.index)} builds a SignalState outside control/kernel.ts`,
      );
    }
  }
  return failures;
};

/** Module 15 §1: total shipped JS ≤ 350 KB gzip. */
checks.size = () => {
  const assets = join(DIST_DIR, 'assets');
  if (!existsSync(assets)) {
    return ['packages/web/dist/assets is missing — run `pnpm --filter @urbanflow/web build` first'];
  }
  const jsFiles = readdirSync(assets).filter((name) => name.endsWith('.js'));
  if (jsFiles.length === 0) return ['packages/web/dist/assets contains no .js chunks'];

  let rawBytes = 0;
  let gzBytes = 0;
  const rows = [];
  for (const name of jsFiles) {
    const buffer = readFileSync(join(assets, name));
    const gz = gzipSync(buffer, { level: 9 });
    rawBytes += buffer.length;
    gzBytes += gz.length;
    rows.push(`${name} ${(buffer.length / 1024).toFixed(2)} KiB raw / ${(gz.length / 1024).toFixed(2)} KiB gz`);
  }
  console.error(`    total ${(rawBytes / 1024).toFixed(2)} KiB raw / ${(gzBytes / 1024).toFixed(2)} KiB gz`);
  for (const row of rows) console.error(`      ${row}`);
  return gzBytes > BUDGET_GZ_BYTES
    ? [`bundle is ${(gzBytes / 1024).toFixed(2)} KiB gz, budget is 350 KiB gz`]
    : [];
};

/** Module 14 §4.1: no secret value may appear in the built bundle. */
checks.secrets = () => {
  const failures = [];
  const envPath = join(ROOT, '.env.example');
  const needles = [];

  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      // Only identifiers that name a credential, and only non-trivial values.
      // A public origin like ALLOWED_ORIGINS is meant to appear in the app.
      if (!/(?:SECRET|KEY|TOKEN|PASSWORD)/i.test(key)) continue;
      if (value.length < 8) continue;
      needles.push({ label: `${key} (from .env.example)`, value });
    }
  }

  const bundleFiles = existsSync(DIST_DIR) ? walk(DIST_DIR, ['.js', '.css', '.html']) : [];
  if (bundleFiles.length === 0) failures.push('no built bundle found to grep');

  // Provider-shaped credentials, in case a key is inlined without .env.example.
  const patterns = [
    { label: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
    { label: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { label: 'Meta key', re: /\bmeta_[A-Za-z0-9]{24,}\b/ },
  ];

  for (const file of bundleFiles) {
    const text = readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (text.includes(needle.value)) failures.push(`${rel(file)} contains ${needle.label}`);
    }
    for (const { label, re } of patterns) {
      if (re.test(text)) failures.push(`${rel(file)} matches ${label}`);
    }
  }
  return failures;
};

/** Module 14 §4.2: the static origin ships the header set it documents. */
checks.headers = () => {
  const headersPath = join(ROOT, 'packages', 'web', 'public', '_headers');
  if (!existsSync(headersPath)) return ['packages/web/public/_headers is missing'];
  const text = readFileSync(headersPath, 'utf8');
  const required = [
    ['Content-Security-Policy', /Content-Security-Policy:\s*\S+/],
    ["default-src 'self'", /default-src 'self'/],
    ["object-src 'none'", /object-src 'none'/],
    ["frame-ancestors 'none'", /frame-ancestors 'none'/],
    ['worker-src', /worker-src 'self'/],
    ['X-Content-Type-Options', /X-Content-Type-Options:\s*nosniff/i],
    ['Referrer-Policy', /Referrer-Policy:\s*\S+/i],
    ['Permissions-Policy', /Permissions-Policy:\s*\S+/i],
  ];
  const failures = required
    .filter(([, re]) => !re.test(text))
    .map(([label]) => `_headers is missing ${label}`);
  // A wildcard CORS origin would undo the allow-list (Module 14 §4.2).
  if (/Access-Control-Allow-Origin:\s*\*/i.test(text)) {
    failures.push('_headers sets Access-Control-Allow-Origin: *');
  }
  return failures;
};

// ------------------------------------------------------------------------ main

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const selected = onlyArg
  ? onlyArg.slice('--only='.length).split(',').map((name) => name.trim()).filter(Boolean)
  : Object.keys(checks);

let failed = 0;
for (const name of selected) {
  const check = checks[name];
  if (!check) {
    console.error(`unknown check "${name}" (known: ${Object.keys(checks).join(', ')})`);
    failed++;
    continue;
  }
  const failures = check();
  if (failures.length === 0) {
    console.error(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}`);
    for (const failure of failures.slice(0, 20)) console.error(`          ${failure}`);
    if (failures.length > 20) console.error(`          ... and ${failures.length - 20} more`);
  }
}

if (failed > 0) {
  console.error(`\nfitness: ${failed} of ${selected.length} check(s) failed.`);
  process.exit(1);
}
console.error(`\nfitness: ${selected.length} check(s) passed.`);
