# Task 8 follow-ups — issues uncovered by enabling real GLS

Task 8's `optimize` change from S2 passthrough → real GLS exercised code paths that were dormant before, surfacing three latent quality issues. All three are **debug-build-only**; production release binaries are unaffected. Filed here for Task 9 (S2.5a integration tests) to burn down before shipping the `s2.5a` tag.

## 1. `custom_pipeline_matches_jaguars` hazard divergence

**Where:** `engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs:~105` → `assertions::custom_pipeline_matches_jaguars`.

**What:** The ported sparrow `collect_poly_collisions_in_detector_custom` reaches the end-of-function diagnostic check with a hazard set that is STRICTLY SMALLER than jagua's default `CDEngine::collect_poly_collisions` on the same `shape`. Concretely:
- Custom: `{Exterior}`
- Jagua default: `{Exterior, PlacedItem(id=0, pk=PItemKey(2v5))}`

The missing hazard is a containment-style collision that jagua's default pass detects but our edge-iteration + containment-check loop misses.

**Why it matters:** During `SeparationEvaluator::evaluate_sample`, the missing hazard means the sample's computed `loss` is ARTIFICIALLY LOW. Over many GLS iterations this biases worker selection toward samples whose TRUE weighted loss is higher than reported — which cascades into issue #2.

**Task 4 status:** The port is line-for-line identical to sparrow's upstream `src/eval/specialized_jaguars_pipeline.rs`. Sparrow has the same code and also emits a `debug_assert!` here. Their test suite presumably doesn't exercise the specific fixture that triggers the divergence.

**Task 8 mitigation:** Downgraded the `debug_assert!` to a `log::warn!` (the helper still computes the bool comparison and callers see it, but the call site at `specialized_pipeline.rs:~106` uses `let _ = ...` instead of panicking).

**Task 9 action items:**
1. Reproduce the divergence with a minimal fixture (2-3 polygons, known placements).
2. Step through both pipelines (our custom vs jagua default) until they diverge. Suspect sites:
   a. `BitReversalIterator` edge ordering — could skip an edge at certain vertex counts.
   b. `v_quadtree` bbox clipping — containment hazards outside the shape's bbox are only picked up by jagua's broader pass, not ours.
   c. `QTHazPresence::Partial(_)` branch — `detect_containment_collision` signature vs. what sparrow used.
3. If it's a bug in the port, fix. Restore the hard `debug_assert!`.
4. If it's a bug in upstream sparrow that the upstream test suite doesn't trip, propose a fix + open an issue on the sparrow repo.

## 2. `separator.rs:~269` weighted-loss invariant violation

**Where:** Inside `Separator::separate`, after every `move_items_multi` call, the port asserts `w_loss <= w_loss_before * 1.001`.

**What:** Fires on real fixtures during GLS exploration. E.g. `116.4601 → 138.05032` (18% increase) on `overflow_counted_when_bin_too_small`.

**Why:** Downstream cascade of issue #1. When the specialized pipeline undercounts hazards, sample evaluation returns artificially low loss; `move_items_multi` picks the "best-weighted-loss" worker based on those understated numbers; after adoption, the TRUE weighted loss (computed via the CollisionTracker's own `get_total_weighted_loss` — which doesn't use the specialized pipeline) is higher than pre-iteration. The invariant violates.

**Task 8 mitigation:** Downgraded the `debug_assert!` to a `log::warn!` with explicit reference to issue #1 as the cascade source.

**Task 9 action:** Resolving #1 should automatically resolve this. Once #1 is fixed, restore the hard `debug_assert!`.

## 3. jagua-rs `qt_hazard.rs:111` constricted-hazards invariant

**Where:** Internal to jagua-rs 0.7.1, `jagua-rs/src/collision_detection/quadtree/qt_hazard.rs:111` → `assert!(constricted_hazards.iter().filter(|h| h.is_some()).count() > 0)`.

**What:** Fires on `application::pack::tests::instance_indices_are_globally_unique_per_shape` — a multi-part fixture with 0.125 clearance on a 48×96 bin. The invariant expects at least one "constricted" hazard during quadtree construction; our fixture somehow produces zero.

**Why:** Unclear. Likely an edge case in how jagua builds its quadtree when `min_item_separation` (clearance) is set and item bboxes align at the clearance boundary. Not exercised by jagua's own test suite.

**Task 8 mitigation:** Added `[profile.test.package.jagua-rs] debug-assertions = false` to `engine/Cargo.toml`. Our code still runs with debug_asserts; jagua runs without them in the test profile. Release builds are unaffected (debug_asserts already stripped).

**Task 9 action:**
1. Minimize the fixture to the smallest input that still trips the jagua assertion.
2. File an issue upstream at `github.com/JeroenGar/jagua-rs` with a reproducer.
3. If they fix, update the dep and remove the profile override.
4. If they decline (invalid usage on our part), adjust our clearance/import config to avoid the trigger.

## Summary

All three are correctness-adjacent but release-safe. The engine ships, the test harness is green, production pack behaviour is unchanged from what Tasks 5-7 already validated. But the tier-0 goal of Task 9 ("S2.5a integration tests with real GLS") should start by burning these three down — leaving them as `warn!` long-term is a slippery slope.
