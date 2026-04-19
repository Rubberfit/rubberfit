OpenAI Codex v0.107.0 (research preview)
--------
workdir: /Users/danielmartinezjulio/Work/arc and anchor/rema-portal
model: gpt-5.4
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019da382-7927-75f2-8ea7-a11263803508
--------
user
# Task 11 research — cross-bin swap operators (Codex voice)

## Context

Branch: `refactor/rf-engine`, HEAD = `d64a6d1` (Task 10 FFD shipped).
Workspace: `engine/` (Cargo). Parent plan:
`docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md`, Task 11 at
line 272.

Task 10 just landed `ffd_assign()` at
`engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`
as a pure deterministic function. Task 11's sibling operators
(`cross_bin_swap.rs`) slot into the same `assignment/` module.

Gemini is doing research in parallel. Your role: **independent
implementation-focused review** — anticipate the sharp edges, the
bugs that will bite us in impl, and the correctness invariants the
parent plan doesn't spell out.

## Your assignment

Write `.claude/research/task11/codex-report.md` — an
implementation-focused companion to Gemini's design report.

**Parent plan Task 11 spec:**

1. `swap_two(a_bin, b_bin)` — move one item from A to B and one from B to A, keep if global density improves.
2. `migrate(a_bin, b_bin)` — move N items from A to B, ignoring A's remainder. Used when closing a bin.
3. `unload_lightest_bin` — empty lowest-density bin into others.
4. Tests: handcrafted scenarios with known-optimal swaps.

## Key implementation questions to cover

1. **Cardinality invariant.** Task 10 already requires that FFD seeds
   every copy it routes (separator.rs:390 preserves placed
   cardinality). Cross-bin swaps must also preserve global
   cardinality: `sum(per_bin[i].placements.len()) + overflow.len()`
   must stay constant before/after any operator. Spell out exactly
   how each operator enforces this. What happens when `migrate` fails
   to fit some items in B — do they go back to A, to overflow, or
   error?

2. **Duplicate shape_id invariant.** `replay_seed_into_layout` at
   `search/mod.rs:144` errors on duplicate shape_id rows in a bin's
   item list. Cross-bin operators must maintain this. After a swap,
   both bins' item lists must still be dedupe-by-shape-id. Walk
   through the edge case: A has 3 copies of shape X + 1 copy of
   shape Y; B has 2 copies of shape X. What does swap_two(X_from_A,
   X_from_B) mean — net-zero swap (reject as no-op?) or reindex?

3. **Determinism under fixed seed.** Every cross-bin operator must
   be deterministic (bit-identical output for same inputs). Which
   items get picked for swap? If we iterate all (i, j) pairs, the
   order matters. Lock a tie-break rule.

4. **Fit-check cost.** The probe in Task 10 used
   `warm_start::greedy_bottom_left` (a fast greedy placer). For Task
   11, each operator may need hundreds of probes (unload scans all
   items). What's the CPU budget? Options:
     - `warm_start::greedy_bottom_left` — fast, but may false-reject
       (miss feasible placements that GLS would find).
     - `search::optimize` with 50ms budget — slow, more accurate.
     - Pure bbox feasibility (sum of areas fits in bin) — trivially
       fast, upper bound only.
   Recommend one, with concrete scenarios where each trade-off
   applies.

5. **Accept criteria.** "Global density improves" — how do we measure?
     - `sum_placed_area / sum_bin_area` across ALL bins?
     - Or only bins involved in the swap?
     - Or a weighted metric that rewards emptying a bin (which closes it)?
   Recommend a metric that aligns with our business goal (REMA is
   fabric cut planning — emptying a bin means returning it to stock).

6. **Infinite-loop prevention.** swap_two may swap X↔Y and then the
   next call swaps Y↔X (reverse). Do we need a tabu list, or does
   "accept only if density improves" (strict >) prevent cycling?
   Prove it.

7. **`unload_lightest_bin` termination.** When is the operator done?
   After emptying one bin, do we re-select the new lightest and
   repeat? Or single-shot? Recommend termination condition + test
   scenarios.

8. **Integration with pack.rs.** Where should these operators be
   called? Task 12 wires them into `search::optimize` but Task 11
   just builds the operators. For Task 11 testing, write standalone
   integration tests (not yet wired to pack.rs).

9. **Error handling.** Should operators return `Result<_, PackError>`
   with a specific variant for "no improvement possible", or just
   return `Option<NewAssignment>` where None means no-op? Recommend
   the cleaner Rust idiom.

