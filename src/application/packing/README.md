# packing/

Canonical types and pipeline functions that define the single boundary between UI and the packing engine. Every cut-planner Pack call resolves `IPackingService` from DI and speaks only these types — nothing in `app/` imports from `nesting/` directly.

S2 (Rust engine migration) swaps the concrete implementation of `IPackingService` without touching anything here.

## Files

- **types.ts** -- Canonical type definitions. Exports `Point2D`, `ShapeSpec`, `Part`, `Bin`, `PackRequest`, `Placement`, `BinResult`, `PackResult`, `PackProgress`, and the `PACK_MODE_BUDGETS_MS` constant. All polygons are CCW, normalized to (0,0) min-corner; all linear dimensions are inches.
