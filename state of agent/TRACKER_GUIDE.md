# TRACKER_GUIDE.md — How `tasks.json` Works

`tasks.json` is the **single source of truth** for what is done, in progress, and next. Chat history is not.

---

## 1. Schema

```jsonc
{
  "project": "UrbanFlow AI",
  "tracker_version": 1,
  "source_of_truth": "state of agent/tasks.json",
  "summary": { "total": 20, "done": 0, "in_progress": 0, "backlog": 20 },
  "session": {
    "branch": "build/urbanflow",
    "tip": "",
    "unpushed": 0,
    "next_up": "T0",
    "pending_verifications": [],
    "last_updated": "2026-10-28",
    "updated_by": "<agent-or-human>"
  },
  "workflow": [ "…rules for the loop…" ],
  "tasks": [
    {
      "id": "T0",
      "title": "…",
      "status": "backlog | in_progress | done | blocked | cut",
      "priority": "P0 | P1 | P2",
      "cut_tier": "never | late | early",
      "depends_on": ["T-"],
      "acceptance": ["…checkable criteria…"],
      "evidence": [],
      "notes": ""
    }
  ]
}
```

## 2. Status Rules

| Status | Meaning |
|---|---|
| `backlog` | Not started |
| `in_progress` | Being worked; max one at a time |
| `blocked` | Waiting on something; `notes` says what and since when |
| `done` | All acceptance criteria met **and** evidence recorded (command + result + commit) |
| `cut` | Removed under Rule 15; LIMITATIONS updated; reason in `notes` |

`summary` counts must equal the task list (validated by `validate-pack.mjs`/CI).

## 3. Update Protocol

1. Before coding: set the task `in_progress`; update `session.next_up` if it changes.
2. After each verified milestone: append to `evidence` (`"pnpm verify green @abc1234"`).
3. On completion: `done`, update `summary`, choose the next task by dependencies and priority.
4. In the **same commit** as the change.
5. If new work is discovered: add a task (never hide scope in notes).

## 4. Choosing the Next Task

1. Any `pending_verifications` first.
2. Highest priority whose dependencies are `done`.
3. Prefer finishing the critical path (T1–T8, T11, T16–T18 are `never-cut`).
4. After the freeze: only fixes, docs, video, submission.

## 5. Task Catalogue

`tasks.json` is seeded with playbook tasks **T0–T19**; see the file for titles and acceptance criteria. Do not renumber; append new IDs.
