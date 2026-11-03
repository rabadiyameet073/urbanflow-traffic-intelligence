# Skill: component-creation

**Use when:** Creating a new UI component.

**Read first:** `technical-architecture/30`, `languages-and-tooling/50`, `languages-and-tooling/51`

## Rules

1. One folder per component: `x.ts`, `x.css`, `x.test.ts`; export `create(props) -> {el, update, destroy}`.
2. Build DOM with `createElement` helpers, not `innerHTML` with data (XSS).
3. Props are typed and validated at boundaries; `update` is cheap and idempotent.
4. `destroy` removes listeners and observers.
5. Accessible name, role and keyboard behaviour defined before styling.
6. Add to the component gallery page used by visual tests.

## Good / Bad

- ✅ `const card = createKpiCard({label:'Delay', unit:'s'}); card.update({value:12.3});`
- ❌ Appending strings of HTML containing user or model text.

## Landmines

- AI/chat text must be inserted with `textContent` (or sanitised Markdown subset), never `innerHTML`.
