# .claude/research/

Ephemeral scratch from the multi-agent workflow. Reports from Gemini/Codex/code-reviewer get dropped here during research + review rounds, then referenced from the committed plan docs under `docs/superpowers/plans/`.

## Convention

- **Active task** lives at the top level (e.g. `task7/`).
- **Shipped tasks** move to `archive/` once the task commits. Keeps `ls` clean while preserving the audit trail — the committed commit messages and plan docs reference these files, so moving them rewrites a few paths but nothing code depends on them.
- **Cross-cutting scratch** (like `openclaw-skills/`) stays at the top level since it's not task-scoped.

## Pattern per task

```
task<N>/
├── gemini-report.md          # initial deep-read
├── codex-report.md           # independent second opinion
├── synthesis.md              # optional — Claude reconciling the two
├── gemini-signoff.md         # plan sign-off from Gemini
├── codex-signoff.md          # plan sign-off from Codex
├── codex-impl-review.md      # post-implementation code review
├── gemini-drift-check.md     # post-implementation drift check
└── (more review gate reports as needed)
```

Archived research is committed to git so the plan docs + commit
messages that reference these paths keep resolving indefinitely.
Active (top-level, in-flight) research is left untracked — it only
enters git when the task ships and its scratch moves under
`archive/`.
