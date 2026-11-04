# Documentation

Everything here describes the system as it actually is. Measured numbers come
from committed benchmark artefacts, not prose; where a claim cannot be
verified from this repository it is either absent or flagged in
[validation/LIMITATIONS.md](validation/LIMITATIONS.md).

## By topic

**design/** — how the system is built
- [ARCHITECTURE.md](design/ARCHITECTURE.md) — components, data flow, determinism guarantees
- [API.md](design/API.md) — routes, wire contracts, error codes
- [DATA_DICTIONARY.md](design/DATA_DICTIONARY.md) — every stored field, its unit and its source
- [DISTRIBUTED_AND_SECURITY_GUIDE.md](design/DISTRIBUTED_AND_SECURITY_GUIDE.md) — file-by-file walkthrough of the distributed and security code, with direct links into the tree

**validation/** — how we know it works, and where it stops
- [SAFETY_CASE.md](validation/SAFETY_CASE.md) — invariants I1–I6 and their evidence
- [RESULTS.md](validation/RESULTS.md) — the benchmark ledger (generated; checked against `packages/bench/out/` by `pnpm docs:check`)
- [TEST_REPORT.md](validation/TEST_REPORT.md) — every test suite and its status
- [LIMITATIONS.md](validation/LIMITATIONS.md) — the honest boundaries; read this before repeating any claim
- [ACCESSIBILITY.md](validation/ACCESSIBILITY.md) — what meets WCAG, what was not verified
- [AUDIT_LOG.md](validation/AUDIT_LOG.md) — dated record of audit runs and corrected claims

**hackathon/** — submission material
- [DEMO_SCRIPT.md](hackathon/DEMO_SCRIPT.md) — timed 3-minute script
- [SUBMISSION_FIELDS.md](hackathon/SUBMISSION_FIELDS.md) — portal fields mapped to repo evidence
- [META_API_NOTES.md](hackathon/META_API_NOTES.md) — how Meta AI (Muse) tooling was used, with recorded requests
- [CREDITS.md](hackathon/CREDITS.md) — third-party assets, models and licences

## Reference material (provenance, not current spec)

- [adr/](adr/README.md) — the 21 architecture decision records, in order
- [runbooks/](runbooks/) — deploy guide plus seven operational runbooks
- [presentation/](presentation/) — slide-deck outline, .pptx and its generator
- [muse-prompts/](muse-prompts/) — the versioned prompts behind each AI surface
- [specs/instruction/](specs/instruction/README.md) — the full engineering specification pack (modules 01–64)
- [reference/](reference/) — the original source briefs and hackathon rules the project grew from
- [assets/](assets/) — architecture.png and junction.png

If you are evaluating the project: start with the
[root README](../README.md), then RESULTS.md, then LIMITATIONS.md.
