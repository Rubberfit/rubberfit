# Task 9 design — Gemini deep-read

## Context

S2.5 Tasks 5-8 shipped today (`c59be2f`, `2d01b09`, `b92bc2c`, `9eb2ab3`). Task 8 replaced the S2 passthrough in `search::optimize` with the real GLS pipeline. That exposed **three latent debug-only quality issues** that Task 8 mitigated with `warn!`/profile overrides. Task 9 must burn those down OR document clearly why they're acceptable long-term.

Parent plan Task 9 (lines 114-121):

> ### Task 9: S2.5a integration tests
> **Files:** `engine/crates/rema-layout/tests/gls_integration.rs`
> Steps:
> 1. Property test: across 100 random fixtures, GLS output never has colliding items.
> 2. Property test: GLS output density ≥ warm-start seed density.
> 3. Timing test: fast mode completes within budget + 10% slack.
> 4. Commit: `test(search): GLS property + timing tests`

After Task 9 ships, the `s2.5a-complete` git tag lands and S2.5a is done.

## The three burn-down items

Full details: `.claude/research/archive/task8/followups.md`. Quick summary:

### #1 — `custom_pipeline_matches_jaguars` hazard divergence

**Where:** `engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs:~105` + `gls/assertions.rs::custom_pipeline_matches_jaguars`.

**What:** Our ported `collect_poly_collisions_in_detector_custom` reaches the end-of-function diagnostic check with a hazard set that's strictly smaller than jagua's default `CDEngine::collect_poly_collisions` on the same `shape`. Task 8 observed the delta on `application::pack::tests::overflow_counted_when_bin_too_small`.

**Port status:** line-for-line identical to sparrow upstream `src/eval/specialized_jaguars_pipeline.rs`. Sparrow has the same `debug_assert!` and their test suite presumably doesn't exercise the triggering fixture.

**Mitigation:** Task 8 downgraded `debug_assert!` → `log::warn!` at the call site + kept the comparison returning a real bool.

### #2 — `separator.rs:~269` weighted-loss invariant violation

**Cascade of #1.** When the specialized pipeline undercounts hazards, sample evaluation returns artificially low loss; `move_items_multi` picks the "best-weighted-loss" worker based on those understated numbers; after adoption the TRUE weighted loss (via `CollisionTracker::get_total_weighted_loss`, which doesn't use the specialized pipeline) is higher than pre-iteration. Separator's `debug_assert!` fires.

**Mitigation:** Task 8 downgraded `debug_assert!` → `log::warn!`. Fixing #1 should automatically fix this.

### #3 — jagua-rs internal `qt_hazard.rs:111` assertion

**Where:** Internal to jagua-rs 0.7.1.

**What:** `assert!(constricted_hazards.iter().filter(|h| h.is_some()).count() > 0)`. Fires on `application::pack::tests::instance_indices_are_globally_unique_per_shape` (multi-part fixture with 0.125 clearance on 48×96 bin). Our usage produces zero constricted hazards; jagua expects at least one.

**Mitigation:** Task 8 added `[profile.test.package.jagua-rs] debug-assertions = false` in `engine/Cargo.toml`.

## Your assignment

Produce `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task9/gemini-report.md`. Cover:

### Part A — the three burn-down items

For each, attempt a **root-cause investigation** using the merged code + upstream sparrow at `/tmp/sparrow-research/sparrow/` + jagua-rs 0.7.1 at `/Users/danielmartinezjulio/.cargo/git/checkouts/jagua-rs-dd06f816230283bf/7552bd7/jagua-rs/`. For each item, answer:

1. **Is it a bug in our port, in sparrow upstream, in jagua, or legitimate behaviour?**
2. **Minimal reproducer** — smallest fixture that trips it.
3. **Proposed fix** — if you have one. If it requires upstream changes, say so.
4. **If we can't fix it now**, propose the right long-term disposition (e.g. document as known-limit and file upstream issue vs keep the mitigations forever).

### Part B — the three Task-9 property + timing tests

Parent plan says property test 2 is "GLS output density ≥ warm-start seed density." **Codex caught on Task 8 that single-bin GLS cannot improve density** because Separator preserves cardinality. So the density assertion is either trivially true (equality) or wrong. Refine:

- What property tests are genuinely meaningful for Task 9's scope (single-bin GLS integration)?
- The "100 random fixtures" requirement — do we need proptest, or is a handcrafted sequence of 10-20 fixtures with known properties enough?
- The "timing test" — what's the non-flaky way to assert this?

### Part C — `s2.5a-complete` tag criteria

Parent plan implies the tag lands at the end of Task 9. What should the tag criteria actually be, given the burn-down items? Proposal:

- **Block the tag** until all 3 burn-down items are either fixed or have an upstream-filed issue + our documented workaround. OR
- **Land the tag now** with a clear "known limitations" section in the commit message, and burn-down continues as Task 10+ prerequisites.

Argue one of these.

### Part D — deviations + plan

Standard plan doc outline: locked design, tests, implementation sequence, quality gates, commit message, sign-off.

## Output

Markdown at the path above. ≤2500 words. Concrete, with file:line refs. No source edits.
