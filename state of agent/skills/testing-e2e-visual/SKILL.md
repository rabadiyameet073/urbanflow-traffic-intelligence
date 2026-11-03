# Skill: testing-e2e-visual

**Use when:** Writing Playwright, axe or visual regression tests.

**Read first:** `quality-and-audits/60`, Rule 13, Rule 19

## Rules

1. E1–E10 scenarios are the contract; add new ones under new IDs.
2. Use role/label locators; `data-testid` only when needed.
3. Deterministic seeds and frozen clock for visual tests; mask truly dynamic regions.
4. Run axe on every major state; zero serious/critical.
5. Screenshot baselines updated only after human review.
6. Run throttled profile for performance checks.

## Good / Bad

- ✅ `await expect(page.getByRole('button',{name:'Inject ambulance'})).toBeFocused()`
- ❌ `waitForTimeout(3000)`.

## Landmines

- Font loading changes baselines; wait for `document.fonts.ready`.
