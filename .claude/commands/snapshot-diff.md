---
description: Run an API-surface diff of the project — capture a fresh snapshot and compare to the most recent prior snapshot.
---

# /snapshot-diff

Capture a fresh API-surface snapshot of `src/` + `app/`, then diff it against the most recent prior snapshot. Use this to surface what changed (intended or unintended) after a refactor.

Underlying tooling: [`scripts/refactor/api-snapshot.ts`](../../scripts/refactor/api-snapshot.ts). Output lives in [`scripts/refactor/snapshots/`](../../scripts/refactor/snapshots/) (generated JSONs are gitignored; only `.gitkeep` is tracked).

## What you should do when this command is invoked

Follow these steps exactly:

### Step 1 — Inventory existing snapshots

Run:

```bash
ls -1 scripts/refactor/snapshots/*.json 2>/dev/null | sort
```

(or the PowerShell equivalent: `Get-ChildItem scripts/refactor/snapshots/*.json | Sort-Object Name`)

### Step 2 — Branch on what exists

- **Zero snapshots** → tell the user "No prior snapshot found." Run `npm run refactor:snapshot` to create the baseline. Tell the user: "Created baseline snapshot at `<path>`. Re-run `/snapshot-diff` after you make changes to see what differs." Stop here.

- **One snapshot exists** → the "before" baseline. Tell the user "Found 1 prior snapshot — using as baseline." Then continue to Step 3 (capture the after snapshot).

- **Two or more snapshots exist** → the **most recently modified** one is the "before" baseline. The diff will compare a new snapshot against it. Continue to Step 3.

### Step 3 — Capture the "after" snapshot

Run:

```bash
npm run refactor:snapshot
```

The script writes a new JSON to `scripts/refactor/snapshots/<UTC-timestamp>.json` and prints its absolute path on stdout. Capture that path — it's your "after."

### Step 4 — Diff the two snapshots

Compare the new "after" snapshot against the previous-most-recent "before" snapshot, **ignoring the `generated_at` field**. Two consecutive runs against the same SHA are byte-identical modulo that field, so any other change is a real change.

Suggested diff approach (jq-free, portable bash):

```bash
diff \
  <(grep -v '"generated_at"' "$BEFORE") \
  <(grep -v '"generated_at"' "$AFTER")
```

If you have `jq` available, prefer:

```bash
diff \
  <(jq 'del(.generated_at)' "$BEFORE") \
  <(jq 'del(.generated_at)' "$AFTER")
```

### Step 5 — Summarize for the user

**Do not dump the raw diff.** Instead, parse the diff and produce a structured summary:

```
Snapshot diff — <before-basename> → <after-basename>
  Export count: <before-count> → <after-count>  (delta: +N / -M)

  Added (N):
    - src/entities/.../foo.ts :: newMethod (class Money)
    - app/actions/bar.ts :: newAction
  Removed (M):
    - src/entities/.../baz.ts :: oldMethod (class Money)
  Changed (K):
    - src/application/services/qux.ts :: signature of `doThing` changed
    - <new>: (old → new)

  SHA: <before-sha> → <after-sha>
```

If there are **zero meaningful changes**, report it plainly:

```
Snapshot diff — <before> → <after>
  No API surface changes detected. SHA: <before-sha> → <after-sha>.
```

Zero-change is a useful signal — it confirms the refactor didn't accidentally drop or rename any exports.

### Step 6 — Highlight risk

If the diff shows **removed exports** or **changed signatures** that look unintentional (e.g., factories, public methods on aggregate roots, server actions, service interface methods), call them out at the top of the summary with a leading ⚠️. Examples of high-attention removals:

- Anything in `src/entities/value-objects/` — VO factories should not silently disappear
- Anything in `src/application/services/*.interface.ts` — service contracts breaking is significant
- Anything in `app/actions/*.ts` — server actions are RPC-callable and renaming them breaks clients

For intended renames, the user will tell you "yes, expected" — no further action needed.

## When NOT to use this command

- Before any work is done in the session — instead, run `npm run refactor:snapshot` to establish a baseline.
- For non-code changes (docs-only edits, configuration changes outside `src/`/`app/`).
- When you specifically want a quick callsite count — use `npm run refactor:callers -- --symbol <name>` instead.

## Notes

- Each invocation creates a new snapshot file. Old snapshots accumulate in `scripts/refactor/snapshots/`. They're gitignored, but periodically clean them up (`rm scripts/refactor/snapshots/*.json` — keeps `.gitkeep`).
- The snapshot run takes ~30 seconds on this repo (loads 800+ source files into ts-morph). Be patient; don't kill the process.
- If the snapshot fails (e.g., typecheck errors in the project preventing ts-morph from loading), report the error verbatim — don't try to "fix" it as part of this command. The user may have unrelated work in progress.
