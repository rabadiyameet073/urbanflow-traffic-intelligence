# Credits & Licensing

Project licence: **MIT** (see [LICENSE](../../LICENSE)).

This file records the third-party components the project depends on and their
licence class, per Module 57 §5. It states the *policy* and credits the named
tools, models, datasets and fonts.

> **Verification pending (Rule 00).** Module 57 §5 asks that the exact licence of
> every transitive dependency be produced by an automated scan
> (`license-checker` for the JS tree, `pip-licenses` for the Python tree) and its
> output committed here. That scan has **not** been run — it requires a terminal
> and a fresh install, which were not permitted in this pass. The classes below
> are the ones declared in the Module 57 registry and each project's own licence;
> the machine-generated inventory must be pasted in before submission and this
> note removed. Do not treat the absence of a listed licence here as a claim that
> a scan passed.

## Runtime libraries

| Component | Licence class | Notes |
|---|---|---|
| `zod` | MIT | Validation / contracts everywhere |
| Vite | MIT | Web build + dev server |
| TypeScript | Apache-2.0 | Compiler for all TS packages |
| Vitest | MIT | Test runner |
| `@types/node` | MIT | Node type definitions |
| PySpark | Apache-2.0 | Stream processing (JVM runtime) |
| `pyarrow` | Apache-2.0 | Parquet reader/writer |
| Apache Kafka (KRaft image) | Apache-2.0 | `apache/kafka:3.8.0` |
| Hadoop/HDFS (opt-in `hdfs` profile) | Apache-2.0 | `apache/hadoop:3.4.1` |

## One item to review before shipping

- **MinIO** (opt-in `s3` profile, `RELEASE.2025-04-22T22-12-26Z`) is **AGPL-3.0**.
  Module 57 §5 disallows strong-copyleft licences *in shipped code*. MinIO is not
  linked into or distributed with the product — it is an optional, separately
  pulled container a developer can start locally to point the lake at an S3
  target; the default path writes Parquet to a named volume and needs no MinIO.
  Because nothing AGPL-licensed is shipped or redistributed, the §5 rule is not
  triggered, but the profile is flagged here rather than buried so a human can
  confirm that reading before submission.

## AI & vision services

Named only where actually used (Module 43 §7 narrative discipline).

- **Meta Model API — `muse-spark-1.3`** — copilot (advisory only).
- **Muse Code** — used to build the project.
- **SAM 3.1** — offline segmentation; licence accepted on Hugging Face (a human
  must accept the model terms; see the model card).
- **Muse Image** — synthetic scene generation; prompts stored, generated images
  only.
- **Llama (open weights)** — fallback on Workers AI / Ollama (dev).

Model licences are accepted by a human and their terms followed; they are not
"permissive code licences" and are listed separately for that reason.

## Fonts

- **Inter** — SIL Open Font License 1.1.
- **JetBrains Mono** — SIL Open Font License 1.1.

Both are self-hosted (subset); their licences accompany the files.

## Datasets

Optional offline reference datasets (UTD19, PeMS, METR-LA) are **not** shipped or
presented as live data; if used for calibration their registration terms are
honoured and cited.
