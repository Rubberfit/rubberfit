# packing/

Canonical types and pipeline functions that define the single boundary between UI and the packing engine. Every cut-planner Pack call resolves `IPackingService` from DI and speaks only these types — nothing in `app/` imports from `nesting/` directly.

S2 (Rust engine migration) swaps the concrete implementation of `IPackingService` without touching anything here.

## Files

- **types.ts** -- Canonical type definitions. Exports `Point2D`, `ShapeSpec`, `Part`, `Bin`, `PackRequest`, `Placement`, `BinResult`, `PackResult`, `PackProgress`, and the `PACK_MODE_BUDGETS_MS` constant. All polygons are CCW, normalized to (0,0) min-corner; all linear dimensions are inches.
- **buildPart.ts** -- Pure factory that turns a `ShapeSpec` (or a raw polygon) into a canonical `Part`. Guarantees 4-vertex CCW output for `rect` with min-corner at (0,0); supports `circle` with a configurable `segments` count (default 24, minimum 8) producing a polygonalized disc whose bounding box spans the full diameter anchored at (0,0); supports `trapezoid` (`topWidth`, `bottomWidth`, `height` params) producing a 4-vertex CCW polygon centered horizontally within its bounding box with min-corner at (0,0); passthrough polygons are translated to origin and reversed if needed to enforce CCW in math coords. `shapeSpec` is preserved on the returned `Part` as a UI hint. Additional shape kinds (sector, ngon, polygon) extend the dispatch in later tasks.
