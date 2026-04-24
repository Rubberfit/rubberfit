# tests/packing/parity/

Golden-file parity tests for the canonical packing pipeline.

## What is a fixture?

A fixture is a JSON file in `fixtures/` that serializes a single `PackRequest` (see `src/application/packing/types.ts`). The `parity.test.ts` runner evaluates each fixture against **both** engines in three describe blocks:

1. **Legacy baseline** — `LegacyPackingService.pack(request)` is snapshotted under the `legacy_<fixture>` key. Always runs.
2. **Rust baseline** — `RustPackingService.pack(request)` is snapshotted under the `rust_<fixture>` key. Skipped when `engine/target/release/pack-cli` is not built.
3. **Rust regression guard** — cross-engine conservation check (items accounted for, non-trivial output). Skipped when the binary is missing.

Both baselines snapshot the same stable subset to absorb floating-point drift:
- `placedCount`
- `overflowCount`
- `perBin[].{binId, efficiency}` — efficiency rounded to 4 decimals.

Snapshots live in `__snapshots__/parity.test.ts.snap` and are committed to the repo.

## Why these tests exist

Parity snapshots lock in each engine's observable behavior so that any divergence — within a single engine or across engines — surfaces as a failing snapshot rather than a UI regression.

Only the stable subset above is snapshotted — exact coordinates, rotations, and `placements[]` order are intentionally excluded because they may differ across engines while still producing an equivalent pack.

**S2 scope note:** the Rust engine uses warm-start greedy bottom-left only; sparrow LNS+SA lands in S2.5. Expect the Rust baseline to trail legacy on complex fixtures until S2.5 ships. The regression guard deliberately does not assert `rust.placedCount >= legacy.placedCount` for this reason — that tightening is tracked as a TODO inside the test file and belongs to the S2.5 benchmark harness.

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

### Intentionally omitted: `zero-items-error.json`

The S1 plan lists a `zero-items-error.json` fixture to exercise the `LegacyPackingService` error path (`throw new Error("pack: items required")` on an empty `items` array). The runner in `parity.test.ts` calls `svc.pack(fixture)` unconditionally and snapshots the result — it has no concept of an expected-error fixture, so this scenario would crash the runner instead of being captured as a stable snapshot.

Adding an expect-error branch to the runner would require more than a simple fixture drop-in, so the error-path coverage stays in `legacyService.test.ts` (`/items required/i` assertion) for Phase 6. If a fixture-driven error mode is needed later, extend the runner to treat a top-level `_expectError` field as the expected `Error.message` regex before re-adding this fixture.

## Adding a new fixture

1. Create `fixtures/<descriptive-name>.json` containing a valid `PackRequest`.
2. Pin `seed` to a fixed integer so the GA solver (used for mixed-item requests) is deterministic.
3. Run `npm run test -- tests/packing/parity/parity.test.ts -u` to generate the snapshot entry.
4. Run `npm run test -- tests/packing/parity/parity.test.ts` (no `-u`) to confirm the snapshot is stable across repeated runs.
5. Commit both the fixture and the updated snapshot file together.

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
