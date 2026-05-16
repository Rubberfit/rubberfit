# tests/packing/

Tests for the canonical packing pipeline
(`src/application/packing/`), the packing service boundary
(`src/application/services/packing.service.interface.ts`), and the
`RustPackingService` adapter that spawns `pack-cli`.

The pre-S2 `LegacyPackingService` TS-side packer has been retired —
`pack-cli` (Rust `rf-layout`) is the only packer. Most tests below
exercise the request-building helpers and the `pack-cli` adapter
boundary.

## Files

- **types.test.ts** — `expectTypeOf` assertions verifying canonical type shapes (`Point2D`, `Part`, `PackRequest.bins`/`items`, `Placement.binId`/`polygon`).
- **interface.test.ts** — Verifies `IPackingService.pack(request)` signature and that `PACKING_TOKENS.IPackingService` is a `Symbol`.
- **di.test.ts** — Verifies the TSyringe container resolves `PACKING_TOKENS.IPackingService` and that `TOKENS.IPackingService` / `PACKING_TOKENS.IPackingService` reference the same underlying Symbol.
- **buildPackRequest.test.ts** — Verifies `buildPackRequest` assembles a `PackRequest`: defaults `mode` to `"balanced"`, defaults `timeBudgetMs` from `PACK_MODE_BUDGETS_MS[mode]`, honours explicit `timeBudgetMs` as an override, orders bins by priority descending then remnants before fresh within equal priority, and throws on empty `bins` / `items`.
- **buildPart.test.ts** — Verifies `buildPart` per shape kind (rectangle, circle, trapezoid, annular sector, n-gon, custom DXF polygon passthrough), including normalisation to (0,0) min-corner and invariant checks.
- **buildPlacementView.test.ts** — Verifies `buildPlacementView(result, request)` joins `PackResult.placements` to source parts via `request.items` by `shapeId`, carries `shapeSpec` onto view items, preserves placed polygons verbatim, groups items into `bins[binId]`, carries `perBin` metrics, and handles missing-shape / fallback render cases.
- **rustPackingService.test.ts** — Verifies the `RustPackingService` adapter that spawns `engine/target/release/pack-cli` over `child_process.spawn`: returns a `PackResult` on a baseline rect, surfaces stderr on empty `items` / `bins`, rejects with a spawn error when the binary path is missing. Skipped when the binary is not built.
- **rust-perf.test.ts** — Wall-clock time-budget regression guard: for every parity fixture (`tests/packing/parity/fixtures/*.json`), runs `RustPackingService.pack()` in `mode: "fast"` and asserts elapsed time stays under `FAST_WALL_CLOCK_BUDGET_MS` (3000 ms). Skipped when the binary is missing.

## Subdirectories

### `parity/` — Golden-file snapshot tests

Locks in the observable behaviour of the Rust packer against a curated
set of `PackRequest` fixtures. Each `fixtures/*.json` serialises a
`PackRequest`; `parity.test.ts` iterates every fixture, runs
`RustPackingService.pack()`, and compares a stable subset of the
result (`placedCount`, `overflowCount`, `perBin[].efficiency` rounded
to 3 decimals) to a Vitest snapshot in
`parity/__snapshots__/parity.test.ts.snap`.

See `tests/packing/parity/README.md` for the fixture index, authoring
guidelines, and the snapshot-regeneration workflow.
