# Muse Code — development use

**Development-time only.** Nothing in this file runs in production.

## What Muse Code Was Used For

| Task | Delegation |
|---|---|
| Implementing specification modules | Structured spec pack → file-level implementation, module by module |
| Independent differential checks | A second implementation of a pure helper compared against the first when a result looked suspicious |
| Review passes | Reading back a diff against the module it was supposed to satisfy |

## Where It Earned Its Keep

Three defects in this repository were found by *disbelieving a number*, not by
reading code:

1. A benchmark reporting 55–87 % denied arrivals. The numbers were internally
   consistent, so nothing failed — they were simply implausible. Tracing per-vehicle
   state showed every second vehicle pinned at the same position with zero
   velocity, which led to the inverted leader-gap sign.
2. Three sweep rows with identical means and zero-width intervals. Identical
   results across a parameter sweep are a code smell, not a finding.
3. A results table whose stated verdict contradicted its own columns.

## The Rule That Made This Work

**An implementation agent may not be the sole author of a number it also
reports.** Every published figure is produced by a command (`pnpm bench`) and
diffed against the documents by `pnpm docs:check`. The agent writes code; the
code writes the number.

That is why a benchmark artefact is never hand-edited, and why
`packages/bench/out/` is committed rather than ignored: the artefact has to be
inspectable for the claim to be checkable.
