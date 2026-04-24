# `.claude/scripts/`

Automation scripts for Claude Code sessions. Checked in so they run consistently across machines; the transient scratch directories under `.claude/` (handoff, research, worktrees, tmp) are what `.gitignore` excludes.

## `openclaw-triage-issue.sh`

Triage ONE GitHub issue via OpenClaw (Kimi K2.6 cloud, bound to the `triage` agent). Refines the description, recommends labels, estimates story points (Fibonacci) and priority (P0-P3), and posts a triage comment with area-of-codebase / suggested approach / risks notes.

```bash
# Preview only — nothing applied (default)
.claude/scripts/openclaw-triage-issue.sh 101

# Preview, then prompt for [y/N] before applying
.claude/scripts/openclaw-triage-issue.sh 101 --apply

# Apply without asking (use for batch / scripted flows)
.claude/scripts/openclaw-triage-issue.sh 101 --yes
```

**What gets changed on apply:**
- Issue body — rewritten with `## Context / ## Acceptance criteria / ## Done when` sections.
- Labels — additive only (existing human-applied labels preserved). Adds recommended labels + `pts-N` + `prio-pN`.
- Trail comment — `🦞 Triaged via OpenClaw: pts-5, prio-p2. <rationale>` for audit.

**Runtime:** ~20-40s per issue on kimi-k2.6:cloud.

**Requirements:**
- OpenClaw gateway running (`openclaw gateway status`).
- `triage` agent bound to `ollama/kimi-k2.6:cloud` (`openclaw agents list` to verify).
- `gh` authenticated with `repo` scope.
- `jq`, `python3` on PATH.

## `openclaw-triage-batch.sh`

Run the single-issue triage in preview-only mode across all open issues (or a limited subset) and dump every result to one markdown file under `.claude/reports/`. Nothing is applied — review the report, then invoke `openclaw-triage-issue.sh <N> --apply` one-by-one for the issues you accept.

```bash
# All open issues -> .claude/reports/openclaw-triage-YYYY-MM-DD-HHMM.md
.claude/scripts/openclaw-triage-batch.sh

# Just the first 5
.claude/scripts/openclaw-triage-batch.sh --limit 5

# Include closed issues too
.claude/scripts/openclaw-triage-batch.sh --state all
```

**Runtime:** `issues × ~30s`. 30 issues ≈ 15 min. Safe to let run unattended — nothing is mutated until you manually apply suggestions.

## Label taxonomy

Story points are applied as labels `pts-1`, `pts-2`, `pts-3`, `pts-5`, `pts-8`, `pts-13` (Fibonacci).

Priority tiers are applied as labels `prio-p0` (incident), `prio-p1` (high), `prio-p2` (normal), `prio-p3` (low).

These are auto-created on the repo at `Arc-and-Anchor/rema-portal`.
