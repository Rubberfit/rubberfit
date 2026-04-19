# Task 6 deep-read — exploration phase (BPP port of sparrow explore.rs)

Design notes for `engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs`, grounded against sparrow `src/optimizer/explore.rs` (240 LOC), sparrow `src/config.rs`, jagua-rs 0.7.1 BPP entities, and the merged Task 5 port at `gls/separator.rs`.

Bridge note: the repo does not ship `scripts/gemini-bridge.js`; this report was produced by direct cross-reading of the four sources rather than through the bridge. Output is semantically equivalent — concrete line refs, no hand-waving.

---

## 1. BPP analogue of `exploration_phase`

Sparrow's exploration is a **width-shrinking** loop (SPP): after each successful separation it calls `sep.change_strip_width(current * (1 - shrink_step))` (explore.rs L46-50) and re-runs the inner `separate()`. BPP bins are fixed-size (`Container::area()` invariant in layout.rs L109-111), so "shrinking" is not a knob we own. Our Task 5 `Separator` is already scoped to a single `Layout` and knows nothing about `BPProblem` — "continued exploration" at this layer can only mean **keep perturbing the layout to find an arrangement with the same item set but better internal packing**, so compress (Task 7) + cross-bin swap (Task 12) have more starting material.

Concretely:
- Warm-start enters with N items placed. Feasibility does not change per-bin density — item areas are fixed.
- "Better" cannot mean "fit more items in this bin" — Task 5's Separator has no add-item path, and the plan (L77-78) defers multi-bin to Task 12.
- "Better" means "same item set, tighter geometry" — quantified by total weighted loss after separation attempts; diversity of feasible layouts benefits Task 7/12.

Recommended loop structure:

```
fn exploration_phase(sep, term, listener, config) -> ExplorationOutcome {
    let mut feasible: Vec<LayoutSnapshot> = vec![sep.layout.save()];
    let mut infeas: Vec<(LayoutSnapshot, CTSnapshot, f32)> = vec![];
    while !term.kill() {
        match sep.separate(term, listener) {
            Feasible(snap) => {
                feasible.push(snap.clone());
                listener.report_feasible(&snap);
                sep.rollback(&snap, None);       // fresh weights
                disrupt_solution(sep, config);   // diversify
                infeas.clear();
            }
            Infeasible { snapshot, ct_snapshot } => {
                let loss = sep.ct.get_total_loss();
                insert_sorted(&mut infeas, (snapshot, ct_snapshot, loss));
                if infeas.len() >= config.max_conseq_failed_attempts.unwrap_or(usize::MAX) { break; }
                let (snap, ct_snap) = sample_biased(&infeas, &mut sep.rng,
                                                   config.solution_pool_distribution_stddev);
                sep.rollback(&snap, Some(&ct_snap));
                disrupt_solution(sep, config);
            }
        }
    }
    ExplorationOutcome { feasible, best_infeasible: infeas.into_iter().next().map(|(s, _, l)| (s, l)) }
}
```

Key calls:
- **Return `LayoutSnapshot`, not `BPSolution`.** `BPSolution` (bpp/entities/solution.rs L8-14) is a `SecondaryMap<LayKey, LayoutSnapshot>` — Task 8/12 assemble those at the multi-bin layer. Plan line 91 "best-feasible BPSolution" is a naming hangover; in a fixed-bin world the correct artifact is "pool of feasible layouts for this bin".
- **Do not exit on first feasibility.** Continue until `term.kill()` or `max_conseq_failed_attempts`. Greedy warm-start with N items at capacity is usually infeasible; even when feasible, a diverse pool feeds Task 7/12.

---

## 2. Type map SPP → BPP for explore.rs

