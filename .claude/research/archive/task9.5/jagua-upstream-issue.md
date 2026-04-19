# Jagua-rs upstream issue draft

Ready to file at `github.com/JeroenGar/jagua-rs/issues`.

---

**Title:** `qt_hazard.rs:111` debug_assert fires when a partial hazard surrounds a quadrant without edge collisions

**Version:** jagua-rs 0.7.1 (rev 7552bd7)

**Repro:** a placed-item shape whose polygon fully surrounds an entire quadrant of the parent QT node — none of its edges intersect that quadrant's bbox. Observed when multiple clearance-inflated rectangles tile a bin such that their bboxes span root quadrants but their edges lie outside child quadrants at deeper levels.

**Fixture:** 20×20 bin, 8× (20×5 rect), 0.125 clearance.

**Expected:** constriction proceeds; the neighbor-inference loop at `qt_hazard.rs:116-160` resolves the surrounded quadrant via centroid containment (line 142).

**Actual:** `debug_assert!(constricted_hazards.iter().filter(|h| h.is_some()).count() > 0)` at `qt_hazard.rs:111` panics before reaching the neighbor-inference loop.

In release builds, the assertion is stripped and the downstream logic correctly resolves the quadrant. Debug-build test harnesses that exercise tight-bin-with-clearance configurations trip the assert.

**Minimal code to reproduce (inside jagua-rs test suite):**

```rust
// 20×20 bin with 0.125 clearance, 8 placements of a 20×5 rect
// stacked at y = 0, 5.25, 10.5, 15.75 (and the same in a second bin).
// Clearance-inflated edges land on quadrant-midpoint values of the
// root BPInstance's CDE quadtree.
```

**Suggested fix (either is safe):**

1. Remove the assertion — the downstream neighbor-inference + centroid containment logic at `qt_hazard.rs:116-163` already handles the zero-edge-colliding case correctly:

```diff
-                    debug_assert!(constricted_hazards.iter().filter(|h| h.is_some()).count() > 0);
```

2. Relax the assertion to accept the "hazard surrounds quadrant" case:

```diff
-                    debug_assert!(constricted_hazards.iter().filter(|h| h.is_some()).count() > 0);
+                    debug_assert!(
+                        constricted_hazards.iter().filter(|h| h.is_some()).count() > 0
+                        || quadrants.iter().any(|q| haz_shape.bbox.relation_to(*q) == GeoRelation::Surrounding),
+                        "partial hazard should collide with at least one quadrant's edges OR surround at least one quadrant"
+                    );
```

**Downstream impact:** the REMA Portal's rema-layout crate (2D nesting engine for cut planning) vendors sparrow's search pipeline against jagua-rs 0.7.1's BPP primitives. Our test harness exercises multi-item tight-bin configurations routinely; the assert blocks `cargo test` until we apply a `[profile.test.package.jagua-rs] debug-assertions = false` override.

**Workaround we're running:**
```toml
# engine/Cargo.toml
[profile.test.package.jagua-rs]
debug-assertions = false
```

We'd like to drop this override once upstream ships a fix.

---

## How to file

```bash
gh issue create \
  --repo JeroenGar/jagua-rs \
  --title "qt_hazard.rs:111 debug_assert fires when a partial hazard surrounds a quadrant without edge collisions" \
  --body-file .claude/research/task9.5/jagua-upstream-issue.md
```

Or via browser at https://github.com/JeroenGar/jagua-rs/issues/new.

Full research + sparrow/jagua-rs source walk: `.claude/research/task9.5/gemini-report.md` + `.claude/research/task9.5/codex-report.md`.
