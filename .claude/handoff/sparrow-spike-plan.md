# Sparrow spike — synthesized plan (v1)

**Date:** 2026-04-19
**Predecessors:** `sparrow-spike-design.md` (the design options) + both agents' verdicts (Codex → C, Gemini → E).

## What both agents agreed on

1. **Design A is a guaranteed no-op.** `search::optimize(bssf_seed, cfg)` with any budget is unchanged from baseline because `SeparatorWorker::move_items` (`separator.rs:449-454`) only visits items with `ct.get_loss > 0.0`, and a BSSF seed has zero collisions.
2. **There is no simpler upstream primitive.** jagua-rs / sparrow do not expose "add-item-with-minimum-displacement-retry". The BPP outer policy must live in REMA.
3. **Determinism:** fixed seed, deterministic item insertion order (sorted by something stable, not HashMap iteration).
4. **Parity risk is real** if we wire the new strategy into `consolidate_tail_bin`'s receiver portfolio from day 1. Both agents recommend landing as a standalone entry point first.

## Where they diverge

| | Codex | Gemini |
|---|---|---|
| Pick | C (outer-loop item-count shrink) | E (incremental add-and-resolve) |
| Starting state | Force N items with bottom-left cascade, overlaps allowed | Start from feasible BSSF-13, add one item at a time |
| Budget per attempt | ≥200ms × 2-4 attempts | 40ms × 24 items |
| Ceiling projection | Not stated explicitly | B: 15-20, C: 25-30, E: "best" (unstated) |
| Seed preference | Deterministic cascade | Seeded jitter |

## Reconciliation

