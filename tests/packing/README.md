# tests/packing/

Tests for the canonical packing pipeline (`src/application/packing/`) and the packing service boundary (`src/application/services/packing.service.interface.ts`).

Runs under Vitest once installed (S1 Plan Task 3). Type-level assertions use `expectTypeOf`; runtime assertions use standard `expect`.

## Files

- **types.test.ts** -- `expectTypeOf` assertions verifying the canonical type shapes: `Point2D` numeric, `Part` required fields, `PackRequest.bins`/`items` collections, `Placement.binId`/`polygon`.
- **interface.test.ts** -- Verifies `IPackingService.pack(request, onProgress?)` and `cancel(jobId)` signatures and that `PACKING_TOKENS.IPackingService` is a `Symbol`.
- **legacyService.test.ts** -- Verifies the `LegacyPackingService` skeleton: constructs without error, and `pack()`/`cancel()` both reject with "not implemented" until Phase 3 wiring lands.
- **di.test.ts** -- Verifies the TSyringe container resolves `PACKING_TOKENS.IPackingService` (bridged through `TOKENS.IPackingService`) to a `LegacyPackingService` instance, that repeated resolves return the same singleton, and that `TOKENS.IPackingService` and `PACKING_TOKENS.IPackingService` reference the same underlying Symbol.
- **buildPart.test.ts** -- Verifies `buildPart` for the `rect` shape kind (4-vertex CCW polygon with min-corner at (0,0), `shapeSpec` preserved as UI hint, `/width must be positive/i` on zero width), for the `circle` shape kind (24-vertex polygon by default, bounding box spanning the diameter anchored at (0,0), honors a custom `segments` parameter, throws `/diameter must be positive/i` on zero diameter), and for the `trapezoid` shape kind (4-vertex CCW polygon with min-corner at (0,0) and bounding box spanning `max(topWidth, bottomWidth) x height`, throws `/height must be positive/i` on zero height).
