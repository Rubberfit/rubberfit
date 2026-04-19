OpenAI Codex v0.107.0 (research preview)
--------
workdir: /Users/danielmartinezjulio/Work/arc and anchor/rema-portal
model: gpt-5.4
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019da3a9-1ebd-7c92-8d11-6f92078a6594
--------
user
# Task 12 research — FFD + swap orchestrator (Codex voice)

## Context

REMA Portal Rust nesting engine, phase S2.5b. Branch `refactor/rf-engine`,
HEAD = `0149faa` (Task 11 shipped: swap/migrate/unload operators as
single-shot pure functions on `FfdAssignment`).

Task 12 integrates those operators INTO the search loop so the
orchestrator can refine bin assignments mid-optimization, not just at
the start.

Gemini is writing a design report in parallel at
`.claude/research/task12/gemini-report.md`. You write
`.claude/research/task12/codex-report.md` as the implementation-focused
second opinion — anticipate the sharp edges, scan for correctness
invariants Gemini might miss, flag anything that will bite during impl.

## Parent plan Task 12 spec

1. `search::optimize_multi(request, seeds, cfg) -> Result<Vec<SeedResult>>`.
2. `pack.rs` calls `optimize_multi` once per request (not per-bin loop).
3. Per-bin budget internal to `optimize_multi`.
4. Swap operators run every K iterations (K default 50).
5. Update all parity snapshots.
6. Commit.

## Your key implementation questions

1. **State translation cost.** Converting between `Layout` (sparrow's
   mutable state) and `FfdAssignment` (our count-based assignment) every
   K iterations — how expensive? Can we avoid full re-replay by passing
   Layout snapshots directly into operators? Or does the strict
   duplicate-shape-id invariant from `replay_seed_into_layout` force us
   to always go through `materialize_parts`?

2. **Cardinality preservation across operator boundary.** Task 5-8's
   Separator preserves placed cardinality (separator.rs:390). Task 11's
   operators preserve global cardinality via count-based state.
   What breaks if we translate Layout → FfdAssignment → operator →
   FfdAssignment → Layout? Enumerate failure modes: lost items, moved
   items in mid-flight, `instance_index` renumbering, RNG-state
   divergence.

3. **Restart semantics for Separators.** After operators mutate bin
   assignments, do we destroy all Separators and build fresh ones on
   the new `SeedResults`? Or hot-swap their internal `Layout` while
   preserving CollisionTracker state? Hot-swap is faster but more
   error-prone.

4. **Time budget accounting under cross-bin operators.** Per-bin
   Separator budget today is `total / n_bins`. After an operator call,
   which may take 1-500ms, who accounts for that time? If we split
   budgets evenly pre-operators, a swap-heavy run under-spends on
   GLS; if we split dynamically, reproducibility under fixed seed
   suffers.

5. **Iteration counter.** "Every K iterations" — whose iteration
   counter? Each Separator has its own; do we use global tick count
   (operator runs when sum of per-bin iterations hits K*n)? Or per-bin
   (operator runs when ANY bin's counter hits K)?

6. **Ok(None) from operator.** If `unload_lightest_bin` returns
   `Ok(None)` (no improving move), do we skip operators for this tick
   and just let Separators run longer? Or try a different operator?
   Recommend exponential back-off on fruitless operator ticks.

7. **pack.rs integration.** The existing pack.rs has per-bin
   `placement accumulation + index counters`. With `optimize_multi`
   returning Vec<SeedResult>, pack.rs becomes a thin aggregator.
   Walk through what stays and what goes. What changes to
   `PackResult` construction?

8. **Error propagation.** What happens if one bin's Separator returns
   `Err(PackError::EngineFailed)`? Does `optimize_multi` propagate
   immediately or try to recover (e.g., use pre-operator assignment)?

9. **Parity regressions.** Task 9 tests: do they need fixture updates?
   What specifically might break? (e.g., `property_deterministic_under_seed`
   — does the new multi-bin scheduling change placement order?)

10. **Integration test matrix.** What new tests does Task 13 need that
    Task 12 should support from the orchestrator side? Spec the
    test hooks.

## Deliverable

`.claude/research/task12/codex-report.md`. ~1200-2000 words.

Structure:
1. Executive summary (50 words): approve/needs-revision verdict
2. State translation — cost analysis + recommended cadence
3. Separator restart semantics
4. Budget accounting formula
5. Iteration counter (global vs per-bin)
6. Operator exhaustion back-off
7. pack.rs refactor scope
8. Error propagation + rollback
9. Parity risk assessment
10. Sharp edges / gotchas (numbered list of 8+)
11. Verdict

Implementation-focused — light on motivation, heavy on "if you don't
handle X, impl will break."

## Files to read first

Same as Gemini. In particular:
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` —
  `optimize()`, `replay_seed_into_layout` + its preconditions.
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs`
  — Separator's per-iteration loop + Layout mutation points.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
  — operator APIs + return types.
- `engine/crates/rema-layout/src/application/pack.rs` — current loop.

Do not modify any code.
mcp startup: no servers
codex
Reviewing the Rust search/orchestration path first, then I’ll map each Task 12 question to concrete implementation risks and draft the report content from the current code.
exec
/bin/zsh -lc "sed -n '1,320p' 'engine/crates/rema-layout/src/application/pack.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,320p' 'engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,260p' 'engine/crates/rema-layout/src/infrastructure/search/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,320p' 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
// engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs
//
// Ported from sparrow's `src/optimizer/{separator,worker}.rs` (MIT,
// Copyright 2025 Jeroen Gardeyn, KU Leuven, ejor-snapshot tag c95454e3).
//
// The Separator is the inner loop of the GLS exploration phase. It runs a
// penalty-weighted local search over a single bin's Layout, moving
// colliding items to positions that reduce total collision quantification.
// On success returns `Feasible(LayoutSnapshot)`; on strike-limit
// exhaustion returns `Infeasible { snapshot, ct_snapshot }`.
//
// Deviations from upstream:
//   1. Retyped SPP -> BPP by scoping to a single `Layout` instead of
//      SPProblem. Layout exposes its own place/remove/save/restore API,
//      so the Separator never touches BPProblem -- multi-bin
//      coordination is Task 12's concern.
//   2. `change_strip_width` deleted. BPP bins are fixed-size. The
//      `strip_width()` debug_assert inside upstream `rollback` is
//      likewise dropped.
//   3. `Separator::move_item` (upstream's public move) was dropped in
 succeeded in 52ms:
// engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs
//
// Cross-bin swap operators. Fresh BPP-specific code — sparrow is SPP
// (single-bin strip packing) and has no cross-bin primitives.
//
// Three operators (all return `Result<Option<FfdAssignment>, PackError>`):
//   - `swap_two(a, b)`       — exchange one shape between two bins.
//   - `migrate(a -> b, max)` — transactional prefix migration.
//   - `unload_lightest_bin`  — single-shot transactional full unload.
//
// All three:
//   1. Operate on **copy-count state** (`Q[b][s]` maps) so the
//      duplicate-shape-id invariant (`replay_seed_into_layout` precondition
//      at `search/mod.rs:144`) is impossible to violate by construction.
//   2. Accept only strictly score-improving moves under the lex metric
//      `(closed_bins, concentration)`. No partial commits. No overflow
//      spill. No cycling (strict `>` guarantees monotone termination).
//   3. Use `warm_start::greedy_bottom_left` as the fit probe (hardened
//      in the prior commit with width gate + conservative clearance).
//
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
 succeeded in 52ms:
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

codex
I have the core seams. Next I’m pulling the separator/explore internals and the FFD materialization path so the report can call out which invariants survive a restart and which do not.
exec
/bin/zsh -lc "sed -n '320,760p' 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '260,520p' 'engine/crates/rema-layout/src/infrastructure/search/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,260p' 'engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' '.claude/research/task12/gemini-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,320p' 'engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
    }

    let total_requested: u32 = items.iter().map(|p| p.quantity).sum();
    let overflow = total_requested.saturating_sub(placements.len() as u32);

    SeedResult {
        placements,
        overflow,
    }
}

