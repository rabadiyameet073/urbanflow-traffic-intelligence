# Module 63: Code Review Standards

> Review is a design activity, not a typo hunt. Humans and agents review against the same checklist. Self-review before requesting review is mandatory.

---

## 1. Review Order (high → low value)

1. **Correctness & safety** — does it do what the task says; can it violate I1–I6, determinism, or the AI boundary?
2. **Contracts & boundaries** — validation at edges, schema versions, error envelope, units in names.
3. **Design** — fit with module 10/11, coupling, naming, smallest sufficient change.
4. **Tests** — do they fail without the change; do they cover edges; are they deterministic?
5. **Security & privacy** — module 14 checklist.
6. **Performance** — budgets (module 15); allocations in hot paths.
7. **Accessibility & design fidelity** — tokens, keyboard, contrast, motion.
8. **Docs & tracking** — docs updated, tasks.json updated.
9. **Style** — only what the linters cannot enforce.

---

## 2. Reviewer Checklist

### 2.1 Safety & Determinism
- [ ] Signals change only via the Kernel; no new writer to `SignalState`.
- [ ] Any new controller output is a *request*; Kernel can reject it.
- [ ] No time/random/DOM/network in `core`.
- [ ] No iteration over unordered collections affecting results.
- [ ] Hash-affecting changes accompanied by updated golden hashes **and** an explanation.

### 2.2 AI Boundary
- [ ] Model output validated by zod; bounded; fallback path exists and is tested.
- [ ] Prompt has no secrets; user text is delimited as data.
- [ ] No new tool that mutates state without Human Approve.

### 2.3 Interfaces
- [ ] Inputs bounded (size, range, count); numbers `.finite()`.
- [ ] Errors use the catalogue codes; no stack traces to clients.
- [ ] Backwards-compatible or version-bumped with migration note.

### 2.4 Tests
- [ ] Regression test for bugs; property test for invariants.
- [ ] No sleeps; no real network; seeds logged.
- [ ] Coverage of error paths, not just happy path.

### 2.5 Frontend
- [ ] Semantic HTML; keyboard operable; visible focus; labels.
- [ ] Tokens only; both themes; reduced-motion respected.
- [ ] Redundant encoding (not colour alone).
- [ ] No layout shift; canvas redraw bounded; listeners cleaned up.

### 2.6 Data/Pipeline
- [ ] Schema versioned; DLQ for bad records; watermark/window pairing.
- [ ] Idempotent writes; partitioning documented; Lite parity maintained.

### 2.7 Docs
- [ ] Behaviour change reflected in docs and ADR if architectural.
- [ ] Numbers generated; limitations updated.

---

## 3. Comment Etiquette

| Prefix | Meaning | Blocks merge? |
|---|---|---|
| `blocker:` | Violates a Rule, breaks safety/correctness/security | Yes |
| `issue:` | Likely defect or missing test | Yes |
| `suggestion:` | Better approach, author decides | No |
| `question:` | Reviewer needs context | Until answered |
| `nit:` | Minor style | No |
| `praise:` | Call out good work | No |

Rules: comment on the code, not the person; explain *why* and offer an alternative; one comment per issue; author replies with commit hash when fixed.

---

## 4. Author Obligations

1. PR/commit description: what, why, how verified (paste summary of `pnpm verify`), risks, screenshots for UI.
2. Keep diffs small (< ~400 changed lines excluding generated/lockfiles); split otherwise.
3. Self-review the diff first; remove debug code.
4. Respond to all comments; do not force-push over review history without telling the reviewer.

---

## 5. Agent-Generated Code: Extra Scrutiny

Agent diffs get the same review plus:
- [ ] Hallucinated APIs/packages (verify they exist in the lockfile/docs).
- [ ] Over-broad `catch`, defensive code that hides bugs.
- [ ] Tests that assert the implementation rather than the requirement.
- [ ] Silent scope creep (files touched that the task did not need).
- [ ] Copied licensed snippets; unknown provenance.
- [ ] Invented numbers/URLs in docs.

---

## 6. Merge Criteria

All of: gates green (module 61 §1), no unresolved `blocker/issue`, tasks.json updated, human maintainer approval for changes touching `core/control/kernel`, `contracts`, `edge/evp`, `security`, or CI config (**CODEOWNERS** enforces).

---

## 7. Anti-Patterns

| ❌ | ✅ |
|---|---|
| Rubber-stamp approvals | Checklist with evidence |
| Style bikeshedding | Let Prettier/ESLint decide |
| Mega-PRs | Split by concern |
| Reviewing only the diff, not the callers | Read affected call sites |
| Approving with "will fix later" for safety issues | Block until fixed |
