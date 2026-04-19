# Next session handoff — Sparrow-style repack spike

**Date written:** 2026-04-19
**Previous session ended at commit:** `fcbff99` (research-only).
**Branch:** `refactor/rf-engine`.
**Current toolchain:** rustc 1.95.0.

## TL;DR for next session

Start a scoped spike that adds a bounded sparrow-style fixed-bin repack
routine, reusing the existing BPP sparrow port under
`engine/crates/rema-layout/src/infrastructure/search/gls/`. Wire it
into Tier 6's receiver-repack portfolio and the single-bin
materialization path. Don't touch FFD's hot probe loop. Budget
400-700 LOC. If the spike can't lift the single-bin diagnostic above
~28 parts, fall back to porting legacy NFP directly.

## Where we are right now

Shipped this session:

- Commit `d0c0ecf` — Task 19d: `rectangle-pack` → `bin-packing` 0.3.0
  MaxRects BSSF. Single-bin Fab Score 51 → 71 (beats legacy's 57).
- Commit `0b81e9d` — S3 backend service spec + plan + dual sign-off docs.
- Commit `d4378c7` — Tier 6: `consolidate_tail_bin` operator. 2-bin
  split moved 12/25 → 13/24. Parity 27/27.
- Commit `fcbff99` — Sparrow scoping research (this commit).

Production benchmark state (`revised_sizes_rev1.csv`, 37 parts, 2×
78"×396" rolls):

| Metric | Rust (current) | Legacy | Gap |
|---|---:|---:|---:|
| Single-bin placed | 13/37 | 33/37 | -20 |
| Single-bin Fab Score | **71** ✓ | 57 | +14 |
| 2-bin Fab Score | 46 | 52 | -6 |
| 2-bin tail remnant (roll-2) | 0.01" | 125.63" | -125.62" |

Rust now beats legacy on single-bin business metrics. The remaining
2-bin gap is a packer-quality ceiling — bin-packing's MaxRects family
can fit at most ~13 parts on one roll from this multiset, regardless
of strategy. Legacy's NFP engine fits 33. Closing the gap requires
a different algorithm family.

## What the research concluded (both agents)

- **Gemini** — GO. Projects single-bin 33-35, 2-bin 33/4-35/2, Fab
  52-54. Continue extraction pattern from Tasks 5-13 into `search/gls/`.
- **Codex** — GO on scoped spike only. Upstream sparrow is SPP
  (strip-packing), not BPP, and its outer loop (strip shrink) doesn't
  fit REMA's fixed-bin objective. Realistic: 28-31 parts on single
  bin. Scope 400-700 LOC for spike, 900-1400 for full integration.
- Sparrow repo verified: alive, MIT, 232 stars, last push 2026-04-09.
- Sparrow `[lib]` exists (contra initial impression) but the public
  API (`sparrow::optimizer::optimize()` on `SPInstance`) is wrong-
  problem-type for REMA.
- REMA already owns a BPP-shaped sparrow port under
  `engine/crates/rema-layout/src/infrastructure/search/gls/` from
  Tasks 5-13. Reuse that, don't adopt upstream wholesale.

## Recommended first steps for the new session

### Step 1: re-read key docs (15 min)

- `.claude/research/sparrow-integration/codex-report.md` (2146 words,
  most actionable).
- `.claude/research/sparrow-integration/gemini-report.md` (complementary
  view; more optimistic).
- `.claude/research/tier6-tail-remnant/decision.md` — context on why
  the current packer hits a ceiling.
- `.claude/research/19d-packer-choice/decision.md` — Task 19d history.

### Step 2: inventory the existing BPP sparrow port (20 min)

Files under `engine/crates/rema-layout/src/infrastructure/search/gls/`:
- `separator.rs` — per-bin separate-and-compress loop (Tasks 5-7).
- `explore.rs` — exploration phase wrapper.
- `compress.rs` — compression phase (currently an identity pass per
  Codex notes).
- `pair_matrix.rs` — penalty-weighted loss tracking.

Question to answer before writing any code: is `Separator::separate`
callable from `warm_start.rs` with a fixed-width bin, or is it
wired assumptions-deep into the multi-bin orchestrator in
`search/multi.rs`?

### Step 3: design the spike (30 min, possibly another round of
Codex/Gemini if the integration seam isn't clear)

Minimum viable spike:

1. New function `fixed_bin_sparrow_repack(bin, items, clearance, budget_ms)`
   in `warm_start.rs` (or a new `sparrow_repack.rs` module).
2. Internally: builds a `jagua-rs::probs::bpp::BPInstance` with a
   single fresh bin and the full multiset. Calls into the existing
   separator with a bounded budget and fixed seed.
3. Returns `SeedResult` compatible with today's output contract.
4. Wire into two call sites:
   - `cross_bin_swap.rs::consolidate_tail_bin` receiver portfolio
     (alongside BSSF/BottomLeft/Auto).
   - `pack.rs` or `multi.rs` for single-bin jobs where the full
     multiset is known upfront.
5. Gate behind a feature flag / config knob so it can be disabled
   quickly if parity breaks.

### Step 4: bench + parity check (30 min)

Before and after each integration step:
- `npx tsx tools/bench-production/bench.ts /Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv --bins 1`
- `npx tsx tools/bench-production/bench.ts /Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv`
- `npm run test:parity` (must stay 27/27)
- `cargo test --manifest-path engine/Cargo.toml --release` (must stay all-green)

### Step 5: commit strategy

Follow the Tier 6 / Task 19d cadence:
- Commit 1: minimal spike (repack routine + Tier 6 wiring only).
  Measure.
- Commit 2: single-bin materialization path + broader breadth.
  Measure.
- If single-bin diagnostic lifts above 28 parts: continue refining.
- If it stalls at or below 28: pivot to porting legacy NFP.

## Success criteria

- **Acceptance (minimum):** 2-bin Fab Score lifts from 46 to ≥ 50 AND
  parity suite stays 27/27 AND runtime stays < 1500ms per 37-part 2-bin
  request.
- **Stretch:** Fab Score matches or beats legacy (≥ 52). Tail remnant
  on roll-2 > 100".
- **Kill criterion:** After Commit 2, if Fab Score < 48 or single-bin
  placed count is < 25, stop and re-scope to legacy NFP port.

## Open decisions that don't need to block the spike

- Rotation: current `can_rotate=false`. Sparrow does continuous
  rotation natively. Leaving rotation disabled in v1 is OK; the spike's
  algorithmic gain should come from LNS + sampling even without
  rotation. Rotation can be a follow-up.
- Budget plumbing: spike can hard-code a 500ms budget; generalize
  later.
- Determinism: upstream sparrow uses rayon + float comparisons that
  aren't bit-identical across environments. Our BPP port already
  made determinism-focused choices. Keep the port; don't introduce
  upstream's parallelism.

## What NOT to do in the new session

- **Don't** replace `bin-packing` BSSF in the FFD probe loop. That's
  the Codex red flag — FFD runs `greedy_bottom_left` many times per
  request and sparrow-style iterative search is too slow there.
- **Don't** add `sparrow` as a crate dependency. Our BPP port already
  has the relevant code; adding upstream would duplicate + reintroduce
  the SPP/BPP mismatch.
- **Don't** touch rotation end-to-end yet. The parity suite isn't
  rotation-stress-tested.
- **Don't** skip the `cargo test --release` run — rustc 1.95 release
  mode is sensitive to edge cases we already fixed once
  (pair_matrix should_panic gating, cancel test fixture).

## Quick orientation commands for the new session

```bash
# From /Users/danielmartinezjulio/Work/arc and anchor/rema-portal/

# Current state
git log --oneline -6
git status

# Recent bench (should match tables above)
npx tsx tools/bench-production/bench.ts \
  /Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv

# Parity baseline (must stay 27/27)
npm run test:parity

# Rust tests baseline (all must pass, release mode specifically)
cargo test --manifest-path engine/Cargo.toml --release
```

## Relevant memory

User preferences already saved to global memory:

- Never add `Co-Authored-By` to commits.
- Research before trial-and-error hacking — dispatch Codex + Gemini
  in parallel on non-trivial problems.
- Run `coderabbit review --plain -t uncommitted` before committing.
- Archive research scratch post-commit (move to `archive/` subdirs
  once task ships).
- Update directory READMEs when adding code in the same commit.
- Delete obsolete code when a replacement ships — don't leave old
  implementations as "optional fallback" long-term.

## Pending tasks (task tool)

| # | Status | Subject |
|---|---|---|
| 48 | pending | Sparrow integration (future) — close the packer-ceiling gap |

Task 48 is the umbrella; the new session should break it into concrete
sub-tasks when scoping the spike.
