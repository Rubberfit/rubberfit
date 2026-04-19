# Task 9.5 design — Gemini root-cause

## Context

Tasks 5-9 shipped on `refactor/rf-engine`. Task 9 fixed the biggest burn-down item (the Task-8 replay bug, via `ext_to_int_transformation`). THREE debug-only mitigations remain; `s2.5a-industry-competitive` tag is gated on fixing or explicitly filing upstream on these.

Full context: `.claude/research/archive/task9/followups.md` and the Task 9 commit `df41b10` body.

## The three items

### Item #1 — Custom pipeline containment-check OVER-reports

**Where:** `engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs:86-102` (containment branch via `v_quadtree.hazards`).

**Observation:** After Task 9's replay fix, the custom pipeline finds an EXTRA PlacedItem containment collision that jagua's default `CDEngine::collect_poly_collisions` does NOT find. Reproducible on `application::pack::tests::overflow_counted_when_bin_too_small`:

```
jagua_default: {Exterior}
custom:        {Exterior, PlacedItem(id=0, pk=2v17, at (5.10, 7.37))}
delta: +1 PlacedItem in custom, 0 missing
```

**Key note:** Task 8 saw the OPPOSITE direction (custom UNDER-reported). The replay fix cleaned up geometry; exposed a different, real divergence in the containment branch.

### Item #2 — `tracker_matches_layout` cascade

**Where:** `engine/crates/rema-layout/src/infrastructure/search/gls/assertions.rs:35-131`, specifically the `panic!("tracker error")` sites (now `warn!`) at line ~69 and ~83.

**Theory:** pure cascade of #1. When the custom pipeline reports extra hazards during sample evaluation, `register_item_move` updates tracker with inflated counts. Later `tracker_matches_layout` (which uses jagua's default pass) sees tracker-stored pair losses that the CDE can't reproduce.

**Auto-resolves when #1 resolves.**

### Item #3 — jagua-rs `qt_hazard.rs:111` internal debug_assert

**Where:** third-party `jagua-rs 0.7.1 src/collision_detection/quadtree/qt_hazard.rs:111`:
```rust
assert!(constricted_hazards.iter().filter(|h| h.is_some()).count() > 0);
```

Fires on `application::pack::tests::instance_indices_are_globally_unique_per_shape` (multi-part fixture with 0.125 clearance on a 48×96 bin).

**Gemini's prior hypothesis:** grid-aligned clearance-inflated rectangles fall exactly on quadtree subdivision boundaries; `Rect::collides_with(&Edge)` at jagua's `rect.rs:312-313` uses strict `>`, so boundary-exact edges miss both neighbors.

**Independent of #1 and #2 and the replay fix.** Current mitigation: `[profile.test.package.jagua-rs] debug-assertions = false` in `engine/Cargo.toml`.

## Your assignment

Go deep on each item. Produce `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task9.5/gemini-report.md`.

### Part A — Item #1 root cause (primary)

1. **Side-by-side trace** both pipelines on the exact reproducer: `overflow_counted_when_bin_too_small` fixture with pk=PItemKey(1v15) as the shape being sampled, current layout with PItemKey(2v17) as a placed item.
2. **Which branch of `specialized_pipeline.rs:86-102` (containment check) produces the over-report?** Cite specific lines.
3. **Why does jagua's default miss it?** Compare against `CDEngine::collect_poly_collisions` at `jagua-rs/src/collision_detection/cd_engine.rs:261-289`.
4. **Is the fix in our port, or in upstream sparrow, or is upstream jagua actually buggy?** Read sparrow's `src/eval/specialized_jaguars_pipeline.rs:82-86` and compare our port line-by-line.
5. **Concrete fix proposal** — if it's in our port, write the diff. If upstream, draft the GitHub issue text.

### Part B — Item #3 (jagua upstream)

1. **Minimal reproducer** — smallest fixture that trips `qt_hazard.rs:111`.
2. **Verify the "grid-aligned boundary" theory** by reading jagua's `rect.rs` and `qt_hazard.rs`.
3. **Candidate upstream fix** — show the diff for `rect.rs` and/or `qt_hazard.rs`.
4. **Draft the GitHub issue** (title + repro + expected/actual) for `github.com/JeroenGar/jagua-rs`.

### Part C — ship criteria

If Item #1 has a clean fix: do it, restore the hard `debug_assert!`, verify Item #2 auto-resolves. Task 9.5 ships.

If Item #3 has a candidate fix + filed issue: document and keep the profile override until upstream merges. Task 9.5 ships.

If either is truly stuck: argue WHY the current mitigation is defensible long-term, not just as a stopgap.

After all items are either fixed or documented upstream: `s2.5a-industry-competitive` tag lands.

## Output

≤2000 words at the path above. Concrete with file:line refs. No source edits.
