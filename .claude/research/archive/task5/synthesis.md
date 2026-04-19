# Task 5 — Synthesis: Port Sparrow Separator (SPP→BPP)

Three parallel research streams landed (Gemini, Codex, jagua-rs API audit). Summary of points of agreement, points of divergence, and the locked design.

## Sources

- `gemini-report.md` — full adaptation design (file layout, type map, outcome enum, test set, deviation header).
- `codex-report.md` — second opinion: algorithm-fidelity checks, borrow-checker traps, sparrow paper constants.
- `jagua-bpp-api.md` — exact jagua-rs 0.7.1 BPProblem / Layout signatures.
- Hand verification: read `jagua-rs/src/probs/bpp/entities/problem.rs` + `jagua-rs/src/entities/layout.rs`.

## Convergent recommendations (both Gemini + Codex agree)

1. **Delete `change_strip_width` + `strip_width()`.** BPP bins are fixed-size. No callers in already-ported code (verified).
2. **Single-threaded for S2.5a.** Rayon dep deferred to Task 18. Pack-cli is native; no WASM pressure.
3. **Port `SepStats`, `SeparatorConfig`, `Terminator`, `SolutionListener` in this task.** Elide `FMT`; use `log::debug!`.
4. **`SeparateOutcome::{Feasible, Infeasible}`** enum — no N-sized pool in Task 5 (deferred to Task 6).
5. **Tests:** feasible-fast-path, overlap-resolve, infeasible-exit, `tracker_matches_layout` post-condition.

## Divergence — resolved in favour of Gemini's scoping

**Gemini:** wrap a single `&mut Layout` directly. Bypass BPProblem entirely.

**Codex:** wrap `BPProblem + active_lkey` — cautious about layout-key churn and closed-layout semantics.

**Resolution: Gemini wins.** `jagua_rs::entities::Layout` has its own direct API:
- `Layout::place_item(item: &Item, d_transf: DTransformation) -> PItemKey`
- `Layout::remove_item(pk: PItemKey) -> PlacedItem`
- `Layout::save() -> LayoutSnapshot`
- `Layout::restore(&LayoutSnapshot)`
- Plus public field `placed_items: SlotMap<PItemKey, PlacedItem>`

Sparrow went through `SPProblem` because it needed `change_strip_width`. BPP Separator has no such need — it only moves existing items inside one bin. By operating on `&mut Layout` we dodge every `SlotMap<LayKey, Layout>` / `BPLayoutType::Open|Closed` / `(LayKey, PItemKey)` tuple complication Codex raised.

Codex's caveats still apply *if* Task 12 (multi-bin coordination) reaches into BPProblem — but that's Task 12's problem. Task 5 stays pure.

## Preserved Codex points (algorithm fidelity)

