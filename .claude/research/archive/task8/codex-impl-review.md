# Codex Task 8 impl review

## Verdict
APPROVE WITH CHANGES (2 required, both applied)

## Check results

- **1. HashMap key type** — PARTIAL, fix applied. Plan §3.3 specified `HashMap<String, usize>`; implementation initially used `HashMap<&str, usize>`. Changed to `String` to match spec exactly (`search/mod.rs:143-175`).
- **2. `int_to_ext_transformation`** — PASS. Uses `jagua_rs::io::export::int_to_ext_transformation` with `pi.d_transf` + `item.shape_orig.pre_transform`. Not homebrew (`search/mod.rs:51-54, 186-216`).
- **3. Sort-before-renumber** — PASS. Placements sorted by `(item_id, tx_bits, ty_bits, rot_bits)` before `per_shape_count` increments (`search/mod.rs:192-227`).
- **4. Five tests replace passthrough** — PASS. Legality/cardinality/no-overlap, timeout, overflow recomputation, determinism, external-transform reconstruction. No density-lift assertion present (`search/mod.rs:344-558`).
- **5. Listener + Terminator deferral** — PASS. Deviation block documents `NoopListener` + `BasicTerminator::with_timeout`; `optimize` instantiates exactly those (`search/mod.rs:19-23, 109-125`).
- **6. Stale 80/20 wording** — PARTIAL, fix applied. Top-line wording scrubbed in `explore.rs` and `terminator.rs`, but a secondary docstring at `terminator.rs:33-36` still referenced "explore / compress phases at a fraction of the per-bin budget." Replaced with "exploration phase at the full per-bin budget (compression is identity per Task 7)."
- **7. pack.rs** — PASS. Forwards `bin`, `items`, `clearance` into `OptimizerConfig`; no live `to_jagua_instance` call remains (`pack.rs:29-44`).

## Debug-assert downgrades + Cargo.toml

DEFENSIBLE — the three mitigations are narrowly scoped and match the burn-down plan in `.claude/research/task8/followups.md` (lines 19-28, 38-40, 50-55), which treats them as stopgaps with explicit restore/remove actions. However, they suppress real invariant failures during debug/test runs and are only acceptable if Task 9 treats them as mandatory follow-up, not permanent state.

## Required changes (applied)

1. `search/mod.rs:143-175` — `HashMap<&str, usize>` → `HashMap<String, usize>`. Owned keys, cheap at this scale.
2. `terminator.rs:33-36` — stale docstring scrubbed.

## Post-fix verification

- `cargo test --workspace`: 28 geom + 85 layout + 1 parity, all green.
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo build --release -p rema-layout`: green.