/// Apply a jagua `DTransformation` (rotate about origin, then translate)
/// to a `Point2D`.
fn apply_dtransformation_to_point(dt: &DTransformation, p: Point2D) -> Point2D {
    let theta = dt.rotation.into_inner();
    let cos = theta.cos();
    let sin = theta.sin();
    let (px, py) = (p.x as f32, p.y as f32);
    let rx = px * cos - py * sin + dt.translation.0.into_inner();
    let ry = px * sin + py * cos + dt.translation.1.into_inner();
 succeeded in 52ms:
                n_iter += 1;
            }

            if initial_strike_loss * 0.98 <= min_loss {
                // No substantial improvement during this strike — add a strike.
                n_strikes += 1;
            } else {
                // Substantial progress — reset strike counter.
                n_strikes = 0;
            }
            // Rollback to the best-seen snapshot before the next strike.
            // `Some(&min_loss_sol.1)` preserves GLS weights across strikes.
            // min_loss_sol is a local, so &min_loss_sol.N is a fresh
            // borrow independent of &mut self.
            self.rollback(&min_loss_sol.0, Some(&min_loss_sol.1));
        }

        log!(
            self.config.log_level,
            "[SEP] finished, moves: {}, evals: {}, iters: {}",
 succeeded in 51ms:

 succeeded in 52ms:
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
 succeeded in 50ms:
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
codex
The restart and replay seams are clear now. I’m checking the request/result types, warm-start seed model, and existing parity/property tests so the report can name exactly what will drift when scheduling moves from `pack.rs` into `optimize_multi`.
exec
/bin/zsh -lc "sed -n '1,260p' 'engine/crates/rema-layout/src/infrastructure/warm_start.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,260p' 'engine/crates/rema-layout/src/domain/mod.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '320,760p' 'engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"property_deterministic_under_seed|deterministic_under_seed|parity|instance_index|optimize_multi|operator_profile|resolved_time_budget_ms|struct PackRequest|struct PackResult|struct SeedResult|unload_lightest_bin|swap_two\\(|migrate\\(\" engine/crates/rema-layout/src -g '*.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 53ms:
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

 succeeded in 53ms:

// ---------------------------------------------------------------------------
// Operator 2: migrate
// ---------------------------------------------------------------------------

/// Migrate units from `from_bin` to `to_bin`. Transactional: either
/// the prefix commits atomically or nothing changes.
///
/// Scans prefix sizes `k = L, L-1, ..., 1` where L is the source unit
/// count (capped at `max_items`). Returns the first feasible prefix that
/// strictly improves the lex score.
pub fn migrate(
    assignment: &FfdAssignment,
    from_bin_idx: usize,
    to_bin_idx: usize,
    max_items: Option<usize>,
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> OpResult {
 succeeded in 53ms:
// engine/crates/rema-layout/src/domain/mod.rs
pub mod errors;
pub mod request;
pub mod result;

pub use errors::PackError;
pub use request::{Bin, BinKind, GrainAxis, OperatorProfile, PackMode, PackRequest, Part, ShapeSpec, UnitSystem};
pub use request::{FAST_MS, BALANCED_MS, THOROUGH_MS};
pub use result::{BinResult, PackResult, Placement};
 succeeded in 52ms:
engine/crates/rema-layout/src/domain/result.rs:9:    pub instance_index: u32,
engine/crates/rema-layout/src/domain/result.rs:43:pub struct PackResult {
engine/crates/rema-layout/src/domain/result.rs:88:            instance_index: 0,
engine/crates/rema-layout/src/infrastructure/warm_start.rs:11:    pub instance_index: u32,
engine/crates/rema-layout/src/infrastructure/warm_start.rs:27:pub struct SeedResult {
engine/crates/rema-layout/src/infrastructure/warm_start.rs:88:                instance_index: inst,
engine/crates/rema-layout/src/infrastructure/warm_start.rs:173:    fn instance_index_starts_at_zero() {
engine/crates/rema-layout/src/infrastructure/warm_start.rs:178:        assert_eq!(seeds[0].instance_index, 0);
engine/crates/rema-layout/src/infrastructure/warm_start.rs:179:        assert_eq!(seeds[1].instance_index, 1);
engine/crates/rema-layout/src/application/pack.rs:18:    let total_budget_ms = request.resolved_time_budget_ms();
engine/crates/rema-layout/src/application/pack.rs:57:            let instance_index = *counter;
engine/crates/rema-layout/src/application/pack.rs:70:                instance_index,
engine/crates/rema-layout/src/application/pack.rs:216:            operator_profile: None,
engine/crates/rema-layout/src/application/pack.rs:232:            operator_profile: None,
engine/crates/rema-layout/src/application/pack.rs:248:            operator_profile: None,
engine/crates/rema-layout/src/application/pack.rs:268:            operator_profile: None,
engine/crates/rema-layout/src/application/pack.rs:279:            .map(|p| p.instance_index)
engine/crates/rema-layout/src/application/pack.rs:285:        assert_eq!(a_indices.len(), sorted.len(), "instance_index must be globally unique per shape");
engine/crates/rema-layout/src/application/pack.rs:294:            operator_profile: None,
engine/crates/rema-layout/src/application/pack.rs:312:            operator_profile: None,
exec
/bin/zsh -c "git status --short '.claude/research/task12/gemini-report.md' && wc -w '.claude/research/task12/gemini-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 2.09s:
2026-04-18 19:54:59.958 xcodebuild[97857:35558836]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-04-18 19:55:00.172 xcodebuild[97857:35558834] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-CFDtmEef' (errno=Operation not permitted)
2026-04-18 19:55:00.695 xcodebuild[97867:35558869]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-04-18 19:55:00.801 xcodebuild[97867:35558868] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
?? .claude/research/task12/gemini-report.md
       0 .claude/research/task12/gemini-report.md
codex
I also checked Gemini’s draft path. The file exists but is still effectively empty, so this report needs to stand on the code alone rather than assume any parallel conclusions are already written.
exec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/domain/result.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,240p' 'engine/crates/rema-layout/src/domain/request.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/infrastructure/search/terminator.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,280p' 'engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/infrastructure/search/state.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
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
 succeeded in 52ms:
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

 succeeded in 51ms:
// engine/crates/rema-layout/src/infrastructure/search/terminator.rs
//
// Ported from sparrow's `src/util/terminator.rs` (MIT, Copyright 2025
// Jeroen Gardeyn, KU Leuven, ejor-snapshot tag c95454e3).
//
// `Terminator` is the abstract kill-switch for the GLS loop; Task 5's
// Separator already takes `&impl Terminator`. This file adds the
// `BasicTerminator` deadline impl that Task 8's `search::optimize`
// arms for the exploration phase (compression is identity per Task 7,
// so 100% of the budget goes to exploration).
//
// Task 14 will introduce an `AtomicBool`-backed cancel token that
// implements the same trait, so consumers (Separator, ExplorationPhase,
// CompressPhase) never change.
//
// Deviations from upstream:
//   - `jagua_rs::Instant` replaced with `std::time::Instant` — we do
//     not support wasm32 for pack-cli, so the jagua shim isn't needed.
//   - `Default` derive kept for parity.
//   - Inclusive boundary: `kill()` uses `now >= deadline` instead of
 succeeded in 51ms:
// engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs
use crate::domain::{Bin, Part, PackError};

use jagua_rs::collision_detection::CDEConfig;
use jagua_rs::geometry::fail_fast::SPSurrogateConfig;
use jagua_rs::io::ext_repr::{
    ExtContainer, ExtItem as BaseExtItem, ExtSPolygon, ExtShape,
};
use jagua_rs::io::import::Importer;
use jagua_rs::probs::bpp::entities::BPInstance;
use jagua_rs::probs::bpp::io::ext_repr::{ExtBPInstance, ExtBin, ExtItem as BpExtItem};
use jagua_rs::probs::bpp::io::import_instance;

/// Guard an f64 -> f32 narrowing conversion against NaN, infinity, and values
/// outside f32's representable range. jagua-rs operates in f32, so we reject
/// upstream rather than silently producing NaN/inf geometry.
fn finite_f32(x: f64, context: &str) -> Result<f32, PackError> {
    if !x.is_finite() {
        return Err(PackError::EngineFailed(
            format!("non-finite coordinate in {}: {}", context, x)
 succeeded in 51ms:
// engine/crates/rema-layout/src/infrastructure/search/state.rs
//
// Multi-bin incumbent state for the GLS search. Scaffolding for S2.5b;
// task 1 lands only the data shape so later tasks can wire against it
// without churning neighbors.

use crate::infrastructure::warm_start::{SeedPlacement, SeedResult};

/// Snapshot of the best layout the search has observed so far across one
/// or more bins. Grows across phases:
///   - Task 1: just a typed wrapper around `SeedResult` per bin.
///   - Task 12: becomes the authoritative incumbent consulted by cross-bin
///     swap operators.
#[derive(Clone, Debug, Default)]
pub struct SearchState {
    /// Per-bin placements + overflow, indexed positionally against the
    /// request's bin order. One entry per bin.
    pub per_bin: Vec<SeedResult>,
    /// Monotonically increasing iteration counter used by progress reports.
    pub iteration: u64,
codex
The code confirms two important constraints for Task 12: `Part.quantity` is the only authoritative demand count, and `SeedPlacement.instance_index` is currently local during search then renumbered globally only in `pack.rs`. That split is where several parity failures will come from.
exec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/mod.rs' | sed -n '1,280p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/application/pack.rs' | sed -n '1,220p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs' | sed -n '1,520p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs' | sed -n '200,430p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"property_deterministic_under_seed|deterministic_under_seed|parity|seed same output|globally unique per shape|overall_density|run_time_ms|SearchState\" . -g '*.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
     1	// engine/crates/rema-layout/src/infrastructure/search/mod.rs
     2	//
     3	// Single-bin search orchestrator. Wires Task 6's `exploration_phase`
     4	// and Task 7's identity `compression_phase` into the pipeline
     5	// `pack.rs` calls per bin.
     6	//
     7	// Deviations from the sparrow upstream (documented across the ported
     8	// GLS modules; summarized here for the wiring seam):
     9	//   1. BPP scope: single-bin orchestrator. Multi-bin coordination
    10	//      lives above in `application::pack.rs` today; Task 12 will swap
    11	//      that outer loop for a cross-bin-swap coordinator.
    12	//   2. Budget: 100% exploration, 0% compression. Compression is
    13	//      identity in BPP (Task 7); sparrow's 80/20 split has no
    14	//      fixed-bin analogue.
    15	//   3. `OptimizerConfig` carries `bin: Bin`, `items: Vec<Part>`,
    16	//      `clearance: f64` so this layer can rebuild `BPInstance`
    17	//      without breaking the `optimize(seed, cfg)` signature locked
    18	//      in Task 1.
    19	//   4. `improvement_budget_ms` reserved for Task 14 — not wired yet.
    20	//      Listener is `NoopListener`; Terminator is timeout-only
 succeeded in 51ms:
     1	// engine/crates/rema-layout/src/application/pack.rs
     2	use crate::domain::{BinResult, PackError, Part, PackRequest, PackResult, Placement};
     3	use crate::infrastructure::search;
     4	use crate::infrastructure::search::assignment::ffd::ffd_assign;
     5	use crate::infrastructure::warm_start::SeedResult;
     6	use std::collections::HashMap;
     7	use std::time::Instant;
     8	
     9	pub fn pack(request: PackRequest) -> Result<PackResult, PackError> {
    10	    if request.bins.is_empty() {
    11	        return Err(PackError::NoBins);
    12	    }
    13	    if request.items.is_empty() {
    14	        return Err(PackError::NoItems);
    15	    }
    16	
    17	    let started_at = Instant::now();
    18	    let total_budget_ms = request.resolved_time_budget_ms();
    19	    let per_bin_budget_ms = total_budget_ms / (request.bins.len() as u64).max(1);
    20	
 succeeded in 50ms:
     1	// engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs
     2	//
     3	// Cross-bin swap operators. Fresh BPP-specific code — sparrow is SPP
     4	// (single-bin strip packing) and has no cross-bin primitives.
     5	//
     6	// Three operators (all return `Result<Option<FfdAssignment>, PackError>`):
     7	//   - `swap_two(a, b)`       — exchange one shape between two bins.
     8	//   - `migrate(a -> b, max)` — transactional prefix migration.
     9	//   - `unload_lightest_bin`  — single-shot transactional full unload.
    10	//
    11	// All three:
    12	//   1. Operate on **copy-count state** (`Q[b][s]` maps) so the
    13	//      duplicate-shape-id invariant (`replay_seed_into_layout` precondition
    14	//      at `search/mod.rs:144`) is impossible to violate by construction.
    15	//   2. Accept only strictly score-improving moves under the lex metric
    16	//      `(closed_bins, concentration)`. No partial commits. No overflow
    17	//      spill. No cycling (strict `>` guarantees monotone termination).
    18	//   3. Use `warm_start::greedy_bottom_left` as the fit probe (hardened
    19	//      in the prior commit with width gate + conservative clearance).
    20	//
 succeeded in 50ms:
   200	impl Separator {
   201	    pub fn new(
   202	        instance: BPInstance,
   203	        layout: Layout,
   204	        mut rng: Xoshiro256PlusPlus,
   205	        config: SeparatorConfig,
   206	    ) -> Self {
   207	        assert!(
   208	            config.n_workers >= 1,
   209	            "Separator requires at least one worker (got n_workers=0)"
   210	        );
   211	        let ct = CollisionTracker::new(&layout);
   212	        let workers = (0..config.n_workers)
   213	            .map(|_| SeparatorWorker {
   214	                instance: instance.clone(),
   215	                layout: layout.clone(),
   216	                ct: ct.clone(),
   217	                rng: Xoshiro256PlusPlus::seed_from_u64(rng.random()),
   218	                sample_config: config.sample_config,
   219	            })
 succeeded in 51ms:
./engine/crates/rema-layout/src/domain/result.rs:51:    /// Invariant: `overall_density == total_used_area / (total_used_area + total_waste_area)` when non-empty;
./engine/crates/rema-layout/src/domain/result.rs:55:    pub overall_density: f64,
./engine/crates/rema-layout/src/domain/result.rs:60:    pub run_time_ms: Option<u64>,
./engine/crates/rema-layout/src/domain/result.rs:139:    fn packresult_default_overall_density_is_zero_and_run_time_is_none() {
./engine/crates/rema-layout/src/domain/result.rs:149:        assert_eq!(pr.overall_density, 0.0);
./engine/crates/rema-layout/src/domain/result.rs:150:        assert_eq!(pr.run_time_ms, None);
./engine/crates/rema-layout/src/domain/result.rs:162:            overall_density: 0.8,
./engine/crates/rema-layout/src/domain/result.rs:163:            run_time_ms: Some(1234),
./engine/crates/rema-layout/src/infrastructure/search/state.rs:15:pub struct SearchState {
./engine/crates/rema-layout/src/infrastructure/search/state.rs:25:impl SearchState {
./engine/crates/rema-layout/src/infrastructure/search/state.rs:27:        SearchState {
./engine/crates/rema-layout/src/infrastructure/search/state.rs:78:        let state = SearchState::from_single_bin(sample_seed(3, 2));
./engine/crates/rema-layout/src/infrastructure/search/state.rs:86:        let state = SearchState {
./engine/crates/rema-layout/src/infrastructure/search/state.rs:97:        let state = SearchState {
./engine/crates/rema-layout/src/infrastructure/search/objective.rs:10:use super::state::SearchState;
./engine/crates/rema-layout/src/infrastructure/search/objective.rs:12:/// A totally ordered objective on `SearchState`. Lower score = better.
./engine/crates/rema-layout/src/infrastructure/search/objective.rs:14:    fn score(&self, state: &SearchState) -> f64;
./engine/crates/rema-layout/src/infrastructure/search/objective.rs:18:    fn is_better(&self, a: &SearchState, b: &SearchState) -> bool {
./engine/crates/rema-layout/src/infrastructure/search/objective.rs:54:    fn score(&self, state: &SearchState) -> f64 {
./engine/crates/rema-layout/src/infrastructure/search/objective.rs:85:    fn state(placed: usize, overflow: u32) -> SearchState {
exec
/bin/zsh -lc "sed -n '1,420p' 'engine/crates/rema-layout/tests/gls_integration.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' 'engine/crates/rema-layout/src/infrastructure/search/objective.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"SearchState|iteration|elapsed_ms|objective|listener|report_improving|report_feasible|report_infeasible\" engine/crates/rema-layout/src -g '*.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"Task 13|task13|orchestrator\" .claude docs engine/crates/rema-layout -g '*'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 52ms:
// engine/crates/rema-layout/src/infrastructure/search/objective.rs
//
// Objective function for the GLS search. Defines what "better" means —
// used by accept/reject decisions inside explore and compress.
//
// Task 1: the scaffold + a BPP lexicographic default. Task 6 onwards:
// the GLS loop consults this when deciding whether to keep a candidate
// solution.

use super::state::SearchState;

/// A totally ordered objective on `SearchState`. Lower score = better.
pub trait Objective {
    fn score(&self, state: &SearchState) -> f64;

    /// Default comparator: `a` is better than `b` iff its score is
    /// strictly lower (ties treated as "not better").
    fn is_better(&self, a: &SearchState, b: &SearchState) -> bool {
        self.score(a) < self.score(b)
    }
 succeeded in 52ms:
// engine/crates/rema-layout/tests/gls_integration.rs
//
// S2.5a Task 9 integration tests — property + timing coverage for the
// explore->compress pipeline wired in Task 8.
//
// Design per Gemini + Codex sign-off:
//   - Four properties over a handcrafted 10-fixture table (not proptest
//     — the budget isn't justified for this scope; single-bin GLS is
//     deterministic under fixed seed so a curated table is enough).
//   - Dropped the parent plan's "density >= warm_start seed density"
//     property: Codex proved on Task 8 that Separator preserves
//     cardinality (separator.rs:390) and compress is identity
//     (compress.rs), so density is invariant on the single-bin path.
//     Asserting density-lift would be trivially true or wrong.
//   - Dropped the "100 random fixtures" requirement: the 10-fixture
//     handcrafted table covers the meaningful shape classes (rects,
//     L-shapes, rotated, tight, loose, overflow, empty). Random
//     generation would add brittleness without catching new bugs.
//
// The four properties asserted per fixture:
 succeeded in 52ms:
engine/crates/rema-layout/src/infrastructure/search/state.rs:15:pub struct SearchState {
engine/crates/rema-layout/src/infrastructure/search/state.rs:19:    /// Monotonically increasing iteration counter used by progress reports.
engine/crates/rema-layout/src/infrastructure/search/state.rs:20:    pub iteration: u64,
engine/crates/rema-layout/src/infrastructure/search/state.rs:22:    pub elapsed_ms: u64,
engine/crates/rema-layout/src/infrastructure/search/state.rs:25:impl SearchState {
engine/crates/rema-layout/src/infrastructure/search/state.rs:27:        SearchState {
engine/crates/rema-layout/src/infrastructure/search/state.rs:29:            iteration: 0,
engine/crates/rema-layout/src/infrastructure/search/state.rs:30:            elapsed_ms: 0,
engine/crates/rema-layout/src/infrastructure/search/state.rs:78:        let state = SearchState::from_single_bin(sample_seed(3, 2));
engine/crates/rema-layout/src/infrastructure/search/state.rs:86:        let state = SearchState {
engine/crates/rema-layout/src/infrastructure/search/state.rs:88:            iteration: 0,
engine/crates/rema-layout/src/infrastructure/search/state.rs:89:            elapsed_ms: 0,
engine/crates/rema-layout/src/infrastructure/search/state.rs:97:        let state = SearchState {
engine/crates/rema-layout/src/infrastructure/search/state.rs:99:            iteration: 0,
engine/crates/rema-layout/src/infrastructure/search/state.rs:100:            elapsed_ms: 0,
engine/crates/rema-layout/src/infrastructure/search/mod.rs:30://   6. Placement iteration sorted by `(item_id, tx, ty, rot)` before
engine/crates/rema-layout/src/infrastructure/search/mod.rs:32://      seed — jagua's `SlotMap` iteration order is not stable.
engine/crates/rema-layout/src/infrastructure/search/mod.rs:36:pub mod objective;
engine/crates/rema-layout/src/infrastructure/search/mod.rs:114:    let mut listener = NoopListener;
engine/crates/rema-layout/src/infrastructure/search/mod.rs:120:        &mut listener,
 succeeded in 52ms:
engine/crates/rema-layout/src/domain/result.rs:35:    /// Set by the pack() orchestrator in Task 18; not validated at the type level.
engine/crates/rema-layout/src/domain/result.rs:53:    /// Set by the pack() orchestrator in Task 18; mirrors jagua-rs `BPSolution::density()`.
engine/crates/rema-layout/src/domain/result.rs:57:    /// None until populated by the pack() orchestrator in Task 18.
docs/superpowers/specs/2026-04-18-s2.5-rust-engine-design.md:114:Domain + application layers unchanged. `pack.rs` orchestrator keeps its per-bin loop but now the inner call goes through `search::optimize(seed, config)` (same signature as today's `sparrow_driver::optimize`).
engine/crates/rema-layout/src/infrastructure/search/mod.rs:3:// Single-bin search orchestrator. Wires Task 6's `exploration_phase`
engine/crates/rema-layout/src/infrastructure/search/mod.rs:9://   1. BPP scope: single-bin orchestrator. Multi-bin coordination
engine/crates/rema-layout/src/infrastructure/search/gls/compress.rs:29://       Task 8's orchestrator.
engine/crates/rema-layout/src/infrastructure/search/gls/compress.rs:54:/// orchestrator signature uniform across `explore → compress`, and so
engine/crates/rema-layout/src/infrastructure/search/terminator.rs:35:/// orchestrator to cap the exploration phase at the full per-bin
engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs:35:/// by the packing orchestrator inside the same crate.
docs/superpowers/plans/2026-04-18-s2.5-task7-compress.md:68:Task 8's `search::optimize` orchestrator will wire `explore → compress`. With compression a no-op, Task 8 should allocate 100% of `time_budget_ms` to exploration instead of the 80/20 split the parent plan described. Documented as a follow-up for Task 8's plan — not executed here.
docs/superpowers/plans/2026-04-18-s2.5-task7-compress.md:100://       without touching Task 8's orchestrator.
docs/superpowers/plans/2026-04-18-s2.5-task7-compress.md:207:      heuristic without touching the Task 8 orchestrator.
.claude/handoff/task12-gemini.md:1:# Task 12 research — FFD + swap orchestrator (Gemini voice)
.claude/handoff/task12-gemini.md:17:so the orchestrator can refine the assignment mid-optimization.
docs/superpowers/plans/2026-04-18-s2.5-task11-cross-bin-swap.md:341:**Task 11 does NOT wire into pack.rs.** That's Task 12's scope ("Integrate FFD + swap into `search::optimize`"). Task 11 ships the operators as pure functions + standalone tests; Task 12 writes the orchestrator.
engine/crates/rema-layout/README.md:8:- `src/application/pack.rs` — pack() orchestrator (Task 18)
docs/superpowers/plans/2026-04-17-s2-rust-engine.md:1288:- `src/application/pack.rs` — pack() orchestrator
docs/superpowers/plans/2026-04-17-s2-rust-engine.md:1594:### Task 13: PackError
docs/superpowers/plans/2026-04-17-s2-rust-engine.md:2101:### Task 18: `pack()` orchestrator
codex
There is already a `.claude/research/task12/codex-report.md` in the tree, but it looks like a stale handoff artifact rather than a finished report. I’m opening it to confirm whether it contains usable content or just the task brief.
exec
/bin/zsh -lc "sed -n '1,260p' '.claude/research/task12/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "wc -w '.claude/research/task12/codex-report.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "sed -n '1,220p' '.claude/handoff/task12-codex.md'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 53ms:
OpenAI Codex v0.107.0 (research preview)
--------
workdir: /Users/danielmartinezjulio/Work/arc and anchor/rema-portal
model: gpt-5.4
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019da3a9-1ebd-7c92-8d11-6f92078a6594
--------
user
# Task 12 research — FFD + swap orchestrator (Codex voice)

## Context

REMA Portal Rust nesting engine, phase S2.5b. Branch `refactor/rf-engine`,
HEAD = `0149faa` (Task 11 shipped: swap/migrate/unload operators as
single-shot pure functions on `FfdAssignment`).

 succeeded in 52ms:
    4225 .claude/research/task12/codex-report.md
 succeeded in 52ms:
# Task 12 research — FFD + swap orchestrator (Codex voice)

## Context

REMA Portal Rust nesting engine, phase S2.5b. Branch `refactor/rf-engine`,
HEAD = `0149faa` (Task 11 shipped: swap/migrate/unload operators as
single-shot pure functions on `FfdAssignment`).

Task 12 integrates those operators INTO the search loop so the
orchestrator can refine bin assignments mid-optimization, not just at
the start.

Gemini is writing a design report in parallel at
`.claude/research/task12/gemini-report.md`. You write
`.claude/research/task12/codex-report.md` as the implementation-focused
second opinion — anticipate the sharp edges, scan for correctness
invariants Gemini might miss, flag anything that will bite during impl.

## Parent plan Task 12 spec

Plan update
I’ve finished codebase reconnaissance and mapped the decision points for Task 12. Final step is drafting the implementation-focused report content from those findings.
  ✓ Read search/orchestrator, separator, operator, and pack seams
  ✓ Map Task 12 questions to concrete invariants, failure modes, and parity risks
  → Draft the report content and note the filesystem write blocker
codex
The report is ready. I’m attempting the file write now so the result lands at `.claude/research/task12/codex-report.md`; if the sandbox blocks it, I’ll return the exact markdown inline instead.
🌐 Searching the web...
🌐 Searched the web
codex
One more pass on tracker semantics: I want the report to be explicit about why hot-swapping a mutated assignment into an existing `Separator` is unsafe, not just “cleaner to rebuild.”
exec
/bin/zsh -lc "sed -n '1,320p' 'engine/crates/rema-layout/src/infrastructure/search/gls/tracker.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "rg -n \"restore_but_keep_weights|register_item_move|struct CollisionTracker|save\\(|restore\\(\" 'engine/crates/rema-layout/src/infrastructure/search/gls/tracker.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/tests/gls_integration.rs' | sed -n '1,380p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 53ms:
35:pub struct CollisionTracker {
115:    pub fn restore_but_keep_weights(&mut self, cts: &CTSnapshot, layout: &Layout) {
123:            "restore_but_keep_weights requires a same-size snapshot"
145:    pub fn save(&self) -> CTSnapshot {
149:    pub fn register_item_move(&mut self, l: &Layout, old_pk: PItemKey, new_pk: PItemKey) {
 succeeded in 53ms:
// engine/crates/rema-layout/src/infrastructure/search/gls/tracker.rs
//
// Ported from sparrow's `src/quantify/tracker.rs` (MIT, Copyright 2025
// Jeroen Gardeyn, KU Leuven).
//
// The `CollisionTracker` is the per-bin scoring cache for the GLS loop.
// It operates on `jagua_rs::entities::Layout` — a feature-flag-free type —
// so this port works identically against BPP, SPP, and MSPP problems.
//
// Deviations from upstream (all behaviorally equivalent — port is
// semantically faithful):
//   - Task 4 replaced the task-3 `matches_layout() -> true` stub with
//     calls into the real `super::assertions::tracker_matches_layout`
//     port. The debug_asserts now actually check tracker/layout parity.
//   - Unused `ordered_float::Float` import dropped (f32::max is in core).
//   - `l.placed_items.keys().for_each(|pk| ot.recompute_loss_for_item(pk, l))`
//     rewritten to collect-then-iterate for clearer borrow semantics.
//   - `match e.loss == 0.0 { true => ..., false => ... }` in
//     `update_weights` rewritten to `if/else`. Both arms return the same
//     f32 expressions as upstream.
 succeeded in 50ms:
     1	// engine/crates/rema-layout/tests/gls_integration.rs
     2	//
     3	// S2.5a Task 9 integration tests — property + timing coverage for the
     4	// explore->compress pipeline wired in Task 8.
     5	//
     6	// Design per Gemini + Codex sign-off:
     7	//   - Four properties over a handcrafted 10-fixture table (not proptest
     8	//     — the budget isn't justified for this scope; single-bin GLS is
     9	//     deterministic under fixed seed so a curated table is enough).
    10	//   - Dropped the parent plan's "density >= warm_start seed density"
    11	//     property: Codex proved on Task 8 that Separator preserves
    12	//     cardinality (separator.rs:390) and compress is identity
    13	//     (compress.rs), so density is invariant on the single-bin path.
    14	//     Asserting density-lift would be trivially true or wrong.
    15	//   - Dropped the "100 random fixtures" requirement: the 10-fixture
    16	//     handcrafted table covers the meaningful shape classes (rects,
    17	//     L-shapes, rotated, tight, loose, overflow, empty). Random
    18	//     generation would add brittleness without catching new bugs.
    19	//
    20	// The four properties asserted per fixture:
codex
There’s a bigger structural issue than just `Separator`: `exploration_phase()` also owns local pool/restart state. I’m checking that seam explicitly so the report can call out whether Task 12 is really “an orchestrator change” or a resumable-session refactor.
exec
/bin/zsh -lc "rg -n \"max_conseq_failed_attempts|pool|conseq_failed|disrupt_solution|rollback\\(selected_snap, None\\)\" 'engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs' | sed -n '100,240p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portalexec
/bin/zsh -lc "nl -ba 'engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs' | sed -n '240,360p'" in /Users/danielmartinezjulio/Work/arc and anchor/rema-portal succeeded in 51ms:
15://      max_conseq_failed_attempts".
29://      semantic: pool restart uses rollback(snap, None) -> fresh
32://   7. Large-item cutoff (disrupt_solution) computed from
36://   8. disrupt_solution's sep.move_item calls use the Task 6-restored
69:    pub max_conseq_failed_attempts: Option<usize>,
70:    pub solution_pool_distribution_stddev: f32,
79:            max_conseq_failed_attempts: None,
80:            solution_pool_distribution_stddev: 0.25,
93:    /// Ran out of budget or exhausted `max_conseq_failed_attempts`
95:    /// seen in the infeasible pool (or the starting layout if the pool
112:/// pool, biased-sample a restart via normal distribution, rollback with
124:        config.solution_pool_distribution_stddev > 0.0,
125:        "solution_pool_distribution_stddev must be > 0.0 (got {})",
126:        config.solution_pool_distribution_stddev,
136:    let mut pool: Vec<(LayoutSnapshot, f32)> = Vec::new();
138:    // Explicit counter, independent of pool.len(). Under early-exit
140:    // `config.max_conseq_failed_attempts` demands the real invariant
142:    let mut conseq_failed: usize = 0;
161:                    "infeasible pool must not receive NaN/inf loss (got {loss})"
165:                insert_sorted_by_loss(&mut pool, snapshot, loss);
 succeeded in 51ms:
   100	    },
   101	}
   102	
   103	// ---------------------------------------------------------------------------
   104	// Exploration phase driver
   105	// ---------------------------------------------------------------------------
   106	
   107	/// Algorithm 12 from <https://doi.org/10.48550/arXiv.2509.13329>,
   108	/// BPP-adapted (single-bin).
   109	///
   110	/// Loop: call `sep.separate`. On `Feasible` return immediately (density
   111	/// is fixed by the item set). On `Infeasible` insert into a loss-sorted
   112	/// pool, biased-sample a restart via normal distribution, rollback with
   113	/// fresh tracker (upstream semantic — escape behavior), and disrupt
   114	/// via swap-two-large.
   115	pub fn exploration_phase(
   116	    sep: &mut Separator,
   117	    term: &impl Terminator,
   118	    listener: &mut impl SolutionListener,
   119	    config: &ExplorationConfig,
 succeeded in 51ms:
   240	    // BPP scope: compute large-item cutoff from items CURRENTLY PLACED
   241	    // in this layout, not from instance demand totals. For SPP the two
   242	    // are identical (single strip holds everything); for BPP the
   243	    // instance carries items destined for other bins too.
   244	    let total_ch_area: f32 = sep
   245	        .layout
   246	        .placed_items
   247	        .values()
   248	        .map(|pi| {
   249	            sep.instance
   250	                .item(pi.item_id)
   251	                .shape_cd
   252	                .surrogate()
   253	                .convex_hull_area
   254	        })
   255	        .sum();
   256	    let cutoff_threshold_area = total_ch_area * config.large_item_ch_area_cutoff_percentile;
   257	
   258	    // Sort placed items by ch area desc. Walk the list accumulating
   259	    // areas until the cumulative sum exceeds the threshold; the item
codex
Write blocked by the read-only sandbox, so I could not replace [codex-report.md](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task12/codex-report.md:1>). That file currently contains a stale session transcript. The report below is the exact replacement, based on [search/mod.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/mod.rs:92>), [separator.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs:238>), [explore.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs:115>), [cross_bin_swap.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs:57>), [tracker.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/gls/tracker.rs:115>), and [pack.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/application/pack.rs:9>).

## 1. Executive summary

Needs revision. The direction is correct, but Task 12 is not just an orchestrator splice. Current APIs are batch-oriented: `exploration_phase()` owns the restart pool and `Separator::separate()` owns strike/iteration state. Interleaving cross-bin operators every K iterations requires resumable per-bin search sessions, transactional touched-bin rebuilds, and deterministic scheduling. Without that, parity and cardinality will drift.

## 2. State translation — cost analysis + recommended cadence

The expensive boundary is not `Layout -> counts`; it is `counts -> fresh seeds -> fresh BPInstance/Layout/Separator`. `assignment_from_state()` already re-materializes `Vec<Part>` and re-runs `greedy_bottom_left()` per bin, and `optimize()` then rebuilds the jagua instance and replays the seed into a fresh `Layout`. Doing that every K iterations for every bin is too much churn.

The important implementation fact is that separator iterations do not change per-bin cardinality. Within a bin, Task 8 only moves items; it never adds or removes them. That means the assignment counts are invariant between accepted operator commits. Do not derive `FfdAssignment` from live `Layout` every operator tick. Keep the count map plus overflow map from the last accepted assignment as the authoritative cross-bin state, and treat live `Layout` state as geometry-only.

Recommended cadence: operator ticks should read the cached assignment state directly. Only on `Ok(Some(new_assignment))` do you pay the rebuild cost, and only for touched bins. That makes K=50 plausible. If you instead round-trip every tick through `snapshot_to_seed()` and `state_from_assignment()`, Task 12 becomes mostly replay overhead.

Do not pass `LayoutSnapshot` directly into the operators. The operator layer currently reasons over global demand counts plus overflow. `Layout` has no overflow representation, and it does not protect the unique-`shape_id` precondition required by `replay_seed_into_layout()` once you rebuild `config.items`. The right optimization is “cache counts,” not “teach operators about mutable layout.”

## 3. Separator restart semantics

After an accepted operator move, touched bins should be hard-restarted, not hot-swapped. That applies to both `Separator` and the outer exploration state.

Reason one: `CollisionTracker::restore_but_keep_weights()` explicitly assumes same-size snapshots and matching key topology. That is debug-asserted in `tracker.rs`. `migrate` and `unload_lightest_bin` can change item counts per bin; even `swap_two` preserves count but changes the item identity mix, so cached weights and pair losses are no longer semantically attached to the same demand set.

Reason two: `exploration_phase()` owns a local infeasible pool and `conseq_failed` counter. If you interleave operators without externalizing that state, calling back into `exploration_phase()` just resets the escape behavior. Likewise `Separator::separate()` owns `n_strikes`, `n_iter`, `n_iter_no_improvement`, and the incumbent snapshot as locals. That state is not resumable today.

Recommendation: Task 12 should introduce a per-bin “search session” wrapper that persists exploration/separator progress across ticks. On operator commit, discard the sessions for changed bins, rebuild them from the operator’s new seeds, and leave untouched bins alive. Preserve neither tracker weights nor exploration pool across an assignment mutation. Preserve only RNG continuity via an orchestrator-level RNG stream.

## 4. Budget accounting formula

Use one hard global deadline and fixed per-bin soft quotas.

Formula:
`global_deadline = started_at + total_budget_ms`
`per_bin_quota_ms = total_budget_ms / n_bins_initial`

Track `gls_spent_ms[i]` only for time spent advancing bin `i`’s search session. Operator evaluation, `greedy_bottom_left` probes, and touched-bin rebuilds consume global budget only; they are not charged to a single bin. If you charge operator time to one bin, fairness is wrong. If you dynamically re-split remaining wall-clock after every operator call, reproducibility becomes timing-sensitive.

This keeps Task 12 semantically close to today’s `pack.rs`, which splits evenly up front. The difference is that the split moves inside `optimize_multi`, while a global deadline honestly captures operator overhead. If operator work is heavy, bins may finish below quota. That is acceptable. What you should not do is redistribute freed quota after an unload closes a bin; that changes later search behavior based on operator timing and will bite determinism.

## 5. Iteration counter (global vs per-bin)

Use a global round counter, not “any bin hit K.”

A round should mean: every active bin gets one resumable search step. After the round, increment `global_tick`. Run cross-bin operators when `global_tick % K == 0`.

This is the only fair interpretation of “every K iterations” in a multi-bin scheduler. Per-bin counters bias toward whichever bin is cheaper to advance or reaches local minima faster. That makes operator timing depend on intra-bin difficulty, not on global search progress. It also means some operator decisions would be made against stale states in lagging bins.

The existing `SearchState.iteration` field is a natural place to expose this value. Keep per-bin local iteration counts internal.

## 6. Operator exhaustion back-off

`Ok(None)` should not end the operator phase for that tick, and it should not immediately reschedule the same work K iterations later forever.

Recommended policy: on an operator tick, try a deterministic ladder. `unload_lightest_bin` first, then `migrate`, then `swap_two`. That matches the acceptance metric: closing bins dominates, migration can still close a source bin, swap cannot. Commit the first `Ok(Some(...))` that succeeds. If all return `Ok(None)`, increase the next operator gap with exponential back-off: `gap = min(gap * 2, max_gap)`. Reset the gap to the default K on any successful commit.

This matters because all three operators use `greedy_bottom_left` as a fit oracle. Repeated fruitless ticks will otherwise spend a lot of time re-probing the same assignment state with no chance of change. Back-off should be global to the assignment, not per-bin.

## 7. pack.rs refactor scope

`pack.rs` should become a thin result assembler. It should keep request validation, wall-clock timing, final `PackResult` aggregation, per-bin metric computation, overflow recomputation from placed counts, and global `instance_index` renumbering.

It should stop doing the per-bin search loop, stop building `OptimizerConfig` per bin, and stop calling `items_for_seed()` as part of the live optimization path. If the Task 12 signature is fixed as `optimize_multi(request, seeds, cfg)`, `pack.rs` may still do a single up-front `ffd_assign()` and pass the initial seeds in. Everything after that belongs in search.

Do not drop the global renumbering step. Search-layer `SeedPlacement.instance_index` is still bin-local after `snapshot_to_seed()`. The test in `pack.rs` that requires global uniqueness per shape will fail if you flatten `Vec<SeedResult>` directly into `Placement` without a global pass.

One more parity detail: when rebuilding per-bin `items`, preserve original request order, not `shape_id` order. `snapshot_to_seed()` sorts by `item_id`, and `item_id` depends on `config.items` order. If you rebuild changed bins with a different ordering policy than the original path, placement tuple order changes even when geometry does not.

## 8. Error propagation + rollback

Hard errors should abort the whole request immediately. `Ok(None)` is recoverable. `Err(PackError)` is not.

Task 12 should stage operator commits transactionally:
1. compute candidate `FfdAssignment`
2. diff touched bins
3. rebuild all touched sessions off to the side
4. swap the live state only after every rebuild succeeds

If any rebuild, replay, or operator probe returns `Err`, return that error and leave the current live state untouched. Do not partially commit. Do not “recover” by falling back to a pre-operator assignment and continuing. At that point you no longer know whether the search session, RNG stream, or parity bookkeeping is still coherent.

A separator-level `Err(PackError::EngineFailed)` does not exist today because `separate()` is not fallible, but if Task 12 introduces fallible stepping, treat it the same way: fail fast. Silent recovery here will only hide invariant bugs.

## 9. Parity risk assessment

Task 9’s single-bin integration fixtures do not need updates if Task 12 preserves a true single-bin fast path. Either keep `optimize()` exactly as-is for one-bin requests, or make `optimize_multi()` degenerate to the same behavior when `n_bins <= 1` and operators are impossible.

If you route single-bin requests through a newly sessionized multi-bin scheduler, the first likely regression is `property_deterministic_under_seed`. The causes are predictable: operator cadence keyed off wall-clock, reset RNGs on restart, or changed placement ordering after rebuilding `config.items`. `timing_fast_mode_under_ceiling` is the second likely regression because operator checks add extra oracle calls even when they are no-ops.

On the pack path, `instance_indices_are_globally_unique_per_shape` is fragile if global renumbering moves or disappears. `property_cardinality_preserved` becomes fragile if final results mix stale live layouts from untouched bins with operator-produced seeds from touched bins without a single authoritative commit point.

## 10. Sharp edges / gotchas

1. `exploration_phase()` is not resumable. It owns pool sampling, rollback, and disruption state internally.
2. `Separator::separate()` is not resumable. Its strike counters and incumbent snapshot are locals, so chunking it changes behavior.
3. `Layout` does not encode overflow. If you make layout the source of truth, overflowed demand disappears.
4. `restore_but_keep_weights()` is only safe for same-size, same-key tracker topology. Do not use it across assignment mutations.
5. Rebuilding changed bins with a different `config.items` order changes `item_id`, which changes deterministic placement ordering.
6. Global `instance_index` uniqueness is still a `pack.rs` responsibility unless you explicitly move that renumbering elsewhere.
7. Recreating touched separators from `request.seed` each time resets RNG trajectories. Use an orchestrator RNG stream and draw fresh seeds from it.
8. Empty bins must remain present in the returned `Vec<SeedResult>`, especially after `unload_lightest_bin` closes one.
9. Rebuilding every bin after every accepted operator move is simpler but wrong for parity and expensive in practice. Diff touched bins.
10. Operator timing based on “any bin reached K” favors easy bins and makes cross-bin decisions against stale lagging bins.
11. Coarse timeout polling already exists in the separator loop. Without a finer step API, Task 12 will overshoot both operator cadence and budget checks.
12. A deterministic `Ok(None)` back-off is mandatory. Otherwise Task 12 burns time re-probing stagnant assignments and looks slow for no search gain.

## 11. Verdict

Needs revision before implementation. The missing pieces are explicit: resumable per-bin exploration sessions, authoritative cached assignment counts plus overflow, transactional touched-bin rebuilds, fixed-quote/global-deadline budget accounting, and deterministic operator/back-off scheduling. If those are added to the Task 12 plan, the implementation is straightforward. If not, the search loop will devolve into batch restarts with parity drift.
tokens used
113,887
Write blocked by the read-only sandbox, so I could not replace [codex-report.md](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task12/codex-report.md:1>). That file currently contains a stale session transcript. The report below is the exact replacement, based on [search/mod.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/mod.rs:92>), [separator.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs:238>), [explore.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs:115>), [cross_bin_swap.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs:57>), [tracker.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/infrastructure/search/gls/tracker.rs:115>), and [pack.rs](</Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/src/application/pack.rs:9>).

## 1. Executive summary

Needs revision. The direction is correct, but Task 12 is not just an orchestrator splice. Current APIs are batch-oriented: `exploration_phase()` owns the restart pool and `Separator::separate()` owns strike/iteration state. Interleaving cross-bin operators every K iterations requires resumable per-bin search sessions, transactional touched-bin rebuilds, and deterministic scheduling. Without that, parity and cardinality will drift.

## 2. State translation — cost analysis + recommended cadence

The expensive boundary is not `Layout -> counts`; it is `counts -> fresh seeds -> fresh BPInstance/Layout/Separator`. `assignment_from_state()` already re-materializes `Vec<Part>` and re-runs `greedy_bottom_left()` per bin, and `optimize()` then rebuilds the jagua instance and replays the seed into a fresh `Layout`. Doing that every K iterations for every bin is too much churn.

The important implementation fact is that separator iterations do not change per-bin cardinality. Within a bin, Task 8 only moves items; it never adds or removes them. That means the assignment counts are invariant between accepted operator commits. Do not derive `FfdAssignment` from live `Layout` every operator tick. Keep the count map plus overflow map from the last accepted assignment as the authoritative cross-bin state, and treat live `Layout` state as geometry-only.

Recommended cadence: operator ticks should read the cached assignment state directly. Only on `Ok(Some(new_assignment))` do you pay the rebuild cost, and only for touched bins. That makes K=50 plausible. If you instead round-trip every tick through `snapshot_to_seed()` and `state_from_assignment()`, Task 12 becomes mostly replay overhead.

Do not pass `LayoutSnapshot` directly into the operators. The operator layer currently reasons over global demand counts plus overflow. `Layout` has no overflow representation, and it does not protect the unique-`shape_id` precondition required by `replay_seed_into_layout()` once you rebuild `config.items`. The right optimization is “cache counts,” not “teach operators about mutable layout.”

## 3. Separator restart semantics

After an accepted operator move, touched bins should be hard-restarted, not hot-swapped. That applies to both `Separator` and the outer exploration state.

Reason one: `CollisionTracker::restore_but_keep_weights()` explicitly assumes same-size snapshots and matching key topology. That is debug-asserted in `tracker.rs`. `migrate` and `unload_lightest_bin` can change item counts per bin; even `swap_two` preserves count but changes the item identity mix, so cached weights and pair losses are no longer semantically attached to the same demand set.

Reason two: `exploration_phase()` owns a local infeasible pool and `conseq_failed` counter. If you interleave operators without externalizing that state, calling back into `exploration_phase()` just resets the escape behavior. Likewise `Separator::separate()` owns `n_strikes`, `n_iter`, `n_iter_no_improvement`, and the incumbent snapshot as locals. That state is not resumable today.

Recommendation: Task 12 should introduce a per-bin “search session” wrapper that persists exploration/separator progress across ticks. On operator commit, discard the sessions for changed bins, rebuild them from the operator’s new seeds, and leave untouched bins alive. Preserve neither tracker weights nor exploration pool across an assignment mutation. Preserve only RNG continuity via an orchestrator-level RNG stream.

## 4. Budget accounting formula

Use one hard global deadline and fixed per-bin soft quotas.

Formula:
`global_deadline = started_at + total_budget_ms`
`per_bin_quota_ms = total_budget_ms / n_bins_initial`

Track `gls_spent_ms[i]` only for time spent advancing bin `i`’s search session. Operator evaluation, `greedy_bottom_left` probes, and touched-bin rebuilds consume global budget only; they are not charged to a single bin. If you charge operator time to one bin, fairness is wrong. If you dynamically re-split remaining wall-clock after every operator call, reproducibility becomes timing-sensitive.

This keeps Task 12 semantically close to today’s `pack.rs`, which splits evenly up front. The difference is that the split moves inside `optimize_multi`, while a global deadline honestly captures operator overhead. If operator work is heavy, bins may finish below quota. That is acceptable. What you should not do is redistribute freed quota after an unload closes a bin; that changes later search behavior based on operator timing and will bite determinism.

## 5. Iteration counter (global vs per-bin)

Use a global round counter, not “any bin hit K.”

A round should mean: every active bin gets one resumable search step. After the round, increment `global_tick`. Run cross-bin operators when `global_tick % K == 0`.

This is the only fair interpretation of “every K iterations” in a multi-bin scheduler. Per-bin counters bias toward whichever bin is cheaper to advance or reaches local minima faster. That makes operator timing depend on intra-bin difficulty, not on global search progress. It also means some operator decisions would be made against stale states in lagging bins.

The existing `SearchState.iteration` field is a natural place to expose this value. Keep per-bin local iteration counts internal.

## 6. Operator exhaustion back-off

`Ok(None)` should not end the operator phase for that tick, and it should not immediately reschedule the same work K iterations later forever.

Recommended policy: on an operator tick, try a deterministic ladder. `unload_lightest_bin` first, then `migrate`, then `swap_two`. That matches the acceptance metric: closing bins dominates, migration can still close a source bin, swap cannot. Commit the first `Ok(Some(...))` that succeeds. If all return `Ok(None)`, increase the next operator gap with exponential back-off: `gap = min(gap * 2, max_gap)`. Reset the gap to the default K on any successful commit.

This matters because all three operators use `greedy_bottom_left` as a fit oracle. Repeated fruitless ticks will otherwise spend a lot of time re-probing the same assignment state with no chance of change. Back-off should be global to the assignment, not per-bin.

## 7. pack.rs refactor scope

`pack.rs` should become a thin result assembler. It should keep request validation, wall-clock timing, final `PackResult` aggregation, per-bin metric computation, overflow recomputation from placed counts, and global `instance_index` renumbering.

It should stop doing the per-bin search loop, stop building `OptimizerConfig` per bin, and stop calling `items_for_seed()` as part of the live optimization path. If the Task 12 signature is fixed as `optimize_multi(request, seeds, cfg)`, `pack.rs` may still do a single up-front `ffd_assign()` and pass the initial seeds in. Everything after that belongs in search.

Do not drop the global renumbering step. Search-layer `SeedPlacement.instance_index` is still bin-local after `snapshot_to_seed()`. The test in `pack.rs` that requires global uniqueness per shape will fail if you flatten `Vec<SeedResult>` directly into `Placement` without a global pass.

One more parity detail: when rebuilding per-bin `items`, preserve original request order, not `shape_id` order. `snapshot_to_seed()` sorts by `item_id`, and `item_id` depends on `config.items` order. If you rebuild changed bins with a different ordering policy than the original path, placement tuple order changes even when geometry does not.

## 8. Error propagation + rollback

Hard errors should abort the whole request immediately. `Ok(None)` is recoverable. `Err(PackError)` is not.

Task 12 should stage operator commits transactionally:
1. compute candidate `FfdAssignment`
2. diff touched bins
3. rebuild all touched sessions off to the side
4. swap the live state only after every rebuild succeeds

If any rebuild, replay, or operator probe returns `Err`, return that error and leave the current live state untouched. Do not partially commit. Do not “recover” by falling back to a pre-operator assignment and continuing. At that point you no longer know whether the search session, RNG stream, or parity bookkeeping is still coherent.

A separator-level `Err(PackError::EngineFailed)` does not exist today because `separate()` is not fallible, but if Task 12 introduces fallible stepping, treat it the same way: fail fast. Silent recovery here will only hide invariant bugs.

## 9. Parity risk assessment

Task 9’s single-bin integration fixtures do not need updates if Task 12 preserves a true single-bin fast path. Either keep `optimize()` exactly as-is for one-bin requests, or make `optimize_multi()` degenerate to the same behavior when `n_bins <= 1` and operators are impossible.

If you route single-bin requests through a newly sessionized multi-bin scheduler, the first likely regression is `property_deterministic_under_seed`. The causes are predictable: operator cadence keyed off wall-clock, reset RNGs on restart, or changed placement ordering after rebuilding `config.items`. `timing_fast_mode_under_ceiling` is the second likely regression because operator checks add extra oracle calls even when they are no-ops.

On the pack path, `instance_indices_are_globally_unique_per_shape` is fragile if global renumbering moves or disappears. `property_cardinality_preserved` becomes fragile if final results mix stale live layouts from untouched bins with operator-produced seeds from touched bins without a single authoritative commit point.

## 10. Sharp edges / gotchas

1. `exploration_phase()` is not resumable. It owns pool sampling, rollback, and disruption state internally.
2. `Separator::separate()` is not resumable. Its strike counters and incumbent snapshot are locals, so chunking it changes behavior.
3. `Layout` does not encode overflow. If you make layout the source of truth, overflowed demand disappears.
4. `restore_but_keep_weights()` is only safe for same-size, same-key tracker topology. Do not use it across assignment mutations.
5. Rebuilding changed bins with a different `config.items` order changes `item_id`, which changes deterministic placement ordering.
6. Global `instance_index` uniqueness is still a `pack.rs` responsibility unless you explicitly move that renumbering elsewhere.
7. Recreating touched separators from `request.seed` each time resets RNG trajectories. Use an orchestrator RNG stream and draw fresh seeds from it.
8. Empty bins must remain present in the returned `Vec<SeedResult>`, especially after `unload_lightest_bin` closes one.
9. Rebuilding every bin after every accepted operator move is simpler but wrong for parity and expensive in practice. Diff touched bins.
10. Operator timing based on “any bin reached K” favors easy bins and makes cross-bin decisions against stale lagging bins.
11. Coarse timeout polling already exists in the separator loop. Without a finer step API, Task 12 will overshoot both operator cadence and budget checks.
12. A deterministic `Ok(None)` back-off is mandatory. Otherwise Task 12 burns time re-probing stagnant assignments and looks slow for no search gain.

## 11. Verdict

Needs revision before implementation. The missing pieces are explicit: resumable per-bin exploration sessions, authoritative cached assignment counts plus overflow, transactional touched-bin rebuilds, fixed-quote/global-deadline budget accounting, and deterministic operator/back-off scheduling. If those are added to the Task 12 plan, the implementation is straightforward. If not, the search loop will devolve into batch restarts with parity drift.