1. **Workers stay plural.** `Vec<SeparatorWorker>`, each cloned from the master every iteration, different RNG orderings, pick best-weighted-loss. Running sequentially, not serially-collapsed — that would change Algorithm 10 semantics.
2. **Weighted vs unweighted loss.** Worker selection = weighted. Incumbent update + success check = unweighted. Keep both.
3. **Weight retention.** `rollback(Some(ct_snap))` must call `restore_but_keep_weights` (already ported). `rollback(None)` rebuilds via `CollisionTracker::new`.
4. **Separator defaults.** `strike_limit=3`, `iter_no_imprv_limit=200` (from sparrow's `config.rs` exploration phase). Compression is `5, 100` — used later in Task 7. Not in our `consts.rs` yet — add.
5. **`search_placement(..., Some(pk), ...)`** — already correct in our `sampling.rs`; worker passes `Some(pk)` so the current placement is seeded as a starting candidate.
6. **RNG determinism.** Workers seeded via `Xoshiro256PlusPlus::seed_from_u64(self.rng.random())` in constructor order — matches upstream.

## Locked design

### Files

- **Add** `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` — `Separator`, `SeparatorWorker`, `SeparatorConfig`, `SeparateOutcome`, `SepStats`, trait `Terminator`, trait `SolutionListener`. ~350-400 LOC incl. tests.
- **Modify** `gls/mod.rs` — add `pub mod separator;`.

### Shapes

```rust
pub struct Separator {
    pub instance: BPInstance,
    pub layout:   Layout,
    pub ct:       CollisionTracker,
    pub rng:      Xoshiro256PlusPlus,
    pub workers:  Vec<SeparatorWorker>,
    pub config:   SeparatorConfig,
}

pub struct SeparatorWorker {
    pub instance:      BPInstance,
    pub layout:        Layout,
    pub ct:            CollisionTracker,
    pub rng:           Xoshiro256PlusPlus,
    pub sample_config: SampleConfig,
}

#[derive(Debug, Clone, Copy)]
pub struct SeparatorConfig {
    pub iter_no_imprv_limit: usize,   // default 200
    pub strike_limit:        usize,   // default 3
    pub n_workers:           usize,   // default 1 for S2.5a
    pub sample_config:       SampleConfig,
    pub log_level:           log::Level,
}

pub enum SeparateOutcome {
    Feasible(LayoutSnapshot),
    Infeasible { snapshot: LayoutSnapshot, tracker: CTSnapshot },
}

pub struct SepStats { pub total_moves: usize, pub total_evals: usize }
// + Sum + AddAssign impls matching upstream

pub trait Terminator        { fn kill(&self) -> bool; }
pub trait SolutionListener  { fn report_improving(&mut self, snapshot: &LayoutSnapshot); }

pub struct NoopTerminator;      impl Terminator for NoopTerminator       { fn kill(&self) -> bool { false } }
pub struct NoopListener;        impl SolutionListener for NoopListener   { fn report_improving(&mut self, _: &LayoutSnapshot) {} }
```

### Core methods

- `Separator::new(instance, layout, rng, config) -> Self`
- `Separator::separate(&mut self, term, listener) -> SeparateOutcome`
- `Separator::move_items_multi(&mut self) -> SepStats` — sequentially iterates workers, each runs one pass from a cloned master, pick min-weighted-loss result, adopt into master
- `Separator::move_item(&mut self, pk, d_transf) -> PItemKey`
- `Separator::rollback(&mut self, snapshot, Option<&CTSnapshot>)`
- `SeparatorWorker::load(&mut self, snapshot, ct)` — resync to master
- `SeparatorWorker::move_items(&mut self) -> SepStats` — shuffle colliding items, call `sampling::search_placement` each

### Tests (co-located in separator.rs)

1. `test_separate_feasible_fast_path` — place two non-overlapping squares in a 100×100 bin, call `separate()`, expect `Feasible(_)`, no iteration moves (assert SepStats total_moves==0 via listener or capture).
2. `test_separate_resolves_overlap` — place two 10×10 squares at (5,5) and (6,6) — 81% overlap. Separator must resolve. Assert `Feasible(_)` + post-condition `ct.get_total_loss() == 0.0`.
3. `test_separate_infeasible_exit` — two items too large to fit non-overlapping. Separator exits at strike_limit. Assert `Infeasible { .. }` + strike bound respected.
4. `test_tracker_matches_layout_post_separate` — regardless of outcome, assert `tracker_matches_layout(&sep.ct, &sep.layout)`.

All tests use fixed RNG seed (e.g. 42). Use `NoopTerminator` + `NoopListener`.

### Commit

```
feat(search/gls): port sparrow Separator (S2.5 Task 5)

Ported from sparrow's src/optimizer/{separator,worker}.rs (MIT,
Copyright 2025 Jeroen Gardeyn, KU Leuven, ejor-snapshot c95454e3).

Retyped for jagua-rs BPP by scoping to a single Layout. sparrow's
SPProblem/SPSolution/SPPlacement disappear:
  SPProblem   -> Layout                (Layout has its own place/remove/save/restore)
  SPSolution  -> LayoutSnapshot
  SPPlacement -> (Item, DTransformation)
  change_strip_width -> deleted (BPP bins are fixed)

Separator wraps one bin; multi-bin coordination is Task 12.
Workers kept as Vec<SeparatorWorker> and run sequentially to preserve
Algorithm 10 semantics. rayon deferred to Task 18.

Terminator + SolutionListener stubs introduced; Task 14 will swap the
stubs for real cancel/progress plumbing.

~N tests: feasible-fast-path, overlap-resolve, infeasible-exit,
tracker-matches-layout post-condition.

cargo test --workspace green, clippy clean.
```

## Ready-state checklist

- [ ] tracker.rs — `register_item_move`, `restore_but_keep_weights`, `new(&Layout)`, `save()`, `get_total_loss`, `get_total_weighted_loss`, `get_loss(pk)`, `get_weighted_loss(pk)`, `update_weights` — all present (grepped).
- [ ] sampling.rs — `search_placement(layout, item, ref_pk, evaluator, sample_config, rng) -> (Option<(DTransformation, SampleEval)>, n_evals)` — present with Some(pk) support.
- [ ] sep_evaluator.rs — `SeparationEvaluator::new(&Layout, &Item, PItemKey, &CollisionTracker)` — present.
- [ ] rng.rs — `from_seed(Option<u64>) -> Xoshiro256PlusPlus` — present (Task 2 scaffolding). Workers reseed via `rng.random()`.
- [ ] consts.rs — GLS weight constants present. `SEPARATOR_STRIKE_LIMIT=3`, `SEPARATOR_ITER_NO_IMPRV_LIMIT=200` to add (optional — can inline in SeparatorConfig::default()).
- [ ] BPInstance construction path via `jagua_adapter::to_jagua_instance` (for tests) — present (used in integration tests).

All deps available. No blocking items.
