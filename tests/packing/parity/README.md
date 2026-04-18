# tests/packing/parity/

Golden-file parity tests for the canonical packing pipeline.

## What is a fixture?

A fixture is a JSON file in `fixtures/` that serializes a single `PackRequest` (see `src/application/packing/types.ts`). The `parity.test.ts` runner:

1. Reads every `.json` file in `fixtures/` via `fs.readdirSync`.
2. Deserializes each one as a `PackRequest`.
3. Runs `LegacyPackingService.pack(request)`.
4. Snapshots a stable subset of the result:
   - `placedCount`
   - `overflowCount`
   - `perBin[].{binId, efficiency}` — efficiency rounded to 4 decimals to absorb floating-point drift across platforms.

Snapshots live in `__snapshots__/parity.test.ts.snap` and are committed to the repo.

## Why these tests exist

The S1 refactor replaces ad-hoc `greedyNfpPack` / `NFPSolver` call sites with `LegacyPackingService` as the single adapter. Parity snapshots lock in the current engine's observable behavior so that when the S2 canonical solver lands, any divergence from the legacy adapter is surfaced as a failing snapshot rather than a UI regression.

Only the stable subset above is snapshotted — exact coordinates, rotations, and `placements[]` order are intentionally excluded because they may differ across engines while still producing an equivalent pack.

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
