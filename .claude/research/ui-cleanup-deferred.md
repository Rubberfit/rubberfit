# Cut-planner UI cleanup — deferred until Tauri migration

**Date:** 2026-04-19
**Status:** Deferred (not a session-scope task).

## Why this is deferred

User flagged the NFP-based shape-preview code paths as a pain point
("in legacy its done automatically when you click a shape which is not
good since it causes issues ... having a button to press and we wait
is better"). The proposal was to delete:

- `nesting/nfp-greedy-placer.ts`
- `nesting/mixed-nfp-placer.ts`
- `nesting/nfp-solver.ts`
- `nesting/nfp-angle-worker.ts`
- `nesting/nfp-pack-rotation.ts`
- `nesting/vendor/fit/`
- `nesting/worker-pool.ts`

...leaving `nesting/` as just `free-space.ts` + `shape-to-polygon.ts` +
`types.ts` + `convex-hull.ts` helpers.

Scoping this during the 2026-04-19 session showed:

- **~3,900 LOC of UI code** across 7 files actively imports the NFP
  helpers to build "nested preview" renderings on shape selection.
  Specifically: `nesting-shape-previews-basic.ts` (320 LOC),
  `nesting-shape-previews-advanced.ts` (638 LOC),
  `nesting-shape-previews-dispatch.ts` (1,223 LOC),
  `nesting-nfp-helpers.ts` (340 LOC), `use-nfp-optimizer.ts` (247
  LOC), `nesting-preview-builders.ts` (571 LOC), and
  `NestingVisualizer.tsx` (523 LOC).
- Deleting the NFP helpers without a replacement means shape-preview
  UX degrades from "optimized nested layout on selection" to "individual
  shapes rendered in isolation, user clicks Pack to see the real layout."
  That's a direction the user wants (click-to-pack), but it's a real
  UX change, not a silent refactor.
- The Tauri migration is the natural boundary for this work. When the
  packing engine moves to a Tauri command, the whole preview pipeline
  can be rebuilt to either (a) call `invoke("pack")` and show the Rust
  result, or (b) show raw shape icons until Pack is clicked. In both
  cases the TS NFP helpers become unused and deletable.
- Doing this refactor BEFORE Tauri means writing throwaway glue for
  a 1-2 week UI project that will be revisited anyway.

## What to do when picking this back up (post-Tauri)

1. Decide the preview UX: nested-on-select (fancy, requires running
   pack on the client), or simple shape icons until user clicks Pack
   (matches user's stated preference — lean toward this).
2. If option 2: replace every `greedyNfpPack` / `mixedNfpPack` /
   `NFPSolver.solve()` call in the 7 UI files with a non-optimizing
   layout renderer (stock rectangle + parts placed via simple
   `calculateSimpleRectLayout` / manual polygon transform — no NFP).
3. Delete the NFP files listed above.
4. Audit `nesting/vendor/fit/` — it's a vendored NFP+GA library from
   an upstream project; license is embedded in the files themselves.
   Once nothing imports from `vendor/fit/`, `nesting/vendor/` can be
   deleted wholesale.
5. Keep `nesting/free-space.ts` — still used by
   `tools/bench-production/bench.ts` for Fab Score reusable
   classification.
6. Keep `nesting/shape-to-polygon.ts`, `nesting/types.ts`,
   `nesting/convex-hull.ts` — small, generally useful shape utilities
   that the UI may continue to consume for non-NFP rendering.

## Expected outcome when completed

- `nesting/` shrinks from ~3,800 LOC to ~800 LOC.
- Cut-planner UI preview generation simplifies; fewer code paths;
  no more auto-triggered NFP computation on shape selection.
- Packing continues to happen via the Rust engine (now Tauri-invoked).
