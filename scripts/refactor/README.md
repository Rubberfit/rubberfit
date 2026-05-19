# scripts/refactor — ts-morph guardrail toolkit

Small TypeScript scripts that act as guardrails during refactors. They use [ts-morph](https://ts-morph.com/) — a type-aware TS compiler API wrapper — so they understand the project's type graph, not just text.

**These scripts do not edit code.** They emit reports — JSON snapshots and call lists — for you (or another agent) to consult while refactoring.

## Quick start

```powershell
# Snapshot the current API surface to a JSON file
npm run refactor:snapshot

# List every place that references a symbol (type-aware, skips strings/comments)
npm run refactor:callers -- --symbol Money

# List every reference into a file's exports
npm run refactor:callers -- --file src/entities/value-objects/money.ts
```

## The 3-step workflow during a refactor

1. **Snapshot the API surface BEFORE the refactor.**

   ```powershell
   npm run refactor:snapshot
   ```

   Emits `scripts/refactor/snapshots/<UTC-timestamp>.json` containing every exported class / function / type / interface / enum / const in `src/` and `app/`.

2. **The other session (or you) makes changes.**

3. **Snapshot again AFTER, and diff.**

   ```powershell
   npm run refactor:snapshot
   # then compare the two newest JSONs in scripts/refactor/snapshots/
   ```

   Any unintended API change (deleted method, renamed export, changed signature, dropped enum member) appears in the diff. Two consecutive snapshots against the same git SHA produce byte-identical JSON modulo the `generated_at` field, so noise in the diff means a real change.

Compare two snapshots ignoring metadata fields (PowerShell):

```powershell
$strip = { ($args[0] -split "`n") | Where-Object { $_ -notmatch '"generated_at"' } }
Compare-Object (& $strip (Get-Content -Raw before.json)) (& $strip (Get-Content -Raw after.json))
```

Or open both files in VS Code and use its built-in diff view (right-click → Compare Selected).

## When to reach for which script

| You want to know…                                     | Run                                     |
| ----------------------------------------------------- | --------------------------------------- |
| "What's the current public API surface?"              | `refactor:snapshot`                     |
| "Did anything unintended change after the refactor?"  | `refactor:snapshot` ×2 + diff           |
| "What breaks if I change this symbol's signature?"    | `refactor:callers -- --symbol X`        |
| "Who imports anything from this file?"                | `refactor:callers -- --file path/to.ts` |
| "Machine-readable output for piping to another tool?" | Add `--json`                            |

## ts-morph vs alternatives

- **`tsc --noEmit`** — ground truth for "does it compile." Always run this. Catches type errors. Does NOT catch dead exports, signature changes that other callers compensated for, or "you renamed the column but old code still grep-matches."
- **`grep` / ripgrep** — fast, purely syntactic. Catches strings in comments, JSON literals, docstrings — false positives during a rename.
- **`ast-grep`** — pattern-based AST search. Faster than ts-morph, no type info. Good for "every file with pattern X" when types don't matter.
- **`ts-morph` (this toolkit)** — type-aware. `Money` in a `.select("super_admin")` string literal does NOT count as a reference to `Money`, but `Money.fromCents(...)` does. Slower (loads the whole project) — worth it for refactor verification.
- **`jscodeshift` / `comby`** — codemod tools that auto-apply transforms. Not in v0. Future increments (`rename-symbol.ts`, `migrate-imports.ts`) may use ts-morph's transform API to fill that gap.

## Output guarantees

Both scripts produce stable, sorted output for clean diffs.

- `refactor:snapshot` → JSON file at `scripts/refactor/snapshots/<UTC-timestamp>.json`. Records sorted by `(file, kind, name)`. Methods within a class sorted with static-first then alphabetical. JSON indent: 2 spaces.
- `refactor:callers` → pretty text by default; `--json` for machine output. References sorted by `(file, line, column)`.

## Performance notes

ts-morph loads the entire project (tsconfig-aware) to resolve types correctly. First run is slowest (~30 s on this repo). Subsequent runs in the same shell are not cached — every invocation cold-loads. For an even-faster narrow-focus mode, edit the script to use `skipAddingFilesFromTsConfig: true` and manually add only `src/**` + `app/**` paths.

## What's NOT in v0

This toolkit is a **guardrail layer**, not a refactor automation layer. Deferred to future increments:

- `rename-symbol.ts` — auto-apply a type-aware rename across the codebase.
- `migrate-imports.ts` — change import paths in bulk.
- `orphans.ts` — find exports that aren't imported anywhere.
- Cross-repo (org-graph) tooling.
- MCP-server wrapping.

The full roadmap is in the career-track plan file (`career-track-ai-platform-projects.md` under `~/.claude/plans/`) — see Project 1.

## Files

| Path              | Purpose                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `api-snapshot.ts` | The snapshot generator. ~210 lines.                                                         |
| `find-callers.ts` | The reference walker. ~215 lines.                                                           |
| `snapshots/`      | Output directory. JSON files inside are gitignored; `.gitkeep` keeps the directory tracked. |
| `README.md`       | This file.                                                                                  |