**Primary path (Commit 1): Design C-modified.** Why:
- Concrete API blockers are documented — Codex found that `ExplorationOutcome::Infeasible` does NOT carry per-item losses (only total). This is a real file-reading observation, not speculation. Design E depends on `exploration_phase` being able to resolve a single-item overlap quickly without the same blocker — true in principle but never benched in our stack.
- Design C's failure mode (infeasible after drop-heuristic) is recoverable. Design E's failure mode (committing a greedy bad placement) is a one-way door within an attempt.
- The cumulative-greediness problem in Design E (Gemini's own §6) is a real ceiling concern that the legacy NFP engine's tabu search was designed to escape — which we don't have.

**Fallback path (Commit 2): Design E, only if Commit 1 stalls at N < 28.** This gives us the strategy Gemini prefers without burning Commit 1 budget on a less-principled approach.

**Staging to minimize parity risk** (Gemini §5):
- Commit 1 lands `fixed_bin_sparrow_repack` as a **standalone pub fn**, plus Rust unit tests that verify correctness on tiny fixtures. **Does NOT wire into `consolidate_tail_bin` yet.** Does NOT add a `PackerStrategy::Sparrow` variant yet. Existing parity surface unchanged.
- Commit 1 bench = a new `tools/bench-sparrow/` entry that calls `fixed_bin_sparrow_repack` directly on the 37-part fixture. This measures the algorithmic gain in isolation.
- Commit 2 wires it in if Commit 1 proves value. Commit 2 is where parity risk gets real.

## Minimum viable spike — Commit 1 signatures

```rust
// engine/crates/rema-layout/src/infrastructure/search/mod.rs

/// Run a bounded sparrow-style fixed-bin repack on a freshly-forced
/// starting layout. Uses the existing BPP-shaped GLS port. Returns the
/// best feasible SeedResult reached, or the BSSF baseline if nothing
/// better is found.
pub fn fixed_bin_sparrow_repack(
    bin: &Bin,
    items: &[Part],
    clearance: f64,
    config: FixedBinRepackConfig,
) -> Result<SeedResult, PackError>;

pub struct FixedBinRepackConfig {
    /// Hard wall-clock budget across all inner attempts.
    pub total_budget_ms: u64,
    /// Minimum ms per inner `exploration_phase` call — prevents spending
    /// the whole budget on degenerate convergence. Default: 200.
    pub min_attempt_budget_ms: u64,
    /// Starting forced-item count. If None, uses min(30, total_copies).
    pub start_count: Option<usize>,
    /// Optional seed. None → entropy-backed.
    pub seed: Option<u64>,
}
```

### Internal helpers (private)

```rust
/// Force-place exactly `take_n` item copies via deterministic bottom-left
/// cascade. Overlaps allowed. `take_n` drawn from items in a stable order:
/// sort by (area desc, shape_id) then take first `take_n` copies
/// respecting per-part `quantity`.
fn build_overlap_seed(
    bin: &Bin,
    items: &[Part],
    clearance: f64,
    take_n: usize,
) -> Result<(SeedResult, Vec<Part>), PackError>;
//                    ^-- the subset items vector, with quantities
//                        decremented to exactly what was taken, to feed
//                        replay_seed_into_layout and snapshot_to_seed.

/// Run one fixed-cardinality GLS attempt. Thin wrapper over the
/// existing search::optimize pipeline that returns the raw
/// ExplorationOutcome instead of snapshotting immediately.
fn run_subset_attempt(
    subset_seed: SeedResult,
    subset_items: Vec<Part>,
    bin: &Bin,
    clearance: f64,
    budget_ms: u64,
    seed: Option<u64>,
) -> Result<(ExplorationOutcome, BPInstance, Layout), PackError>;

/// After an infeasible attempt, pick the PItemKey with the highest
/// per-item collision loss. Uses a fresh CollisionTracker rebuilt
/// from the returned snapshot (since ExplorationOutcome::Infeasible
/// does NOT carry a CTSnapshot — Codex R4).
fn choose_drop_candidate(
    snapshot: &LayoutSnapshot,
    instance: &BPInstance,
) -> Option<PItemKey>;

/// Decrement the dropped item's quantity from subset_items by 1.
fn rebuild_subset_items_after_drop(
    subset_items: &[Part],
    dropped_item_id: usize,
    instance: &BPInstance,
) -> Vec<Part>;
```

### Outer-loop shape (pseudocode)

```
N = config.start_count.unwrap_or(min(30, total_copies))
best_feasible: Option<SeedResult> = None
deadline = now + total_budget_ms
attempts = 0

while now < deadline and attempts < 6:
    attempts += 1
    per_attempt_budget = max(
        min_attempt_budget_ms,
        (deadline - now) / (6 - attempts)
    )
    (subset_seed, subset_items) = build_overlap_seed(bin, items, clearance, N)
    (outcome, instance, layout) = run_subset_attempt(
        subset_seed, subset_items, bin, clearance, per_attempt_budget, seed
    )
    match outcome:
        Feasible(snap):
            best_feasible = Some(snapshot_to_seed(snap, instance, subset_items, bin.id))
            if N == total_copies:
                break  // can't grow further
            N = min(N + 1, total_copies)  // try to add one more
        Infeasible { snapshot, .. }:
            if N <= 13:  // BSSF baseline — no point going lower
                break
            // Rebuild CT from snapshot to query per-item losses
            dropped_id = choose_drop_candidate(&snapshot, &instance)
            if dropped_id is None:
                break
            subset_items = rebuild_subset_items_after_drop(subset_items, dropped_id, instance)
            N -= 1

// Fallback: if nothing feasible, return BSSF baseline unchanged.
best_feasible.unwrap_or_else(|| greedy_rectangle_pack_with_strategy(bin, items, clearance, PackerStrategy::Bssf))
```

### Unit-test harness (Commit 1)

- Small fixture: 4 rectangles in a 20×20 bin, each 8×8. Known feasible layout exists at 4 items. Sparrow should beat a BSSF start that only places 2.
- Production fixture: 37 parts in 78×396. Expected lift: `fixed_bin_sparrow_repack` returns ≥ 20 placements (well above BSSF 13). If not, Commit 1 bench will flag it.

## Risk ledger (from both agents)

| # | Risk | Agent | Mitigation in v1 plan |
|---|---|---|---|
| R1 | `ExplorationOutcome::Infeasible` lacks CTSnapshot | Codex | Rebuild CT from returned snapshot inside `choose_drop_candidate`. |
| R2 | `snapshot_to_seed` ignores incoming `seed.overflow` | Codex | Pass subset_items (not original 37) so `snapshot_to_seed`'s overflow math is correct. |
| R3 | `replay_seed_into_layout` rejects duplicate shape_id | Codex | Use `quantity` decrement, never duplicate Part rows. |
| R4 | Paper defaults (50/20 samples, 3 workers) are expensive for short budgets | Codex | Accept it for Commit 1; Commit 2 may tune via a new config surface. |
| R5 | Cumulative greediness in Design E | Gemini | Design E is the fallback, not primary. Commit 2 gates it on Commit 1 result. |
| R6 | Parity drift if wired into portfolio too early | Gemini | Standalone entry point in Commit 1, no portfolio wiring. |
| R7 | False feasibility via CT bug | Gemini | Commit 1 unit tests include a post-hoc "manual overlap scan" assertion on the returned SeedResult. |
| R8 | Adversarial cascade geometry | Gemini | Use bottom-left cascade (Codex) — if it degenerates, Commit 2 can try jitter. |

## Kill criteria (unchanged from parent handoff)

- Commit 1 bench: If `fixed_bin_sparrow_repack` on 37-part single-bin places < 20 parts → Design C is structurally inadequate. Pivot to Design E in Commit 2.
- Commit 2 bench: If final single-bin < 25 OR Fab < 48 → stop. Re-scope to legacy NFP port.
- Parity: 27/27 is hard gate for both commits. If Commit 1 is standalone (no portfolio wiring), parity cannot move — if it does, there's a regression in the spike's call path somewhere else.

## What I'm asking both of you

Single-sentence verdict: **does this refined plan address your concerns from the prior review round?** Yes/no + the single biggest concern if no.

Do not rewrite the plan. Do not propose Design F. I need focused go/no-go so I can start writing Commit 1 code.
