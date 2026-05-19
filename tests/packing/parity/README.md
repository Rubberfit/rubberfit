# tests/packing/parity/

Golden-file parity tests for the canonical packing pipeline.

## What is a fixture?

A fixture is a JSON file in `fixtures/` that serialises a single `PackRequest` (see `src/application/packing/types.ts`). The `parity.test.ts` runner iterates every fixture, runs `RustPackingService.pack(request)` (spawning `engine/target/release/pack-cli`), and snapshots a stable subset of the result.

The pre-S2 TS-side `LegacyPackingService` was retired with the canonical Rust pipeline (commit 2026-04-19, Phase 3 rollout); `pack-cli` is the only engine. Tests skip when the binary is not built.

The stable snapshot subset absorbs floating-point drift across runs:
- `placedCount`
- `overflowCount`
- `perBin[].{binId, efficiency}` — efficiency rounded to 3 decimals (0.1% resolution). The LBF multistart is seed-deterministic, but the polish pass introduces ~1-in-10 000 float drift from f32→f64 rounding inside jagua-rs.

Snapshots live in `__snapshots__/parity.test.ts.snap` and are committed to the repo.

## Why these tests exist

Parity snapshots lock in the Rust packer's observable behaviour so any divergence surfaces as a failing snapshot rather than a UI regression. Exact coordinates, rotations, and `placements[]` order are intentionally excluded — those can shift while still producing an equivalent pack.

## Current fixtures

Each fixture's `_description` is a top-level field in the JSON and is a one-line summary of the scenario. The runner ignores the `_description` key; it exists purely as in-file documentation.

| Fixture | Scenario |
| --- | --- |
| `single-rect.json` | One 24x12 rect on a 48x96 fresh bin (baseline). |
| `multi-rect-same-size.json` | Six 10x5 rects with rotation allowed on a 48x96 fresh bin. |
| `rect-grid.json` | Twenty 6x6 rects, rotation disabled, on a 48x96 fresh bin (fixed grid). |
| `circle-grid.json` | Twelve 6-inch diameter circles (24-vertex approx) on a 48x48 fresh bin. |
| `cone-array.json` | Four quarter-cone annular sectors (innerR=2, outerR=8, 90 deg, 12 segments) on a 48x96 fresh bin. |
| `trapezoid-mix.json` | Three trapezoids (two of each) with varying top/bottom/height on a 48x96 fresh bin. |
| `mixed-rect-circle.json` | Mixed items: three 10x5 rects plus three 8-inch diameter circles on a 48x96 fresh bin. |
| `multi-sheet-remnant.json` | Fifteen 10x10 rects across a 48x20 remnant (priority 10) plus a 48x96 fresh bin; overflow spills to the fresh bin. |
| `overflow.json` | Six 20x20 rects on a 48x48 fresh bin — only four can fit, two overflow. |

### Error-path coverage

The runner calls `svc.pack(fixture)` unconditionally and snapshots the result — it has no concept of an expected-error fixture. Empty-`items` and empty-`bins` error paths are covered by `tests/packing/rustPackingService.test.ts` (stderr surface assertions), not as parity fixtures. If a fixture-driven error mode is needed later, extend the runner to treat a top-level `_expectError` field as the expected `Error.message` regex.

## Adding a new fixture

1. Create `fixtures/<descriptive-name>.json` containing a valid `PackRequest`.
2. Pin `seed` to a fixed integer so the LBF multistart is deterministic.
3. Ensure the Rust binary is built: `npm run build:engine`.
4. Run `npm run test -- tests/packing/parity/parity.test.ts -u` to generate the snapshot entry.
5. Run `npm run test -- tests/packing/parity/parity.test.ts` (no `-u`) to confirm the snapshot is stable across repeated runs.
6. Commit both the fixture and the updated snapshot file together.

## Regenerating snapshots after an intentional engine change

If the packing engine is changed on purpose (e.g., a solver bug fix or a new heuristic), the snapshot file must be refreshed:

```bash
npm run test -- tests/packing/parity -u
```

Review the diff in `__snapshots__/parity.test.ts.snap` line by line before committing — every change there represents a behavioral shift that downstream consumers (UI, exports, cut plans) will observe.

## Scripts

```bash
npm run test:parity                                        # run all parity tests
npm run test -- tests/packing/parity/parity.test.ts        # run the runner directly
npm run test -- tests/packing/parity -u                    # regenerate snapshots
```
