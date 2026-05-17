# `src/application/gasket/`

Parametric gasket primitives used by the Gasket cutting workspace
(`/dashboard/cutting-engine/gasket-cutting`).

| File                  | Role                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_circle.ts`          | Shared closed-form circle tessellator. Chooses `n = π / acos(1 − sag/r)` vertices, floored at 16, forced even so the cap centerline vertex lands at exact `(±r, 0)`. Accepts a winding param (`"ccw"` / `"cw"`) so callers pick the right orientation for outer vs hole rings.                                                                       |
| `ring-gasket.ts`      | `buildRingGasket({ outerDiameter, innerDiameter, chordDeviation? }) → PolygonWithHoles` — annulus: outer + bore circle as a hole.                                                                                                                                                                                                                    |
| `full-face-gasket.ts` | `buildFullFaceGasket({ outerDiameter, boreInnerDiameter, boltCircleDiameter, boltCount, boltHoleDiameter, boltStartAngleRad?, chordDeviation? }) → PolygonWithHoles` — outer + bore + N bolt holes evenly spaced on the BCD. Validates ASME bolt count range [2, 32] + geometry inversions (BCD outside OD, bore tangent or overlapping bolt holes). |
| `obround-gasket.ts`   | `buildObroundGasket({ length, width, chordDeviation? }) → PolygonWithHoles` — pill shape: two semicircle caps + two straight edges, no holes. Forced-even cap vertex count keeps bbox extremes exact even in the degenerate `length === width` (true circle) case.                                                                                   |
| `gasket-template.ts`  | `gasketSpecToPartTemplate(spec): Omit<PartTemplate, "id" \| "quantity">` — discriminated union over the three primitives + adapter to the `PartTemplate` shape used by the cutting-engine queue. `width` / `length` reflect the operator's nominal input rather than the slightly-inscribed tessellated bbox.                                        |

## Why this layer exists

Gasket primitives are pure math — they produce a `PolygonWithHoles`
(`@/src/application/packing/types`) without touching React, Konva, or
persistence. Keeping them in `src/application/` (not `app/`) lets unit
tests run them in isolation and lets non-UI consumers (future Rust ABI
bridge, future DXF-export integration in PR D) call the same builders.

## Orientation contract

Outer rings wind CCW (positive signed area in math coords / Y-up);
hole rings wind CW (negative signed area). This matches what
`sanitize-polygon-with-holes.ts` enforces and what the jagua-rs
adapter expects. Tests assert signed-area sign for every loop.

## Default chord deviation

`0.005″` (~32–64 vertices per circle at typical 4–16″ gasket diameters).
Chosen per spec §5.1 + §10 risks row 3: tight enough that CNC operators
don't see facet artifacts at gasket scale, coarse enough that jagua-rs
pack time stays in the same envelope as DXF-imported parts.
Configurable per-call via `chordDeviation` if a downstream consumer
needs different fidelity.

## Validation

Each builder throws on:

- Non-finite or non-positive dimension inputs.
- Geometric inversions:
  - Ring: ID ≥ OD.
  - Full-face: BCD outside OD; bore tangent or overlapping bolt holes
    (`bore radius ≥ BCD radius − bolt-hole radius`).
  - Obround: width > length.
- Bolt count outside ASME [2, 32] (also rejects non-integers).

Validation is fail-loud — surface UI calls into a try/catch and shows
inline form errors. The adapter (`gasket-template.ts`) does not
re-validate; it trusts the primitives.

## Related

- Spec: `docs/superpowers/specs/2026-05-15-gasket-cutting-design.md` §5 + §7.1
- UI design: `.claude/handoff/gasket-cutting-kimi-ui-result.md`
- Cutting-engine README: `app/dashboard/cutting-engine/README.md`
- Rust integration: `engine/crates/rf-layout/tests/gasket_pack.rs`
