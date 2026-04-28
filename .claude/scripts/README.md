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

## `openclaw-triage-watch.sh` + `ai.openclaw.triage-watch.plist`

Poll-based auto-triage for **newly created** issues across every (repo, project) target listed in `openclaw-targets.tsv`. Runs every 15 minutes via LaunchAgent, calls `openclaw-triage-issue.sh <N> --yes` with per-target env-var overrides. Bootstraps the watermark *per repo* on first sight — existing issues in newly-added targets are never retroactively triaged.

State files: `~/.openclaw/state/triage-last-seen-<owner>-<repo>.txt` (one per repo, UTC ISO-8601).
Logs: `/tmp/openclaw/triage-watch.log`.

```bash
# One-time install (per-user)
cp .claude/scripts/ai.openclaw.triage-watch.plist ~/Library/LaunchAgents/
# edit WorkingDirectory in the plist if your clone path differs
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.triage-watch.plist
launchctl kickstart -k gui/$UID/ai.openclaw.triage-watch

# Status / uninstall
launchctl list | grep openclaw
launchctl bootout gui/$UID/ai.openclaw.triage-watch
rm ~/Library/LaunchAgents/ai.openclaw.triage-watch.plist
```

Bot-authored issues (dependabot, renovate, coderabbitai, github-actions, anything `*[bot]`) are skipped — their bodies are already structured and triaging them adds noise.

**First-run behavior** *(per target)*: script writes the current UTC timestamp to `~/.openclaw/state/triage-last-seen-<owner>-<repo>.txt` and skips that repo for the tick. Nothing pre-existing gets touched. Adding a new target row is safe — only issues created after the bootstrap moment will be triaged.

## `openclaw-targets.tsv`

Single source of truth for which repos the watcher polls and which Project v2 each repo's triage output lands in. Tab-separated, one row per (repo, project) pair. Comment lines start with `#`.

Columns: `repo`, `project_id`, `prio_field_id`, `pts_field_id`, `stack_hint`.

To add a new target:

1. Look up the project + field ids:
   ```bash
   gh api graphql -f query='query { node(id:"PVT_xxx") { ... on ProjectV2 { fields(first:30) { nodes { __typename ... on ProjectV2FieldCommon { id name } } } } } }'
   ```
2. Make sure the project's Priority field has options `P0/P1/P2/P3` and Story Points has `1/2/3/5/8/13`. Mirror project 9's option metadata if creating from scratch — see the field-id audit log inside the TSV.
3. Append a row.
4. Next tick (≤15 min) bootstraps the new target's watermark; the tick after that will start triaging.

## Story points + priority

Both live in the target Project v2's native single-select fields, not as labels. The triage script:

- Asks Kimi to pick `story_points` (one of `pts-1/2/3/5/8/13`) and `priority` (one of `prio-p0/p1/p2/p3`).
- Validates them against the allowed sets.
- Maps `pts-5` → `5` and `prio-p1` → `P1`, looks up the option ids in the project's Priority + Story Points fields (live, every run, so option-id rotation by a project admin doesn't silently break things), and updates the project item.

This means each target project must have a Priority field with `P0/P1/P2/P3` options and a Story Points field with `1/2/3/5/8/13` options. Project 9 (Rubberfit) and project 10 (Rubberfit-Desktop) both have these — mirror their option metadata when adding more targets.

## Issue labels

The labels Kimi adds to the issue itself come from each repo's existing `gh label list` taxonomy (excluding `pts-*` / `prio-*` since those are project-field-only). New target repos use whatever labels they have; the script will not auto-create the kind-label taxonomy.