| sparrow symbol | upstream line | BPP / Layout equivalent |
|---|---|---|
| `SPInstance` fn param | L21 | drop — our listener is instance-free (separator.rs L141-143) |
| `SPSolution` pool/return | L21,L86 | `LayoutSnapshot` |
| `sep.prob.strip_width()` | L22-23 | delete |
| `sep.prob.save()/restore` | L25 | `sep.layout.save()/restore()` — or wrap via `sep.rollback(snap, ct_opt)` (separator.rs L373-379) |
| `sep.prob.density()` (log) | L28,L40 | `sep.layout.density(&sep.instance)` — layout.rs L109-111 |
| `sep.change_strip_width(...)` | L48 | delete — replace with `rollback + disrupt_solution` (§1) |
| `local_best.1.get_total_loss()` | L35 | `sep.ct.get_total_loss()` or use `ct_snapshot` inside `SeparateOutcome::Infeasible` (separator.rs L114-126) |
| `sep.prob.instance.items` | L105-119 | `sep.instance.items` — `BPInstance.items: Vec<(Item, usize)>` (instance.rs L10) |
| `sep.prob.layout.placed_items` | L90,L139,L155,L185,L204 | `sep.layout.placed_items` — identical `SlotMap<PItemKey, PlacedItem>` (layout.rs L18) |
| `sep.prob.instance.item(id)` | L167-168,L194,L212 | `sep.instance.item(id)` — `BPInstance` impls `Instance` (instance.rs L56) |
| `sep.move_item(pk, dt)` | L172-173,L195,L213 | **absent on our `Separator`** (Task 5 deviation #3). Inline 3 lines (remove+place+register) in explore.rs — keep separator.rs minimal. |
| `sep.rng` | L69,L143,L153,L157 | identical — same `Xoshiro256PlusPlus` |

Verified: our Task 5 `Separator` exposes every field explore.rs needs except a public `move_item`. That one is best resolved by inlining in disrupt rather than extending separator.rs.

---

## 3. `disrupt_solution` port

Upstream (L89-216) is largely Layout-generic:

- **L90** `placed_items.len() < 2` guard → `sep.layout.placed_items.len() < 2`. Direct.
- **L102-108** total convex hull area from `items` × qty → `sep.instance.items`. Uses `item.shape_cd.surrogate().convex_hull_area`, still public in jagua-rs 0.7.1. Direct.
- **L110** cutoff = `total × config.large_item_ch_area_cutoff_percentile`. Direct.
- **L113-135** sort desc by ch area, accumulate until > threshold. Direct.
- **L139-159** pick two distinct "large" items via `IteratorRandom::choose(rng)` + diff-enough filter + fallback. Direct — change `sep.prob.layout` → `sep.layout`.
- **L161-173** swap via two `sep.move_item` calls. **Inline as `remove_item + place_item + ct.register_item_move`** (see §2 row). No public method addition to separator.rs.
- **L167-168** `convert_sample_to_closest_feasible(dt, item)` — **already ported** at `gls/uniform_sampler.rs` L135-155. Same signature. No port action.
- **L180-215** relocate practically-contained items via relative transformation (`dt1_new.compose().inverse().transform(&dt1_old.compose())`). All methods public in jagua-rs 0.7.1 `geometry::DTransformation`/`Transformation`. Port direct.
- **L219-240** `practically_contained_items(&Layout, PItemKey) -> Vec<PItemKey>` — Layout-generic. Uses `layout.cde().collect_poly_collisions` (L123-125), `HazardEntity::PlacedItem` filter, `CollidesWith` on POI center. Port verbatim as private fn in explore.rs.

---

## 4. Infeasible solution pool

Upstream: `Vec<(SPSolution, f32)>` sorted by loss asc; `binary_search_by` for insertion-sort (L56-58); `Normal::new(0.0, stddev).sample(rng).abs().min(0.999)` scaled to pool length for index selection (L66-75). Ports cleanly.

Our pool: `Vec<(LayoutSnapshot, CTSnapshot, f32)>`. We carry `CTSnapshot` because `sep.rollback(snap, Some(&ct_snap))` preserves GLS weights via `restore_but_keep_weights` (separator.rs L373-378); upstream discards weights on strip-shrink rollback, we don't shrink, so preserving is cheap and correct.

**Dep addition required**: `rand_distr::Normal` is **not in Cargo.toml** (only `rand = "0.10"`, `rand_xoshiro = "0.8"` — Cargo.toml L16-17). Add `rand_distr = "0.5"` (rand-0.10 compatible). Mark: **port-now dep**.

---

## 5. Cancel/progress hooks — reuse Task 5 traits

Plan line 94 (`cancel_token: &AtomicBool` + `progress_callback: &ProgressCallback`) predates Task 5. Task 5 introduced `Terminator` + `SolutionListener` with `NoopTerminator` / `NoopListener` (separator.rs L135-155) specifically as the common hook surface. Task 14 will swap the Noop impls for real `AtomicBool` + NDJSON emitters **without changing trait signatures**.

**Recommendation: reuse the traits.** Justification:

1. **Uniform surface.** `separate()` already takes `&impl Terminator`. If explore takes `&AtomicBool`, it has to wrap the bool in an ad-hoc struct before calling `sep.separate(term, listener)` — indirection the trait abstracts away.
2. **Task 14 churn containment.** Trait-taking explore => Task 14 only changes *impls*, not signatures.
3. **Listener extension.** Current `SolutionListener` has only `report_improving`. Explore needs to report ExplFeas/ExplInfeas events (sparrow `ReportType::{ExplFeas, ExplInfeas, ExplImproving}` in `src/util/listener.rs` L11-15). Add two methods with default `{}` impls so `NoopListener` keeps compiling unedited; Task 14 fills them with NDJSON.

Signature:

```
pub fn exploration_phase(
    sep: &mut Separator,
    term: &impl Terminator,
    listener: &mut impl SolutionListener,
    config: &ExplorationConfig,
) -> ExplorationOutcome
```

Drop the leading `instance: &BPInstance` param — no consumer left once the listener is instance-free.

---

## 6. ExplorationConfig shape + paper defaults

Upstream (`src/config.rs` L30-37, defaults L55-74):

```rust
#[derive(Debug, Clone, Copy)]
pub struct ExplorationConfig {
    pub max_conseq_failed_attempts: Option<usize>,
    pub solution_pool_distribution_stddev: f32,
    pub large_item_ch_area_cutoff_percentile: f32,
    pub separator_config: SeparatorConfig,
}

impl ExplorationConfig {
    pub fn paper_defaults() -> Self {
        Self {
            max_conseq_failed_attempts: None,           // upstream L60
            solution_pool_distribution_stddev: 0.25,    // upstream L61
            large_item_ch_area_cutoff_percentile: 0.75, // upstream L73
            separator_config: SeparatorConfig::exploration(), // gls/separator.rs L71-84
        }
    }
}
```

Deleted fields: `shrink_step` (SPP-only, L58), `time_limit` (belongs on Terminator, L59). `paper_defaults` naming mirrors Task 5's `SeparatorConfig::exploration()`. Task 18 will add `rema_default()`.

---

## 7. Budget wiring

**Explore takes a pre-armed `Terminator`, not `time_budget_ms`**.

Reasons:
1. Task 8 (`search::optimize`) is the natural split point for the 80/20 explore/compress budget — policy belongs at the caller.
2. Matches sparrow: `exploration_phase(..., term: &impl Terminator, ...)` (upstream L21). Sparrow's driver arms before each call.
3. Keeps explore.rs unit-testable without Instant/Duration (pass `NoopTerminator` or `KillImmediately` — same pattern as separator.rs L599-604).

Task 8 will do:
```
let explore_term = BasicTerminator::with_timeout(Duration::from_millis(cfg.time_budget_ms * 80 / 100));
let outcome = exploration_phase(&mut sep, &explore_term, &mut listener, &expl_cfg);
```

`BasicTerminator` not yet ported. Port inline in Task 6 (upstream `src/util/terminator.rs` — 45 LOC). Task 14 extends unchanged with AtomicBool.

---

## 8. Unit tests

Four tests, seed-42 deterministic (matches separator.rs L467):

(a) **feasible_seed_returns_populated_pool** — two 10×10 squares at (10,10)/(50,50) in 100×100 bin (shape of separator.rs L521-537). Assert pool non-empty, first element matches seed by `placed_items.len()`. Use a `CountingTerminator { counter: Cell<u32>, max: 3 }` so the loop runs a few iterations then exits.

(b) **resolvable_overlap_reaches_feasibility** — two 10×10 at (10,10)/(15,15), 50% overlap (separator.rs L539-555). Expect `outcome.feasible.len() >= 1` with `CountingTerminator { max: 20 }` bounding wall-clock.

(c) **unresolvable_returns_best_infeasible** — two 80×80 in 100×100 (separator.rs L557-590). `max_conseq_failed_attempts: Some(5)`. Assert `outcome.feasible.is_empty()` and `outcome.best_infeasible.is_some()`. Leave NoopTerminator so the break is attempts-cap.

(d) **determinism_under_fixed_seed** — run (b) twice from `Xoshiro256PlusPlus::seed_from_u64(42)`; compare feasible[0] by `(item_id, d_transf)` tuples (PItemKey is not stable across runs).

The enriched return `ExplorationOutcome { feasible: Vec<LayoutSnapshot>, best_infeasible: Option<(LayoutSnapshot, f32)> }` is what makes test (c) assertable; plain `Vec<LayoutSnapshot>` loses the infeasibility artifact.

---

## 9. File header deviation block

Following Task 5's format (separator.rs L12-35):

```
// Ported from sparrow's `src/optimizer/explore.rs` (MIT, Copyright 2025
// Jeroen Gardeyn, KU Leuven, ejor-snapshot tag c95454e3).
//
// The exploration phase is the outer GLS loop. It repeatedly calls
// Separator::separate, collects feasible layouts, and on infeasibility
// disrupts the layout (swap-two-large) to escape local minima.
//
// Deviations from upstream:
//   1. SPP -> BPP: change_strip_width + whole shrink-and-retry driver
//      removed. BPP bins are fixed-size. Loop driver is "separate +
//      disrupt until terminator or max_conseq_failed_attempts".
//   2. Return type: ExplorationOutcome { feasible: Vec<LayoutSnapshot>,
//      best_infeasible: Option<(LayoutSnapshot, f32)> } instead of
//      Vec<SPSolution>. BPSolution assembly is Task 8/12.
//   3. SPInstance/SPSolution/SPProblem -> BPInstance/LayoutSnapshot/
//      Layout. sep.prob.* -> sep.layout / sep.instance per Task 5.
//   4. sol_listener.report(ReportType::*, ...) replaced with
//      SolutionListener trait methods: report_improving (existing) +
//      two new default-noop methods report_feasible/report_infeasible.
//      Task 14 fills real NDJSON impls.
//   5. Budget: Terminator passed in pre-armed. Task 8 splits
//      time_budget_ms 80/20 between explore and compress.
//   6. Pool tuple: Vec<(LayoutSnapshot, CTSnapshot, f32)> instead of
//      Vec<(SPSolution, f32)>. CTSnapshot lets rollback preserve GLS
//      weights — upstream cannot because shrink invalidates them.
//   7. disrupt_solution's sep.move_item(pk, dt) calls are inlined
//      (remove + place + ct.register_item_move) rather than re-adding
//      a public mover on Separator.
//   8. practically_contained_items ported verbatim as a private fn at
//      bottom of this file — Layout-generic, no retyping.
```

---

## 10. Sequence check — required symbols

| symbol | status | action |
|---|---|---|
| `jagua_rs::collision_detection::hazards::HazardEntity` | use-existing | imported tracker.rs L27 |
| `jagua_rs::entities::{Instance, Layout, PItemKey, LayoutSnapshot}` | use-existing | separator.rs L41 |
| `jagua_rs::probs::bpp::entities::BPInstance` | use-existing | separator.rs L43 |
| `jagua_rs::geometry::geo_traits::CollidesWith` | port-now import | POI-center test in `practically_contained_items` |
| `jagua_rs::geometry::{DTransformation, Transformation}` | DTransformation use-existing (separator.rs L42); **`Transformation` port-now import** for compose/inverse |
| `convert_sample_to_closest_feasible` | use-existing | uniform_sampler.rs L135 |
| `practically_contained_items` | port-now | 20-line fn, verbatim into explore.rs |
| `rand_distr::Normal` | **port-now dep** | add `rand_distr = "0.5"` to Cargo.toml |
| `ordered_float::OrderedFloat` | use-existing | Cargo.toml L22 |
| `itertools::Itertools` (sorted_by_key) | use-existing | Cargo.toml L20 |
| `rand::prelude::IteratorRandom` | port-now import | transitive via `rand = "0.10"`, just an import |
| `float_cmp::approx_eq!` | use-existing | Cargo.toml L19 |
| `slotmap::SecondaryMap` | use-existing | tracker.rs L30 |
| `Separator::move_item` (public) | elide | inline in disrupt (deviation #7) |
| `BasicTerminator` | port-now | 45 LOC upstream, port into gls/ or search/ |
| sparrow `FMT` logging helper | elide | inline `{:.4}` format specs (Task 5 deviation #5) |

Summary: one crate dep (`rand_distr`), one verbatim 20-line fn (`practically_contained_items`), one small struct (`BasicTerminator`), a handful of existing-path imports. Everything else from Tasks 3-5 already landed.

---

## Inputs consulted

- `/tmp/sparrow-research/sparrow/src/optimizer/explore.rs` (239 LOC, full)
- `/tmp/sparrow-research/sparrow/src/optimizer/separator.rs` (257 LOC, full)
- `/tmp/sparrow-research/sparrow/src/config.rs` (102 LOC, full)
- `/tmp/sparrow-research/sparrow/src/util/{terminator.rs, listener.rs}` (full/grep)
- `jagua-rs 0.7.1 src/entities/layout.rs` and `src/probs/bpp/entities/{instance,problem,solution}.rs`
- `engine/crates/rema-layout/src/infrastructure/search/gls/{separator.rs (658 LOC, full), uniform_sampler.rs (187 LOC, full), tracker.rs (279 LOC, full), mod.rs}`
- `engine/crates/rema-layout/src/infrastructure/search/{mod,state,objective}.rs`
- `engine/crates/rema-layout/Cargo.toml`
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` (full)
