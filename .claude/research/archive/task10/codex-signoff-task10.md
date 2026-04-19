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

- §3.5 says Rust bin ordering "matches `buildPackRequest.ts`", but it currently does not. TS uses `priority ?? 0`; the plan uses `None -> i32::MIN`. Pick one semantic and make Rust + TS + docs identical.