10. **Invariant assertions.** What debug_asserts should each operator
    emit? (e.g. "placed cardinality unchanged", "no duplicate
    shape_id per bin", "bins[i].placements.len() + overflow sum
    matches").

## Deliverable format

`.claude/research/task11/codex-report.md` with these sections:

1. Executive summary (50 words): approve/needs-revision verdict
2. Cardinality + duplicate-shape-id invariants — formal statements
3. Fit-check primitive recommendation
4. Density metric — formula
5. Determinism spec — exact tie-break rules
6. Termination conditions for each operator
7. Error handling idiom
8. Debug assertions checklist
9. Sharp edges / gotchas (numbered list)
10. Verdict

Aim 1200-2000 words. Implementation-focused — light on motivation, heavy on "if you don't handle X, impl will break."

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — style + idiom reference
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` (around line 138-270, replay_seed_into_layout + its preconditions)
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` — cardinality preservation lives here; understand what it guarantees
- `engine/crates/rema-layout/src/application/pack.rs` — current call graph
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` — full context

Do not modify any code. Output to `.claude/research/task11/codex-report.md` only.
mcp startup: no servers
codex
Reviewing Task 11 against the current engine code first. I’m reading the assignment/search pipeline, separator cardinality guarantees, and the parent plan before I draft the implementation-focused report.
Plan update
Large task. I’ll gather the relevant invariants from the current code, map them to each proposed operator, then draft the report in the requested structure. If the sandbox blocks writing, I’ll still produce the full report content and note the constraint.
  → Read Task 11 context files and extract existing invariants, call graph, and deterministic patterns
  • Derive operator-level recommendations: cardinality, duplicate-shape handling, fit probes, acceptance metric, determinism, termination
  • Write `.claude/research/task11/codex-report.md` in requested format, or provide exact content if sandbox prevents writing
exec
/bin/zsh -lc "sed -n '120,320p' 'engine/crates/rema-layout/src/infrastructure/search/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,240p' 'engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '240,340p' 'docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '340,460p' 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,260p' 'engine/crates/rema-layout/src/application/pack.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
        &mut listener,
        &ExplorationConfig::paper_defaults(),
    );
    let explored_snap = match expl_outcome {
        ExplorationOutcome::Feasible(snap) => snap,
        ExplorationOutcome::Infeasible { snapshot, .. } => snapshot,
    };
    let polished = compression_phase(&mut sep, explored_snap, &term, &mut listener);

    // 6. Translate LayoutSnapshot back to SeedResult.
    Ok(snapshot_to_seed(
        &polished,
        &sep.instance,
        &config.items,
        &config.bin.bin_id,
    ))
}

/// Replay a warm-start `SeedResult` into a fresh `Layout`.
///
 succeeded in 51ms:
// engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs
//
// First-Fit-Decreasing bin-assignment heuristic.
//
// Fresh code — not a sparrow port. Replaces pack.rs's prior "iterate
// bins in input order with per-bin greedy spillover" with a global
// assignment pass that routes each item to the first bin (in priority
// order) where it still fits alongside previously assigned items.
//
// Design notes:
//   1. Sort key is 4-level stable: bbox area desc, longest edge desc,
//      shape_id asc, instance ordinal asc. Area desc is the canonical
//      FFD primary; the rest ensure determinism across ties.
//   2. Bin order: priority desc (None == 0, matching TS
//      buildPackRequest.ts:32-34), Remnant-before-Fresh, input order.
//   3. Clearance is pass-through — fit-checking delegates to
//      warm_start::greedy_bottom_left, which calls the jagua adapter
//      with the same clearance. No precomputed bbox inflation.
//   4. Per-bin config.items MUST NOT contain duplicate shape_id rows
//      (replay_seed_into_layout at mod.rs:144 errors on duplicates).
 succeeded in 51ms:
// engine/crates/rema-layout/src/application/pack.rs
use crate::domain::{BinResult, PackError, Part, PackRequest, PackResult, Placement};
use crate::infrastructure::search;
use crate::infrastructure::search::assignment::ffd::ffd_assign;
use crate::infrastructure::warm_start::SeedResult;
use std::collections::HashMap;
use std::time::Instant;

pub fn pack(request: PackRequest) -> Result<PackResult, PackError> {
    if request.bins.is_empty() {
        return Err(PackError::NoBins);
    }
    if request.items.is_empty() {
        return Err(PackError::NoItems);
    }

    let started_at = Instant::now();
    let total_budget_ms = request.resolved_time_budget_ms();
    let per_bin_budget_ms = total_budget_ms / (request.bins.len() as u64).max(1);

 succeeded in 52ms:
            sep_stats.total_moves,
            sep_stats.total_evals,
            n_iter
        );

        if min_loss == 0.0 {
            SeparateOutcome::Feasible(min_loss_sol.0)
        } else {
            SeparateOutcome::Infeasible {
                snapshot: min_loss_sol.0,
                ct_snapshot: min_loss_sol.1,
            }
        }
    }

    /// Algorithm 10 from <https://doi.org/10.48550/arXiv.2509.13329>.
    ///
    /// Workers carry independent RNGs seeded from the master in
    /// `Separator::new`. Sequential execution is fine — the independent
    /// seeds are what guarantee each worker explores a different
 succeeded in 52ms:
  pipeline while the tracker uses direct `quantify_collision_poly_poly`;
  when the two views of loss disagree, worker selection picks
  sample-eval-best but tracker-measured weighted loss can still go
  up. Not fixable without changing sparrow's algorithm. Documented.
- **Item #3 (jagua upstream)**: issue draft at
  `.claude/research/task9.5/jagua-upstream-issue.md` ready to file.
  Profile override in Cargo.toml kept with linked rationale. Safe to
  maintain long-term — only affects debug test builds.

After this commit + filing the upstream issue → tag
`s2.5a-industry-competitive`.

---

## Phase b — BPP bin assignment + cross-bin swap (S2.5b)

### Task 10: FFD bin assignment ✅

**Files:** `engine/crates/rema-layout/src/infrastructure/search/assignment/{mod,ffd}.rs` + `engine/crates/rema-layout/src/application/pack.rs` rewire.

codex
The existing code already nails two Task 11 constraints: per-bin item rows must be deduped by `shape_id`, and deterministic output depends on explicit sort/materialization rules. I’m pulling the remaining structural details now: `SeedResult`, separator cardinality behavior, and any current assignment module conventions.
exec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/infrastructure/search/assignment/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/infrastructure/warm_start.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"struct SeedResult|SeedPlacement|overflow\" 'engine/crates/rema-layout/src/infrastructure/warm_start.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"cardinality|placed_count|overflow_count|total_requested|quantity|placements.len\\(\\)\" 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs' 'engine/crates/rema-layout/src/infrastructure/search/mod.rs' 'engine/crates/rema-layout/src/application/pack.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
// engine/crates/rema-layout/src/infrastructure/search/assignment/mod.rs
//
// Bin-assignment heuristics. Decides which items go to which bin
// BEFORE the per-bin GLS optimize runs. Task 10 introduces FFD
// (First-Fit-Decreasing); Task 11 will add `cross_bin_swap` as a
// sibling; future variants (BFD, shelf) slot in here.

pub mod ffd;
 succeeded in 52ms:
// engine/crates/rema-layout/src/infrastructure/warm_start.rs
use crate::domain::{Bin, Part, PackError};
use rema_geom::domain::Point2D;

/// Greedy bottom-left seeding: for each item, stack vertically starting at y=0.
/// Simple but produces a valid starting layout for sparrow's LNS.
/// This is the S2 MVP packer — sparrow integration lands in S2.5.
#[derive(Clone, Debug, PartialEq)]
pub struct SeedPlacement {
    pub shape_id: String,
    pub instance_index: u32,
    pub bin_id: String,
    pub x: f64,
    pub y: f64,
    pub rotation_rad: f64,
    pub polygon: Vec<Point2D>,
    pub width: f64,
    pub height: f64,
}

 succeeded in 52ms:
9:pub struct SeedPlacement {
27:pub struct SeedResult {
28:    pub placements: Vec<SeedPlacement>,
30:    pub overflow: u32,
40:    let mut overflow: u32 = 0;
55:            placements.push(SeedPlacement {
73:        overflow += part.quantity - placed_this_part;
75:    Ok(SeedResult { placements, overflow })
122:        assert_eq!(result.overflow, 3);
163:    fn overflow_counts_unplaced_instances() {
168:        assert_eq!(result.overflow, 3);
 succeeded in 51ms:
engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs:514:            quantity: 1,
engine/crates/rema-layout/src/application/pack.rs:101:        // subset didn't fit after GLS". Scalar overflow_count below is
engine/crates/rema-layout/src/application/pack.rs:117:            r.quantity.saturating_sub(placed)
engine/crates/rema-layout/src/application/pack.rs:130:    let placed_count = placements.len() as u32;
engine/crates/rema-layout/src/application/pack.rs:134:        placed_count,
engine/crates/rema-layout/src/application/pack.rs:135:        overflow_count: total_overflow,
engine/crates/rema-layout/src/application/pack.rs:172:                quantity: *qty,
engine/crates/rema-layout/src/application/pack.rs:192:            quantity: qty,
engine/crates/rema-layout/src/application/pack.rs:256:        assert_eq!(result.placed_count, 3);
engine/crates/rema-layout/src/application/pack.rs:257:        assert_eq!(result.overflow_count, 0);
engine/crates/rema-layout/src/application/pack.rs:289:    fn overflow_counted_when_bin_too_small() {
engine/crates/rema-layout/src/application/pack.rs:302:        assert_eq!(result.placed_count, 2);
engine/crates/rema-layout/src/application/pack.rs:303:        assert_eq!(result.overflow_count, 3);
engine/crates/rema-layout/src/application/pack.rs:337:        // → overflow_count == 0.
engine/crates/rema-layout/src/application/pack.rs:355:            result.overflow_count, 0,
engine/crates/rema-layout/src/application/pack.rs:357:            result.overflow_count
engine/crates/rema-layout/src/application/pack.rs:359:        assert_eq!(result.placed_count, 3);
engine/crates/rema-layout/src/application/pack.rs:379:        assert_eq!(result.placed_count, 3);
engine/crates/rema-layout/src/application/pack.rs:380:        assert_eq!(result.overflow_count, 0);
engine/crates/rema-layout/src/infrastructure/search/mod.rs:262:    let total_requested: u32 = items.iter().map(|p| p.quantity).sum();
exec
/bin/zsh -lc "sed -n '340,520p' 'engine/crates/rema-layout/src/infrastructure/search/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,180p' 'engine/crates/rema-layout/src/infrastructure/search/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"overall_density|efficiency|used_area|waste_area|scrap_ratio|density\" 'engine/crates/rema-layout/src'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
                    Point2D::new(*tx as f64 + 10.0, *ty as f64),
                    Point2D::new(*tx as f64 + 10.0, *ty as f64 + 10.0),
                    Point2D::new(*tx as f64, *ty as f64 + 10.0),
                ],
                width: 10.0,
                height: 10.0,
            })
            .collect();
        let seed = SeedResult {
            placements,
            overflow: 0,
        };
        (bin, parts, seed)
    }

    fn cfg_from(bin: Bin, items: Vec<Part>, budget_ms: u64) -> OptimizerConfig {
        OptimizerConfig {
            time_budget_ms: budget_ms,
            improvement_budget_ms: None,
            seed: Some(SEED),
 succeeded in 52ms:
// engine/crates/rema-layout/src/infrastructure/search/mod.rs
//
// Single-bin search orchestrator. Wires Task 6's `exploration_phase`
// and Task 7's identity `compression_phase` into the pipeline
// `pack.rs` calls per bin.
//
// Deviations from the sparrow upstream (documented across the ported
// GLS modules; summarized here for the wiring seam):
//   1. BPP scope: single-bin orchestrator. Multi-bin coordination
//      lives above in `application::pack.rs` today; Task 12 will swap
//      that outer loop for a cross-bin-swap coordinator.
//   2. Budget: 100% exploration, 0% compression. Compression is
//      identity in BPP (Task 7); sparrow's 80/20 split has no
//      fixed-bin analogue.
//   3. `OptimizerConfig` carries `bin: Bin`, `items: Vec<Part>`,
//      `clearance: f64` so this layer can rebuild `BPInstance`
//      without breaking the `optimize(seed, cfg)` signature locked
//      in Task 1.
//   4. `improvement_budget_ms` reserved for Task 14 — not wired yet.
//      Listener is `NoopListener`; Terminator is timeout-only
 succeeded in 51ms:
engine/crates/rema-layout/src/application/pack.rs:23:    // items in input order and lost packing efficiency when small-first
engine/crates/rema-layout/src/application/pack.rs:51:        let mut used_area = 0.0_f64;
engine/crates/rema-layout/src/application/pack.rs:61:            used_area += area;
engine/crates/rema-layout/src/application/pack.rs:83:        let waste_area = (stock_area - used_area).max(0.0);
engine/crates/rema-layout/src/application/pack.rs:84:        let efficiency = if stock_area > 0.0 {
engine/crates/rema-layout/src/application/pack.rs:85:            used_area / stock_area
engine/crates/rema-layout/src/application/pack.rs:92:            used_area,
engine/crates/rema-layout/src/application/pack.rs:93:            waste_area,
engine/crates/rema-layout/src/application/pack.rs:96:            efficiency,
engine/crates/rema-layout/src/application/pack.rs:97:            scrap_ratio: 1.0 - efficiency,
engine/crates/rema-layout/src/application/pack.rs:121:    let total_used_area: f64 = per_bin.iter().map(|b| b.used_area).sum();
engine/crates/rema-layout/src/application/pack.rs:122:    let total_waste_area: f64 = per_bin.iter().map(|b| b.waste_area).sum();
engine/crates/rema-layout/src/application/pack.rs:123:    let overall_density = if total_used_area + total_waste_area > 0.0 {
engine/crates/rema-layout/src/application/pack.rs:124:        total_used_area / (total_used_area + total_waste_area)
engine/crates/rema-layout/src/application/pack.rs:137:        total_used_area,
engine/crates/rema-layout/src/application/pack.rs:138:        total_waste_area,
engine/crates/rema-layout/src/application/pack.rs:139:        overall_density,
engine/crates/rema-layout/src/application/pack.rs:307:    fn run_time_ms_populated_and_density_computed() {
engine/crates/rema-layout/src/application/pack.rs:321:        assert!(result.overall_density > 0.0);
engine/crates/rema-layout/src/application/pack.rs:322:        assert!(result.overall_density <= 1.0);
exec
/bin/zsh -lc "sed -n '360,430p' 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,120p' 'engine/crates/rema-layout/src/domain/result.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"duplicate shape_id|shape_id.*duplicate|refusing to replay seed|unknown shape_id\" 'engine/crates/rema-layout/src'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"cross_bin_swap|swap_two|migrate\\(|unload_lightest_bin|task11\" 'engine/crates/rema-layout' 'docs/superpowers/plans' '.claude/research'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
// engine/crates/rema-layout/src/domain/result.rs
use rema_geom::domain::Point2D;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub shape_id: String,
    pub instance_index: u32,
    pub bin_id: String,
    pub x: f64,
    pub y: f64,
    pub rotation_rad: f64,
    pub polygon: Vec<Point2D>,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub difficulty: Option<f64>,
}

 succeeded in 52ms:
    /// item-ordering trajectory. Rayon parallelism returns in Task 18.
    fn move_items_multi(&mut self) -> SepStats {
        let master_layout = self.layout.save();
        let master_ct = self.ct.clone();

        let mut total = SepStats::default();
        for worker in self.workers.iter_mut() {
            worker.load(&master_layout, &master_ct);
            total += worker.move_items();
        }

        debug!(
            "[MOD] workers' w-loss: {:?}",
            self.workers
                .iter()
                .map(|w| w.ct.get_total_weighted_loss())
                .collect_vec()
        );

        // Adopt the min-weighted-loss worker's state into the master.
 succeeded in 51ms:
engine/crates/rema-layout/src/infrastructure/search/mod.rs:161:                "duplicate shape_id '{}' in items — refusing to replay seed",
engine/crates/rema-layout/src/infrastructure/search/mod.rs:172:                    "seed placement references unknown shape_id '{}'",
engine/crates/rema-layout/src/application/pack.rs:156:/// one Part each (no duplicate shape_id rows, matching
engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs:19://   4. Per-bin config.items MUST NOT contain duplicate shape_id rows
engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs:137:    // collapsed-quantity Part list (no duplicate shape_ids).
engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs:357:        // per-bin and checking no bin has duplicate shape_id rows in
 succeeded in 50ms:
engine/crates/rema-layout/src/infrastructure/search/assignment/mod.rs:5:// (First-Fit-Decreasing); Task 11 will add `cross_bin_swap` as a
docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md:271:  for Task-11 `cross_bin_swap.rs` sibling).
docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md:285:**Files:** `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md:288:1. `swap_two(a_bin, b_bin)` — try moving one item from A to B and one from B to A. Keep if global density improves.
docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md:289:2. `migrate(a_bin, b_bin)` — try moving N items from A to B, ignoring A's remainder. Used when closing a bin.
docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md:290:3. `unload_lightest_bin` — try to empty the lowest-density bin into others.
.claude/research/task11/codex-report.md:25:(`cross_bin_swap.rs`) slot into the same `assignment/` module.
.claude/research/task11/codex-report.md:34:Write `.claude/research/task11/codex-report.md` — an
.claude/research/task11/codex-report.md:39:1. `swap_two(a_bin, b_bin)` — move one item from A to B and one from B to A, keep if global density improves.
.claude/research/task11/codex-report.md:40:2. `migrate(a_bin, b_bin)` — move N items from A to B, ignoring A's remainder. Used when closing a bin.
.claude/research/task11/codex-report.md:41:3. `unload_lightest_bin` — empty lowest-density bin into others.
.claude/research/task11/codex-report.md:60:   shape Y; B has 2 copies of shape X. What does swap_two(X_from_A,
.claude/research/task11/codex-report.md:87:6. **Infinite-loop prevention.** swap_two may swap X↔Y and then the
.claude/research/task11/codex-report.md:92:7. **`unload_lightest_bin` termination.** When is the operator done?
.claude/research/task11/codex-report.md:114:`.claude/research/task11/codex-report.md` with these sections:
.claude/research/task11/codex-report.md:137:Do not modify any code. Output to `.claude/research/task11/codex-report.md` only.
.claude/research/task11/codex-report.md:145:  • Write `.claude/research/task11/codex-report.md` in requested format, or provide exact content if sandbox prevents writing
.claude/research/task11/codex-report.md:267:// (First-Fit-Decreasing); Task 11 will add `cross_bin_swap` as a
docs/superpowers/plans/2026-04-18-s2.5-task10-ffd.md:36:Rationale: leaves room for `bfd.rs` / `shelf.rs` / `cross_bin_swap.rs` (Task 11) siblings.
docs/superpowers/plans/2026-04-18-s2.5-task10-ffd.md:319:    11's cross_bin_swap.rs).
codex
There’s already a `.claude/research/task11/codex-report.md` in the tree, but from the search hits it looks like it currently contains the task brief, not the report. I’m opening it to confirm, because if it’s a placeholder the report needs to replace it cleanly.
exec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/task11/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '300,420p' 'engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '220,440p' '.claude/research/task11/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
OpenAI Codex v0.107.0 (research preview)
--------
workdir: /Users/danielmartinezjulio/Work/arc and anchor/rema-portal
model: gpt-5.4
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019da382-7927-75f2-8ea7-a11263803508
--------
user
# Task 11 research — cross-bin swap operators (Codex voice)

## Context

Branch: `refactor/rf-engine`, HEAD = `d64a6d1` (Task 10 FFD shipped).
Workspace: `engine/` (Cargo). Parent plan:
`docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md`, Task 11 at
line 272.
 succeeded in 51ms:
            r.per_bin
                .iter()
                .map(|b| {
                    b.placements
                        .iter()
                        .map(|p| (p.shape_id.clone(), p.x.to_bits(), p.y.to_bits()))
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(k(&out1), k(&out2));
    }

    #[test]
    fn single_bin_collapses_to_warm_start_shape() {
        // 1 bin + 3 items. FFD's per_bin[0] should have the same
        // placement count as if we called warm_start directly on the
        // FFD-sorted item list.
        let bins = vec![bin("A", 96.0, 96.0)];
        let items = vec![
 succeeded in 51ms:
        if min_loss == 0.0 {
            SeparateOutcome::Feasible(min_loss_sol.0)
        } else {
            SeparateOutcome::Infeasible {
                snapshot: min_loss_sol.0,
                ct_snapshot: min_loss_sol.1,
            }
        }
    }

    /// Algorithm 10 from <https://doi.org/10.48550/arXiv.2509.13329>.
    ///
    /// Workers carry independent RNGs seeded from the master in
    /// `Separator::new`. Sequential execution is fine — the independent
    /// seeds are what guarantee each worker explores a different
 succeeded in 52ms:
  pipeline while the tracker uses direct `quantify_collision_poly_poly`;
  when the two views of loss disagree, worker selection picks
  sample-eval-best but tracker-measured weighted loss can still go
  up. Not fixable without changing sparrow's algorithm. Documented.
exec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/domain/error.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"enum PackError|struct PackError|EngineFailed|NoBins|NoItems\" 'engine/crates/rema-layout/src/domain'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"polygon_area\\(|used_area|shape area|bbox_of\\(\" 'engine/crates/rema-layout/src'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal exited 1 in 52ms:
sed: engine/crates/rema-layout/src/domain/error.rs: No such file or directory
 succeeded in 51ms:
engine/crates/rema-layout/src/domain/errors.rs:5:pub enum PackError {
engine/crates/rema-layout/src/domain/errors.rs:7:    NoBins,
engine/crates/rema-layout/src/domain/errors.rs:9:    NoItems,
engine/crates/rema-layout/src/domain/errors.rs:17:    EngineFailed(String),
 succeeded in 51ms:
engine/crates/rema-layout/src/domain/result.rs:25:    pub used_area: f64,
engine/crates/rema-layout/src/domain/result.rs:48:    pub total_used_area: f64,
engine/crates/rema-layout/src/domain/result.rs:51:    /// Invariant: `overall_density == total_used_area / (total_used_area + total_waste_area)` when non-empty;
engine/crates/rema-layout/src/domain/result.rs:71:            used_area: 50.0,
engine/crates/rema-layout/src/domain/result.rs:160:            total_used_area: 100.0,
engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs:55:        // exceeds 50% of the shape area.
engine/crates/rema-layout/src/infrastructure/warm_start.rs:42:        let bbox = rema_geom::application::bbox_of(&part.polygon).map_err(|source| {
engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs:60:        let bbox = rema_geom::application::bbox_of(&part.polygon).map_err(|source| {
engine/crates/rema-layout/src/application/pack.rs:51:        let mut used_area = 0.0_f64;
engine/crates/rema-layout/src/application/pack.rs:60:            let area = polygon_area(&p.polygon);
engine/crates/rema-layout/src/application/pack.rs:61:            used_area += area;
engine/crates/rema-layout/src/application/pack.rs:83:        let waste_area = (stock_area - used_area).max(0.0);
engine/crates/rema-layout/src/application/pack.rs:85:            used_area / stock_area
engine/crates/rema-layout/src/application/pack.rs:92:            used_area,
engine/crates/rema-layout/src/application/pack.rs:121:    let total_used_area: f64 = per_bin.iter().map(|b| b.used_area).sum();
engine/crates/rema-layout/src/application/pack.rs:123:    let overall_density = if total_used_area + total_waste_area > 0.0 {
engine/crates/rema-layout/src/application/pack.rs:124:        total_used_area / (total_used_area + total_waste_area)
engine/crates/rema-layout/src/application/pack.rs:137:        total_used_area,
engine/crates/rema-layout/src/application/pack.rs:144:fn polygon_area(poly: &[rema_geom::domain::Point2D]) -> f64 {
codex
The error surface is small: `PackError` is basically domain-invalid input plus a generic `EngineFailed(String)`. That pushes Task 11 toward `Result<Option<_>, PackError>` rather than inventing “no improvement” as an error path.
exec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/domain/errors.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"fn rect_part|fn bin\\(|greedy_bottom_left\\(|determinism|sorted by shape_id|input order\" 'engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
// engine/crates/rema-layout/src/domain/errors.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PackError {
    #[error("pack: no bins provided")]
    NoBins,
    #[error("pack: no items provided")]
    NoItems,
    #[error("pack: invalid polygon on part '{shape_id}': {source}")]
    InvalidPolygon {
        shape_id: String,
        #[source]
        source: rema_geom::domain::GeomError,
    },
    #[error("pack: engine failed: {0}")]
    EngineFailed(String),
    #[error("pack: timeout after {0}ms")]
    Timeout(u64),
}
 succeeded in 52ms:
6:// bins in input order with per-bin greedy spillover" with a global
13://      FFD primary; the rest ensure determinism across ties.
15://      buildPackRequest.ts:32-34), Remnant-before-Fresh, input order.
40:    /// `shape_id` for determinism.
103:    // input order for ties.
110:            .then_with(|| i.cmp(&j)) // stable input order
115:    // iteration for determinism.
124:            let probe = greedy_bottom_left(&bins[bin_idx], &trial_items, clearance)?;
147:                greedy_bottom_left(&bins[i], &final_items, clearance)
152:    // Overflow list sorted by shape_id for deterministic output.
239:    fn rect_part(id: &str, qty: u32, w: f64, h: f64) -> Part {
256:    fn bin(id: &str, w: f64, h: f64) -> Bin {
exec
/bin/zsh -lc "rg --files '.claude/research/task10'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/task10/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal exited 2 in 52ms:
rg: .claude/research/task10: IO error for operation on .claude/research/task10: No such file or directory (os error 2)
 exited 1 in 52ms:
sed: .claude/research/task10/codex-report.md: No such file or directory
exec
/bin/zsh -lc "rg --files '.claude/research' | rg 'task10|task11|gemini|codex'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
.claude/research/openclaw-skills/gemini.md
.claude/research/openclaw-skills/codex.md
.claude/research/task11/gemini-report.md
.claude/research/task11/codex-report.md
.claude/research/archive/task5/gemini-drift-check.md
.claude/research/archive/task5/codex-signoff.md
.claude/research/archive/task5/gemini-report.md
.claude/research/archive/task5/gemini-signoff.md
.claude/research/archive/task5/codex-report.md
.claude/research/archive/task5/codex-impl-review.md
.claude/research/archive/task10/gemini-report.md
.claude/research/archive/task10/codex-signoff-task10.md
.claude/research/archive/task10/gemini-signoff-task10.md
.claude/research/archive/task9.5/gemini-report.md
.claude/research/archive/task9.5/codex-report.md
.claude/research/archive/task8/gemini-drift-check.md
.claude/research/archive/task8/gemini-signoff-task8.md
.claude/research/archive/task8/gemini-report.md
.claude/research/archive/task8/codex-signoff-task8.md
.claude/research/archive/task8/codex-report.md
codex
I’ve got enough structural context to draft the invariants. One more pass on `explore.rs` and existing research files, because Task 11’s acceptance metric should align with the engine’s current meaning of “density” and with the existing Codex report style.
exec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/task11/gemini-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,180p' 'engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/archive/task10/codex-signoff-task10.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:

 succeeded in 51ms:
# Task 10 sign-off — Codex

Verdict: **APPROVE WITH CHANGES**

1. **Guardrail #1:** Yes. §2 + §3.6's per-bin `HashMap<String, u32>` and collapsed `materialize_parts` are the right fix for `search::replay_seed_into_layout`, which rejects duplicate `shape_id` rows in `config.items`. Test 5 covers the important quantity-split case.

2. **Guardrail #2:** The overall approach is right: probe with cumulative quantity, then materialize the final per-bin seed through the same `warm_start::greedy_bottom_left` path. Required clarification: every map-to-vec materialization must preserve deterministic item order, ideally original `items` order. Do not build trial/final `Vec<Part>` or `overflow` via raw `HashMap` iteration.

3. **Types:** Confirmed. `Part.quantity` is `u32` and `Bin.priority` is `Option<i32>` in `engine/crates/rema-layout/src/domain/request.rs`.

4. **Empty inputs:** Confirmed. `PackError::NoBins` / `NoItems` is the correct behavior and matches current engine seams in `application/pack.rs` and `infrastructure/jagua_adapter.rs`.

5. **Tests:** Scenario A plus the pack-level regression are the right anchors. I do not need another scenario if Test 5 stays; that already covers the other critical failure mode: quantity splitting without duplicate per-bin `shape_id`.

6. **TDD order:** Yes. Starting with tie-break determinism is the right early red test.

7. **`pack.rs` wiring:** Yes. Current `pack.rs` already ignores per-bin overflow (`application/pack.rs:100-103`) and recomputes global overflow from actual residual quantities (`117-118`). That remains correct after the FFD rewire.

Required change:

 succeeded in 51ms:
// engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs
//
// Ported from sparrow's `src/optimizer/explore.rs` (MIT, Copyright 2025
// Jeroen Gardeyn, KU Leuven, ejor-snapshot tag c95454e3).
//
// The exploration phase is the outer GLS loop. It repeatedly calls
// Separator::separate, collects feasible layouts, and on infeasibility
// disrupts the layout (swap-two-large) to escape local minima.
//
// Deviations from upstream:
//   1. SPP -> BPP: change_strip_width + the whole shrink-and-retry
//      driver removed. BPP bins are fixed-size. Loop driver is
//      "separate, on Feasible return immediately (density is fixed),
//      on Infeasible disrupt + restart until terminator or
//      max_conseq_failed_attempts".
//   2. Return type: ExplorationOutcome::{ Feasible(LayoutSnapshot),
//      Infeasible { snapshot, total_loss } } instead of
//      Vec<SPSolution>. BPSolution assembly is Task 8/12.
//   3. SPInstance/SPSolution/SPProblem -> BPInstance/LayoutSnapshot/
//      Layout. sep.prob.* -> sep.layout / sep.instance per Task 5.
exec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/domain/request.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"struct Part|struct Bin|priority: Option|shape_id\" 'engine/crates/rema-layout/src/domain/request.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
// engine/crates/rema-layout/src/domain/request.rs
use rema_geom::domain::Point2D;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BinKind {
    Fresh,
    Remnant,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum UnitSystem {
    #[default]
    #[serde(alias = "in", alias = "inches")]
    Inch,
    #[serde(alias = "millimeter", alias = "millimeters")]
    Mm,
 succeeded in 51ms:
25:pub struct Bin {
31:    pub priority: Option<i32>,
50:pub struct Part {
51:    pub shape_id: String,
133:        assert_eq!(req.items[0].shape_id, "rect-a");
exec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/archive/task9.5/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/archive/task8/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
# Task 8 second opinion — Codex (saved by Claude; sandbox was read-only)

Verdict: **APPROVE** for Claude to draft the plan, but only with the corrections below.

1. **Choose B, not A or C.** Add `bin: Bin` and `items: Vec<Part>` to `OptimizerConfig` at the existing `application::pack -> search::optimize` seam in `engine/crates/rema-layout/src/application/pack.rs:24`. `C` is forbidden. `A` makes `SeedResult` carry request context it does not semantically own, and if that payload is `BPInstance` it breaks `PartialEq` immediately because `BPInstance` is only `Clone + Debug`, not `PartialEq`. `B` keeps signature stability, keeps jagua construction inside infrastructure, and uses data `pack()` already has at the callsite.

2. **Risks Gemini might miss.**

   - `SeedResult::PartialEq`: adding `BPInstance` to `SeedResult` does not preserve derive-based equality. Adding `Bin`/`Vec<Part>` would compile because domain types derive `PartialEq`, but it still widens warm-start equality and forces test fixture churn in `warm_start.rs` and `search/mod.rs`.

   - `SeedPlacement.polygon`: the output must be the transformed **original** polygon, matching warm-start's current behavior in `warm_start.rs:62`. Do **not** serialize jagua's internal `PlacedItem.shape`; that shape is centroid-pretransformed and can be clearance-inflated/simplified. Use jagua's `int_to_ext_transformation` from `export.rs:34` and apply it to the original shape.

   - Overflow bookkeeping: recover it as `sum(item_qty(id) - placed_count_for_item_id)` from the passed-in items / `BPInstance`, not from final layout size alone. The app later computes true overflow from `remaining` in `pack.rs:97`, so per-bin `SeedResult::overflow` should stay "unplaced on this bin".

   - Determinism: seeded runs stay deterministic if Task 8 calls `rng::from_seed(config.seed)` once and keeps worker count fixed. Worker RNGs are deterministically derived from the master via `rng.random()` in `separator.rs:212`. The real risk is nondeterministic output ordering during layout->seed translation; sort placements before renumbering.

   - Snapshot churn: there are **9** parity fixtures, so **9 rust snapshot entries** will change in `parity.test.ts.snap:124`. Refresh is mechanically a simple `-u`, but it should not be blind; inspect all 9 rust diffs. Legacy snapshots should remain unchanged.

   - **Extra risk:** Task 8's single-bin GLS cannot increase placed count or reduce overflow, because the separator only moves already-placed items and preserves cardinality in `separator.rs:390`. That makes any "density > warm-start baseline" expectation wrong for an already-feasible warm start.

 succeeded in 51ms:
# Task 9.5 Codex Report

Verdict: APPROVE for Claude to ship fixes.

## Item #1

### 1. Port vs sparrow upstream

I diffed sparrow upstream [`/tmp/sparrow-research/sparrow/src/eval/specialized_jaguars_pipeline.rs:27-89`] against our port [`engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs:40-146`].

Result: no behavioral delta in the collision logic. The only real changes are comments, import paths, dropped SIMD branches, and the downgraded end-of-function assertion. The pole prepass, bit-reversed edge pass, and containment loop are intact. This was not introduced by Task 4’s port.

### 2. The suspected containment branch is not the bug

I traced the known reproducer `overflow_counted_when_bin_too_small` and the first concrete mismatch:

- sampled item: `pk=PItemKey(1v15)`
- extra hazard in custom only: `PlacedItem(pk=PItemKey(2v17), dt.translation=(5.104145, 7.3748126))`
- sampled shape bbox: `Rect { x_min: -0.033320427, y_min: 0.24320579, x_max: 10.09168, y_max: 5.368206 }`

exec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/mod.rs' | sed -n '140,180p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs' | sed -n '380,410p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/application/pack.rs' | sed -n '108,130p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs' | sed -n '110,170p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
   380	        // Every other worker's work is discarded — matches upstream
   381	        // `min_by_key(OrderedFloat(total_weighted_loss))`.
   382	        let best_idx = self
   383	            .workers
   384	            .iter()
   385	            .enumerate()
   386	            .min_by_key(|(_, w)| OrderedFloat(w.ct.get_total_weighted_loss()))
   387	            .map(|(i, _)| i)
   388	            .expect("move_items_multi requires at least one worker");
   389	        let best_snapshot = self.workers[best_idx].layout.save();
   390	        self.layout.restore(&best_snapshot);
   391	        self.ct = self.workers[best_idx].ct.clone();
   392	
   393	        total
   394	    }
   395	
   396	    /// Restore the layout + tracker from a previous snapshot. When the
   397	    /// tracker snapshot is provided, GLS weights are preserved; when
   398	    /// absent, the tracker is rebuilt from scratch (used by future
   399	    /// explore.rs disruption moves).
 succeeded in 51ms:
   140	/// Each `SeedPlacement` becomes a `layout.place_item(item, dt)` call.
   141	/// Uses an explicit `HashMap<shape_id, item_id>` keyed off
   142	/// `config.items` — do NOT rely on positional matching between
   143	/// `SeedPlacement.shape_id` and `BPInstance.items` order (Codex
   144	/// sign-off §3.3 fix).
   145	fn replay_seed_into_layout(
   146	    layout: &mut Layout,
   147	    instance: &BPInstance,
   148	    items: &[Part],
   149	    seed: &SeedResult,
   150	) -> Result<(), PackError> {
   151	    // Per Codex plan sign-off §3.3: `HashMap<String, usize>` exactly.
   152	    // Owned keys are cheap here (items is typically < 100 entries) and
   153	    // sidestep any future borrow concerns if `items` lifetime changes.
   154	    let mut shape_to_item_id: HashMap<String, usize> = HashMap::with_capacity(items.len());
   155	    for (idx, part) in items.iter().enumerate() {
   156	        if shape_to_item_id
   157	            .insert(part.shape_id.clone(), idx)
   158	            .is_some()
   159	        {
 succeeded in 52ms:
   108	    let mut placed_by_shape: HashMap<&str, u32> = HashMap::new();
   109	    for p in &placements {
   110	        *placed_by_shape.entry(p.shape_id.as_str()).or_insert(0) += 1;
   111	    }
   112	    let total_overflow: u32 = request
   113	        .items
   114	        .iter()
   115	        .map(|r| {
   116	            let placed = placed_by_shape.get(r.shape_id.as_str()).copied().unwrap_or(0);
   117	            r.quantity.saturating_sub(placed)
   118	        })
   119	        .sum();
   120	
   121	    let total_used_area: f64 = per_bin.iter().map(|b| b.used_area).sum();
   122	    let total_waste_area: f64 = per_bin.iter().map(|b| b.waste_area).sum();
   123	    let overall_density = if total_used_area + total_waste_area > 0.0 {
   124	        total_used_area / (total_used_area + total_waste_area)
   125	    } else {
   126	        0.0
   127	    };
 succeeded in 52ms:
   110	            .then_with(|| i.cmp(&j)) // stable input order
   111	    });
   112	
   113	    // Per-bin running assignment: shape_id -> cumulative quantity in
   114	    // that bin. HashMap is fine internally; materialize via sorted
   115	    // iteration for determinism.
   116	    let mut per_bin_counts: Vec<HashMap<String, u32>> = vec![HashMap::new(); bins.len()];
   117	    let mut overflow_counts: HashMap<String, u32> = HashMap::new();
   118	
   119	    'unit: for unit in &units {
   120	        for &bin_idx in &bin_order {
   121	            let trial_items = build_trial_items(&per_bin_counts[bin_idx], unit, items);
   122	            // `greedy_bottom_left` returns overflow > 0 if the trial
   123	            // cumulative set doesn't all fit. That's our fit-check.
   124	            let probe = greedy_bottom_left(&bins[bin_idx], &trial_items, clearance)?;
   125	            if probe.overflow == 0 {
   126	                *per_bin_counts[bin_idx]
   127	                    .entry(unit.shape_id.clone())
   128	                    .or_insert(0) += 1;
   129	                continue 'unit;
exec
/bin/zsh -lc "rg --files 'engine/crates/rema-layout' | rg '/tests/|tests/'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
engine/crates/rema-layout/tests/fixtures/rect-grid.json
engine/crates/rema-layout/tests/fixtures/multi-sheet-remnant.json
engine/crates/rema-layout/tests/fixtures/mixed-rect-circle.json
engine/crates/rema-layout/tests/fixtures/trapezoid-mix.json
engine/crates/rema-layout/tests/fixtures/single-rect.json
engine/crates/rema-layout/tests/fixtures/circle-grid.json
engine/crates/rema-layout/tests/fixtures/overflow.json
engine/crates/rema-layout/tests/fixtures/cone-array.json
engine/crates/rema-layout/tests/fixtures/multi-rect-same-size.json
engine/crates/rema-layout/tests/gls_integration.rs
engine/crates/rema-layout/tests/parity.rs
codex
The biggest new sharp edge isn’t in the swap logic. It’s the current probe: `warm_start::greedy_bottom_left` is a vertical stacker that ignores `clearance` and never checks bin width, so using it as a “fit oracle” can accept impossible moves. I’m validating that before I lock the recommendation, because it changes the verdict.
exec
/bin/zsh -lc "rg -n \"clearance|width >|cursor_y|stack vertically|Simple but produces a valid starting layout\" 'engine/crates/rema-layout/src/infrastructure/warm_start.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/warm_start.rs' | sed -n '30,80p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 53ms:
5:/// Greedy bottom-left seeding: for each item, stack vertically starting at y=0.
6:/// Simple but produces a valid starting layout for sparrow's LNS.
36:    _clearance: f64,
39:    let mut cursor_y = 0.0f64;
52:            if cursor_y + h > bin.height {
60:                y: cursor_y,
65:                    .map(|p| Point2D::new(p.x - bbox.0.x, cursor_y + (p.y - bbox.0.y)))
70:            cursor_y += h;
154:        // After translation, polygon bbox min should be at (0, cursor_y=0)
 succeeded in 53ms:
    30	    pub overflow: u32,
    31	}
    32	
    33	pub fn greedy_bottom_left(
    34	    bin: &Bin,
    35	    items: &[Part],
    36	    _clearance: f64,
    37	) -> Result<SeedResult, PackError> {
    38	    let mut placements = Vec::new();
    39	    let mut cursor_y = 0.0f64;
    40	    let mut overflow: u32 = 0;
    41	    for part in items {
    42	        let bbox = rema_geom::application::bbox_of(&part.polygon).map_err(|source| {
    43	            PackError::InvalidPolygon {
    44	                shape_id: part.shape_id.clone(),
    45	                source,
    46	            }
    47	        })?;
    48	        let w = bbox.1.x - bbox.0.x;
    49	        let h = bbox.1.y - bbox.0.y;
codex
I’ve finished the review and I’m replacing the placeholder transcript in `.claude/research/task11/codex-report.md` with the actual report now. The one likely blocker is filesystem mode: this workspace is read-only, so if the patch is rejected I’ll return the exact file contents instead.
codex
The first patch failed because `apply_patch` rejected the absolute path, not because of the report content. I’m retrying with the repository-relative path; if the read-only sandbox blocks that too, I’ll return the exact markdown body.
codex
The filesystem is hard-blocking writes in this session, so I can’t persist the markdown under `.claude/research/task11/codex-report.md`. I have the final report body ready and I’m returning it verbatim so it can be dropped in without edits.
Plan update
Research and drafting are complete. Writing the report file was blocked by the read-only sandbox, so I’m returning the exact markdown body instead of saving it.
  ✓ Read Task 11 context files and extract existing invariants, call graph, and deterministic patterns
  ✓ Derive operator-level recommendations: cardinality, duplicate-shape handling, fit probes, acceptance metric, determinism, termination
  ✓ Write `.claude/research/task11/codex-report.md` in requested format, or provide exact content if sandbox prevents writing
codex
Couldn’t save `.claude/research/task11/codex-report.md` because this workspace is read-only. Exact file contents:

# Task 11 second opinion — Codex

## 1. Executive summary

Needs revision. Task 11 is implementable, but only if the operators mutate canonical per-bin shape counts, commit transactionally, and replace vague "global density improves" with a strict monotone score. Biggest hidden blocker: the current `warm_start::greedy_bottom_left` probe is not a sound fit oracle, so accepted moves can be geometrically impossible.

## 2. Cardinality + duplicate-shape-id invariants

Use copy counts as the assignment truth, not `SeedPlacement` identity.

Let:

```text
R[s]    = requested quantity for shape_id s
Q[b][s] = placed count of shape_id s in bin b
O[s]    = overflow count of shape_id s
```

The real invariant is per-shape:

```text
forall s:  sum_b Q[b][s] + O[s] = R[s]
```

The scalar check is:

```text
sum_b sum_s Q[b][s] + sum_s O[s] = sum_s R[s]
```

Important: `FfdAssignment.overflow` is `Vec<(String, u32)>`, so the check is `sum overflow counts`, not `overflow.len()`. Using `.len()` will undercount whenever one row represents multiple copies.

The duplicate-row invariant is:

```text
forall b, s: materialized_parts(b) contains at most one Part row for s
```

That matches `replay_seed_into_layout`, which rejects duplicate `shape_id` rows in a bin item list (`search/mod.rs:154-164`). The safest implementation is to store `Q[b][s]` in a map and only materialize `Vec<Part>` at probe/emit time. If the state is map-based, duplicate rows are impossible by construction.

Operator consequences:

`swap_two(a, b, s, t)`: decrement `Q[a][s]` and `Q[b][t]`, increment `Q[a][t]` and `Q[b][s]`, leave `O[*]` unchanged, then probe both bins. If either probe fails, rollback the whole trial. If `s == t`, the count state is unchanged, so this is a no-op and must be rejected immediately. Do not "reindex" anything; assignment-layer copies of the same shape are indistinguishable, and `instance_index` is regenerated later anyway.

`migrate(a, b, M)`: `M` is a multiset of copies removed from `a` and added to `b`. This must be transactional. If the receiver probe fails for any chosen migration, every moved copy goes back to `a`. Do not spill failed copies to overflow. Do not partially commit. Do not error unless the probe itself errors.

`unload_lightest_bin`: this is just a larger transactional migration from one source bin into many receivers. Start from a shadow copy of the assignment. If any source copy cannot be rehomed, discard the entire unload attempt and return `None`. Overflow remains unchanged throughout.

Edge case from the prompt:

```text
A: X x3, Y x1
B: X x2
```

`swap_two(X_from_A, X_from_B)` means no net state change:

```text
A: X x3, Y x1
B: X x2
```

Reject it as a no-op. The only meaningful swap there is `Y_from_A <-> X_from_B`, which yields:

```text
A: X x4
B: X x1, Y x1
```

Both bins still have one row per shape after materialization.

## 3. Fit-check primitive recommendation

Recommendation: for Task 11, use a hybrid inner-loop probe:

```text
cheap area prefilter -> warm_start::greedy_bottom_left on touched bins
```

Do not use `search::optimize` inside these operators. `optimize` is a search phase, not a probe. Its time budget is not a hard upper bound today; the existing test explicitly documents that a nominal 500 ms call can legitimately run close to 10 s because the terminator is only polled at the top of the outer strike loop (`search/mod.rs:389-431`). Hundreds of 50 ms probes inside unload would turn into seconds or minutes.

Do not use pure bbox/area feasibility as an acceptance oracle. It is only a reject-fast prefilter. Area says nothing about shape interaction, clearance, or whether a receiver bin can actually take the moved items.

The hidden problem is that `warm_start::greedy_bottom_left` is weaker than the Task 11 spec assumes. As implemented in `warm_start.rs:33-75`, it stacks vertically, ignores `clearance`, and never checks `w <= bin.width`. That means it can false-accept, not just false-reject. So the honest recommendation is:

1. For CPU budget, `greedy_bottom_left` is the only viable inner-loop primitive today.
2. For correctness, it is not sufficient to call it a "fit oracle" without qualification.
3. Task 11 should either harden that probe first, or explicitly document that these operators are heuristic candidate generators, not proof-producing feasibility checks.

Concrete trade-off summary:

`greedy_bottom_left`: cheap enough for exhaustive candidate scans, deterministic, but currently both false-rejects and false-accepts.

`search::optimize(50ms)`: more realistic geometry, but far too expensive and not a reliable 50 ms cap.

`sum area <= bin area`: only a prefilter.

## 4. Density metric

Do not use `sum_placed_area / sum_bin_area` across all bins. Under pure reassignment, total placed area is constant and the set of bins is constant, so that metric is invariant. Same problem if you compute it only across the two bins involved in a swap. A linear density metric will make `swap_two` useless.

Use a lexicographic score that rewards actual closure first, then concentration:

```text
area[s]   = true polygon area of shape s
stock[b]  = bin[b].width * bin[b].height
used[b]   = sum_s Q[b][s] * area[s]

closed_bins(S)    = count of bins where used[b] == 0
concentration(S)  = sum_b (used[b] * used[b]) / stock[b]

score(S) = (closed_bins(S), concentration(S))
```

Accept iff `score(after) > score(before)` lexicographically.

Why this is the right shape:

`closed_bins` directly encodes the business win: a fully emptied bin goes back to stock.

`concentration` makes `swap_two` meaningful even when active bin count is unchanged. Because it is quadratic, moving load from a lighter bin into a heavier one increases the score, while spreading load out decreases it.

Normalizing by `stock[b]` prevents pathological "close a tiny dense remnant by opening a huge fresh bin" moves from looking good.

Compute `area[s]` from the original polygon, not bbox area. Bbox area is fine for FFD ordering; it is the wrong business metric for assignment acceptance.

If Task 11 insists on a single scalar instead of a tuple, encode the same ordering with a large constant:

```text
M > max possible concentration delta
scalar_score = M * closed_bins + concentration
```

But the tuple is cleaner in Rust and harder to get wrong.

## 5. Determinism spec

Determinism comes from canonical state plus canonical scan order.

Canonical state:

`Q[b][s]` and `O[s]` live in sorted maps, or in `HashMap` plus explicit sort on every map-to-vec boundary.

Materialized per-bin `Vec<Part>` rows are sorted by `shape_id` ascending, matching the determinism pattern already used in `assignment/ffd.rs:113-156`.

Overflow is emitted as `(shape_id, count)` rows sorted by `shape_id` ascending.

Canonical candidate order:

`swap_two(a, b)`: only consider `a < b` by original bin input index. Enumerate source shapes in `a` by `(bbox_area desc, longest_edge desc, shape_id asc)`. Enumerate source shapes in `b` by the same key. Skip `shape_id_a == shape_id_b`. Keep the first candidate that attains the best score.

`migrate(a, b)`: explode source copies in `a` into units sorted by the same FFD unit key plus `instance_ordinal asc`. Evaluate candidate prefixes in `k = len, len-1, ..., 1` order so larger migrations win ties. Keep the first best-scoring feasible prefix.

`unload_lightest_bin`: choose the source active bin by `(density asc, used_area asc, input_idx asc)`. Process its units hardest-first using the same FFD unit key. For each unit, test receiver bins in `(current density desc, priority desc, Remnant-before-Fresh, input_idx asc)` order against the transactional shadow state. If multiple complete unloads end at the same score, keep the first one found under this scan order.

Tie rule: never replace on equal score. "First encountered under canonical scan order wins" is enough to make output bit-identical.

Do not derive determinism from `SeedPlacement.instance_index`. That field is output labeling, not stable assignment identity.

## 6. Termination conditions for each operator

`swap_two`: one call performs one finite exhaustive scan over unique shape pairs in the specified bin pair and returns either the single best improving assignment or `None`. No internal repeat loop.

`migrate`: one call performs one finite scan over candidate migration prefixes for the specified source/receiver pair and returns the single best improving assignment or `None`. No partial commit. No "keep migrating until stuck" loop inside the operator.

`unload_lightest_bin`: make it single-shot in Task 11. Pick the current lightest active bin once, attempt one transactional unload into the other bins, and return either the improved assignment or `None`. Do not re-select the next lightest inside the same call. Task 12's coordinator should own repetition under a global budget.

That termination split matters for testing. Task 11 should expose pure operators plus standalone integration tests under `engine/crates/rema-layout/tests/`; it should not wire `application/pack.rs` yet, and it should not hide repeated operator application inside one function call.

## 7. Error handling idiom

Use:

```rust
type OpResult = Result<Option<FfdAssignment>, PackError>;
```

or the same shape with a new assignment-state type.

`Err(PackError)` means the operator could not evaluate a candidate because the input state or probe path was invalid: bad polygon, impossible materialization, probe failure, or invariant violation.

`Ok(None)` means evaluation succeeded and there was no feasible improving move.

`Ok(Some(new_state))` means the operator found one improving assignment.

Do not create a `PackError::NoImprovementPossible`. Lack of improvement is not an exceptional condition in a local-search operator.

## 8. Debug assertions checklist

1. Before and after every accepted move: `sum placed counts + sum overflow counts == sum requested quantities`.
2. For every `shape_id`: `sum_b Q[b][s] + O[s] == R[s]`.
3. No map retains zero-quantity entries after mutation.
4. Every materialized per-bin item list has unique `shape_id` rows and strictly positive `quantity`.
5. Every touched bin re-probed after materialization returns `overflow == 0`.
6. Every emitted `SeedPlacement.bin_id` matches the owning bin.
7. Overflow rows are sorted by `shape_id` and every overflow count is `> 0`.
8. Accepted candidates satisfy `score(after) > score(before)` exactly; rejected equal-score candidates never commit.

## 9. Sharp edges / gotchas

1. The prompt's `overflow.len()` invariant is wrong for the current type. You need `sum overflow counts`.
2. If you mutate `SeedPlacement` vectors directly, you will conflate placement output with assignment state. Work on counts, then rematerialize.
3. `swap_two(X, X)` is a semantic no-op. If you allow it, tests may pass while the operator appears to "do work" but changes nothing.
4. The current `greedy_bottom_left` probe can false-accept because it ignores width and clearance. That is the most likely real bug in a first implementation.
5. `search::optimize` is not a cheap fit probe. Using it in unload is a performance trap.
6. Any acceptance metric based on linear global density is invariant under reassignment and will reject every non-closing swap.
7. Allowing partial migrate/unload into overflow will create fake improvements by silently dropping hard pieces. That violates the Task 10 cardinality guarantee.
8. Using bbox area in the score will bias the operators toward rectangularity, not true material utilization.
9. Greedy unload order can false-fail even when a full unload exists. Hardest-first plus full rollback is the least bad deterministic heuristic.
10. Raw `HashMap` iteration on counts or overflow will break bit-for-bit determinism even if the move logic is otherwise pure.

## 10. Verdict

Needs revision before implementation. The plan should explicitly lock three things first: transactional count-based state updates, a non-degenerate acceptance score, and the fact that the current warm-start probe is heuristic rather than sound. Once those are written down, Task 11 can stay isolated in `assignment/cross_bin_swap.rs` with standalone tests and no `pack.rs` wiring until Task 12.
tokens used
90,246
Couldn’t save `.claude/research/task11/codex-report.md` because this workspace is read-only. Exact file contents:

# Task 11 second opinion — Codex

## 1. Executive summary

Needs revision. Task 11 is implementable, but only if the operators mutate canonical per-bin shape counts, commit transactionally, and replace vague "global density improves" with a strict monotone score. Biggest hidden blocker: the current `warm_start::greedy_bottom_left` probe is not a sound fit oracle, so accepted moves can be geometrically impossible.

## 2. Cardinality + duplicate-shape-id invariants

Use copy counts as the assignment truth, not `SeedPlacement` identity.

Let:

```text
R[s]    = requested quantity for shape_id s
Q[b][s] = placed count of shape_id s in bin b
O[s]    = overflow count of shape_id s
```

The real invariant is per-shape:

```text
forall s:  sum_b Q[b][s] + O[s] = R[s]
```

The scalar check is:

```text
sum_b sum_s Q[b][s] + sum_s O[s] = sum_s R[s]
```

Important: `FfdAssignment.overflow` is `Vec<(String, u32)>`, so the check is `sum overflow counts`, not `overflow.len()`. Using `.len()` will undercount whenever one row represents multiple copies.

The duplicate-row invariant is:

```text
forall b, s: materialized_parts(b) contains at most one Part row for s
```

That matches `replay_seed_into_layout`, which rejects duplicate `shape_id` rows in a bin item list (`search/mod.rs:154-164`). The safest implementation is to store `Q[b][s]` in a map and only materialize `Vec<Part>` at probe/emit time. If the state is map-based, duplicate rows are impossible by construction.

Operator consequences:

`swap_two(a, b, s, t)`: decrement `Q[a][s]` and `Q[b][t]`, increment `Q[a][t]` and `Q[b][s]`, leave `O[*]` unchanged, then probe both bins. If either probe fails, rollback the whole trial. If `s == t`, the count state is unchanged, so this is a no-op and must be rejected immediately. Do not "reindex" anything; assignment-layer copies of the same shape are indistinguishable, and `instance_index` is regenerated later anyway.

`migrate(a, b, M)`: `M` is a multiset of copies removed from `a` and added to `b`. This must be transactional. If the receiver probe fails for any chosen migration, every moved copy goes back to `a`. Do not spill failed copies to overflow. Do not partially commit. Do not error unless the probe itself errors.

`unload_lightest_bin`: this is just a larger transactional migration from one source bin into many receivers. Start from a shadow copy of the assignment. If any source copy cannot be rehomed, discard the entire unload attempt and return `None`. Overflow remains unchanged throughout.

Edge case from the prompt:

```text
A: X x3, Y x1
B: X x2
```

`swap_two(X_from_A, X_from_B)` means no net state change:

```text
A: X x3, Y x1
B: X x2
```

Reject it as a no-op. The only meaningful swap there is `Y_from_A <-> X_from_B`, which yields:

```text
A: X x4
B: X x1, Y x1
```

Both bins still have one row per shape after materialization.

## 3. Fit-check primitive recommendation

Recommendation: for Task 11, use a hybrid inner-loop probe:

```text
cheap area prefilter -> warm_start::greedy_bottom_left on touched bins
```

Do not use `search::optimize` inside these operators. `optimize` is a search phase, not a probe. Its time budget is not a hard upper bound today; the existing test explicitly documents that a nominal 500 ms call can legitimately run close to 10 s because the terminator is only polled at the top of the outer strike loop (`search/mod.rs:389-431`). Hundreds of 50 ms probes inside unload would turn into seconds or minutes.

Do not use pure bbox/area feasibility as an acceptance oracle. It is only a reject-fast prefilter. Area says nothing about shape interaction, clearance, or whether a receiver bin can actually take the moved items.

The hidden problem is that `warm_start::greedy_bottom_left` is weaker than the Task 11 spec assumes. As implemented in `warm_start.rs:33-75`, it stacks vertically, ignores `clearance`, and never checks `w <= bin.width`. That means it can false-accept, not just false-reject. So the honest recommendation is:

1. For CPU budget, `greedy_bottom_left` is the only viable inner-loop primitive today.
2. For correctness, it is not sufficient to call it a "fit oracle" without qualification.
3. Task 11 should either harden that probe first, or explicitly document that these operators are heuristic candidate generators, not proof-producing feasibility checks.

Concrete trade-off summary:

`greedy_bottom_left`: cheap enough for exhaustive candidate scans, deterministic, but currently both false-rejects and false-accepts.

`search::optimize(50ms)`: more realistic geometry, but far too expensive and not a reliable 50 ms cap.

`sum area <= bin area`: only a prefilter.

## 4. Density metric

Do not use `sum_placed_area / sum_bin_area` across all bins. Under pure reassignment, total placed area is constant and the set of bins is constant, so that metric is invariant. Same problem if you compute it only across the two bins involved in a swap. A linear density metric will make `swap_two` useless.

Use a lexicographic score that rewards actual closure first, then concentration:

```text
area[s]   = true polygon area of shape s
stock[b]  = bin[b].width * bin[b].height
used[b]   = sum_s Q[b][s] * area[s]

closed_bins(S)    = count of bins where used[b] == 0
concentration(S)  = sum_b (used[b] * used[b]) / stock[b]

score(S) = (closed_bins(S), concentration(S))
```

Accept iff `score(after) > score(before)` lexicographically.

Why this is the right shape:

`closed_bins` directly encodes the business win: a fully emptied bin goes back to stock.

`concentration` makes `swap_two` meaningful even when active bin count is unchanged. Because it is quadratic, moving load from a lighter bin into a heavier one increases the score, while spreading load out decreases it.

Normalizing by `stock[b]` prevents pathological "close a tiny dense remnant by opening a huge fresh bin" moves from looking good.

Compute `area[s]` from the original polygon, not bbox area. Bbox area is fine for FFD ordering; it is the wrong business metric for assignment acceptance.

If Task 11 insists on a single scalar instead of a tuple, encode the same ordering with a large constant:

```text
M > max possible concentration delta
scalar_score = M * closed_bins + concentration
```

But the tuple is cleaner in Rust and harder to get wrong.

## 5. Determinism spec

Determinism comes from canonical state plus canonical scan order.

Canonical state:

`Q[b][s]` and `O[s]` live in sorted maps, or in `HashMap` plus explicit sort on every map-to-vec boundary.

Materialized per-bin `Vec<Part>` rows are sorted by `shape_id` ascending, matching the determinism pattern already used in `assignment/ffd.rs:113-156`.

Overflow is emitted as `(shape_id, count)` rows sorted by `shape_id` ascending.

Canonical candidate order:

`swap_two(a, b)`: only consider `a < b` by original bin input index. Enumerate source shapes in `a` by `(bbox_area desc, longest_edge desc, shape_id asc)`. Enumerate source shapes in `b` by the same key. Skip `shape_id_a == shape_id_b`. Keep the first candidate that attains the best score.

`migrate(a, b)`: explode source copies in `a` into units sorted by the same FFD unit key plus `instance_ordinal asc`. Evaluate candidate prefixes in `k = len, len-1, ..., 1` order so larger migrations win ties. Keep the first best-scoring feasible prefix.

`unload_lightest_bin`: choose the source active bin by `(density asc, used_area asc, input_idx asc)`. Process its units hardest-first using the same FFD unit key. For each unit, test receiver bins in `(current density desc, priority desc, Remnant-before-Fresh, input_idx asc)` order against the transactional shadow state. If multiple complete unloads end at the same score, keep the first one found under this scan order.

Tie rule: never replace on equal score. "First encountered under canonical scan order wins" is enough to make output bit-identical.

Do not derive determinism from `SeedPlacement.instance_index`. That field is output labeling, not stable assignment identity.

## 6. Termination conditions for each operator

`swap_two`: one call performs one finite exhaustive scan over unique shape pairs in the specified bin pair and returns either the single best improving assignment or `None`. No internal repeat loop.

`migrate`: one call performs one finite scan over candidate migration prefixes for the specified source/receiver pair and returns the single best improving assignment or `None`. No partial commit. No "keep migrating until stuck" loop inside the operator.

`unload_lightest_bin`: make it single-shot in Task 11. Pick the current lightest active bin once, attempt one transactional unload into the other bins, and return either the improved assignment or `None`. Do not re-select the next lightest inside the same call. Task 12's coordinator should own repetition under a global budget.

That termination split matters for testing. Task 11 should expose pure operators plus standalone integration tests under `engine/crates/rema-layout/tests/`; it should not wire `application/pack.rs` yet, and it should not hide repeated operator application inside one function call.

## 7. Error handling idiom

Use:

```rust
type OpResult = Result<Option<FfdAssignment>, PackError>;
```

or the same shape with a new assignment-state type.

`Err(PackError)` means the operator could not evaluate a candidate because the input state or probe path was invalid: bad polygon, impossible materialization, probe failure, or invariant violation.

`Ok(None)` means evaluation succeeded and there was no feasible improving move.

`Ok(Some(new_state))` means the operator found one improving assignment.

Do not create a `PackError::NoImprovementPossible`. Lack of improvement is not an exceptional condition in a local-search operator.

## 8. Debug assertions checklist

1. Before and after every accepted move: `sum placed counts + sum overflow counts == sum requested quantities`.
2. For every `shape_id`: `sum_b Q[b][s] + O[s] == R[s]`.
3. No map retains zero-quantity entries after mutation.
4. Every materialized per-bin item list has unique `shape_id` rows and strictly positive `quantity`.
5. Every touched bin re-probed after materialization returns `overflow == 0`.
6. Every emitted `SeedPlacement.bin_id` matches the owning bin.
7. Overflow rows are sorted by `shape_id` and every overflow count is `> 0`.
8. Accepted candidates satisfy `score(after) > score(before)` exactly; rejected equal-score candidates never commit.

## 9. Sharp edges / gotchas

1. The prompt's `overflow.len()` invariant is wrong for the current type. You need `sum overflow counts`.
2. If you mutate `SeedPlacement` vectors directly, you will conflate placement output with assignment state. Work on counts, then rematerialize.
3. `swap_two(X, X)` is a semantic no-op. If you allow it, tests may pass while the operator appears to "do work" but changes nothing.
4. The current `greedy_bottom_left` probe can false-accept because it ignores width and clearance. That is the most likely real bug in a first implementation.
5. `search::optimize` is not a cheap fit probe. Using it in unload is a performance trap.
6. Any acceptance metric based on linear global density is invariant under reassignment and will reject every non-closing swap.
7. Allowing partial migrate/unload into overflow will create fake improvements by silently dropping hard pieces. That violates the Task 10 cardinality guarantee.
8. Using bbox area in the score will bias the operators toward rectangularity, not true material utilization.
9. Greedy unload order can false-fail even when a full unload exists. Hardest-first plus full rollback is the least bad deterministic heuristic.
10. Raw `HashMap` iteration on counts or overflow will break bit-for-bit determinism even if the move logic is otherwise pure.

## 10. Verdict

Needs revision before implementation. The plan should explicitly lock three things first: transactional count-based state updates, a non-degenerate acceptance score, and the fact that the current warm-start probe is heuristic rather than sound. Once those are written down, Task 11 can stay isolated in `assignment/cross_bin_swap.rs` with standalone tests and no `pack.rs` wiring until Task 12.
