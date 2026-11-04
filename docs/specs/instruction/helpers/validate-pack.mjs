// @ts-check
/**
 * Validates this instruction pack: tasks.json integrity, relative links, README index,
 * skill/rule structure, Mermaid block counts, residue from other projects.
 * Usage: node helpers/validate-pack.mjs [pack-root]   (default: parent of this file)
 * Exit 0 = valid, 1 = problems found.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, '..'));
/** @type {string[]} */
const problems = [];
const bad = (msg) => problems.push(msg);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(root);
const md = files.filter((f) => f.endsWith('.md'));

// ---- tasks.json -------------------------------------------------------------
const tasksPath = join(root, 'state of agent', 'tasks.json');
if (!existsSync(tasksPath)) {
  bad('missing state of agent/tasks.json');
} else {
  try {
    const doc = JSON.parse(readFileSync(tasksPath, 'utf8'));
    for (const k of ['project', 'tracker_version', 'source_of_truth', 'summary', 'session', 'workflow', 'tasks']) {
      if (!(k in doc)) bad(`tasks.json: missing key ${k}`);
    }
    for (const k of ['branch', 'tip', 'unpushed', 'next_up', 'pending_verifications', 'last_updated', 'updated_by']) {
      if (!(k in (doc.session ?? {}))) bad(`tasks.json: session.${k} missing`);
    }
    const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
    const ids = new Set();
    const statuses = ['backlog', 'in_progress', 'done', 'blocked', 'cut'];
    const counts = { done: 0, in_progress: 0, backlog: 0 };
    for (const t of tasks) {
      if (ids.has(t.id)) bad(`tasks.json: duplicate id ${t.id}`);
      ids.add(t.id);
      if (!statuses.includes(t.status)) bad(`tasks.json: ${t.id} bad status ${t.status}`);
      if (!Array.isArray(t.acceptance) || t.acceptance.length === 0) bad(`tasks.json: ${t.id} has no acceptance criteria`);
      if (t.status === 'done' && (!Array.isArray(t.evidence) || t.evidence.length === 0)) bad(`tasks.json: ${t.id} done without evidence`);
      if (t.status in counts) counts[t.status] += 1;
    }
    for (const t of tasks) for (const d of t.depends_on ?? []) if (!ids.has(d)) bad(`tasks.json: ${t.id} depends on unknown ${d}`);
    if (counts.in_progress > 1) bad('tasks.json: more than one in_progress task');
    if (doc.summary?.total !== tasks.length) bad(`tasks.json: summary.total ${doc.summary?.total} != ${tasks.length}`);
    for (const k of ['done', 'in_progress', 'backlog']) {
      if (doc.summary?.[k] !== counts[k]) bad(`tasks.json: summary.${k} ${doc.summary?.[k]} != ${counts[k]}`);
    }
    if (!ids.has(doc.session?.next_up)) bad(`tasks.json: session.next_up ${doc.session?.next_up} is not a task`);
    // cycle detection
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const state = new Map();
    /** @param {string} id */
    const visit = (id) => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        bad(`tasks.json: dependency cycle at ${id}`);
        return;
      }
      state.set(id, 1);
      for (const d of byId.get(id)?.depends_on ?? []) visit(d);
      state.set(id, 2);
    };
    for (const id of ids) visit(id);
  } catch (e) {
    bad(`tasks.json: invalid JSON (${e instanceof Error ? e.message : e})`);
  }
}

// ---- relative links ---------------------------------------------------------
const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
for (const f of md) {
  const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(linkRe)) {
    const target = (m[1] ?? '').split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const p = resolve(dirname(f), decodeURIComponent(target));
    if (!existsSync(p)) bad(`broken link in ${relative(root, f)} -> ${m[1]}`);
  }
}

// ---- README index lists every file -----------------------------------------
const readmePath = join(root, 'README.md');
if (!existsSync(readmePath)) {
  bad('missing README.md');
} else {
  const readme = readFileSync(readmePath, 'utf8');
  for (const f of files) {
    const rel = relative(root, f).split('\\').join('/');
    if (rel === 'README.md') continue;
    const base = rel.split('/').pop() ?? rel;
    if (!readme.includes(rel) && !readme.includes(base)) bad(`README does not mention ${rel}`);
  }
  const rootFiles = readdirSync(root).filter((n) => statSync(join(root, n)).isFile());
  if (rootFiles.length !== 1 || rootFiles[0] !== 'README.md') bad(`root must contain only README.md (found: ${rootFiles.join(', ')})`);
}

// ---- rules and skills structure --------------------------------------------
const rulesDir = join(root, 'state of agent', 'rules');
if (existsSync(rulesDir)) {
  const rules = readdirSync(rulesDir).filter((n) => n.endsWith('.md')).sort();
  rules.forEach((n, i) => {
    const want = String(i).padStart(2, '0');
    if (!n.startsWith(`${want}-`)) bad(`rules: expected ${want}-*.md at position ${i}, found ${n}`);
    const t = readFileSync(join(rulesDir, n), 'utf8');
    if (!new RegExp(`^# Rule ${want} — .+\\(inviolable\\)`, 'm').test(t)) bad(`rules/${n}: bad title line`);
    for (const h of ['## Protocol', '## Good / Bad', '## Enforcement']) if (!t.includes(h)) bad(`rules/${n}: missing ${h}`);
  });
  if (rules.length !== 20) bad(`rules: expected 20, found ${rules.length}`);
}
const skillsDir = join(root, 'state of agent', 'skills');
if (existsSync(skillsDir)) {
  const names = readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory());
  const agents = readFileSync(join(root, 'state of agent', 'AGENTS.md'), 'utf8');
  for (const n of names) {
    const p = join(skillsDir, n, 'SKILL.md');
    if (!existsSync(p)) {
      bad(`skills/${n}: missing SKILL.md`);
      continue;
    }
    const t = readFileSync(p, 'utf8');
    if (!t.startsWith(`# Skill: ${n}`)) bad(`skills/${n}: bad title`);
    for (const h of ['## Rules', '## Good / Bad', '## Landmines']) if (!t.includes(h)) bad(`skills/${n}: missing ${h}`);
    if (!agents.includes(`\`${n}\``)) bad(`AGENTS.md skill index missing ${n}`);
  }
}

// ---- residue from other projects -------------------------------------------
const residue = /aethel|mentorship|early spring|rabadiya|next\.js|nextjs|tailwind/i;
for (const f of md) {
  const rel = relative(root, f);
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (residue.test(line)) {
      // Allowed only where we explicitly state a *rejection* (reconciliation table / ADR).
      if (!/reject|not used|no framework|instead of|escape hatch|forbidden|never/i.test(line)) bad(`residue ${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    }
  });
}

// ---- Mermaid inventory (render check is done separately with mmdc) ----------
let mermaid = 0;
for (const f of md) mermaid += (readFileSync(f, 'utf8').match(/^```mermaid$/gm) ?? []).length;

console.log(`pack root: ${root}`);
console.log(`files: ${files.length}  markdown: ${md.length}  mermaid blocks: ${mermaid}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('validate-pack: OK');
