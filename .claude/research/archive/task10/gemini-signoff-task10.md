# Task 10 plan sign-off — Gemini

**Verdict: APPROVE WITH CHANGES**

Plan faithfully encodes my original design and absorbs Codex's two guardrails.
Two drift items and one Q7 answer below. None are structural; all resolve
during §5 step 1.

Note: `.claude/research/task10/codex-report.md` is absent on disk — reviewed
against the handoff's summary.

## 1. §3.1 module layout — MATCH
`infrastructure/search/assignment/{mod.rs,ffd.rs}` with `mod.rs` as `pub mod
ffd;` matches my §1. Siblings (`bfd.rs`, `shelf.rs`, `cross_bin_swap.rs`)
remain addable without restructuring.

## 2. §3.4 sort key — MATCH
Four-level key (area desc, longest edge desc, shape_id asc, instance ordinal
asc) is my §2 chain verbatim. The bbox cache is fine.

## 3. §3.5 bin ordering — DRIFT, needs fix
Plan says "None treated as `i32::MIN`". `buildPackRequest.ts:32-34` treats
unset as **0**, not `MIN`:

```ts
const pa = a.priority ?? 0
const pb = b.priority ?? 0
if (pa !== pb) return pb - pa
```

Under `MIN`, any negative explicit priority outranks unset; under `?? 0`,
negative priorities sort below unset. My report suggested `MIN` assuming
unsigned; the field is signed. TS is authoritative — use
`priority.unwrap_or(0)`. Without the fix, a caller bypassing
`buildPackRequest` with `priority: Some(-1)` routes differently between TS
and Rust.

Remnant-before-Fresh as the next tiebreaker is consistent with TS.

## 4. §3.6 core algorithm — APPROVE
Two-phase (cumulative trial probe, then materialize-and-reseed per bin)
cleanly satisfies Codex's duplicate-shape_id guardrail. The probe calls
`warm_start::greedy_bottom_left` once per (unit × bin) — trivial for current
fixture sizes (O(20×2)). Note this in the deviation block so a future
optimizer doesn't mistake it for accidental O(n²).

## 5. §3.7 pack.rs rewiring — APPROVE with one risk to confirm
`pack.rs:19` initializes `remaining = request.items.clone()`; §3.7 drops it.
The early-exit at `pack.rs:25` becomes dead — fine. But `placed_by_shape` at
`pack.rs:47-58` is still needed to feed `index_counters` for globally-unique
`instance_index`. §3.7 doesn't mention preserving that loop; confirm it
stays. Zero regression risk if it does.

`total_overflow` currently derives from `remaining`. Post-rewire it derives
from `sum(items.quantity) - sum(placed_by_shape)`. §3.7 note line captures
this — good.

## 6. §4 tests — APPROVE
Six unit + one integration covers my §9 cases. Missing: the
`determinism_two_calls_identical_output` serde-equality property test.
Catches stray `HashMap` iteration in the sort path. Nice-to-have, not a
blocker.

## 7. `overflow: Vec<(String, u32)>` — APPROVE
Codex's observation (pack.rs recomputes a scalar anyway) is correct but
doesn't argue against per-shape. Preserving breakdown keeps Task 11+
requeue logic and future waste-reporting UI cheap; degrading to a scalar
later is trivial, reversing is not. Keep per-shape.

## Required changes before implementation

1. Bin ordering: `priority.unwrap_or(0)` not `i32::MIN` — match TS.
2. Confirm in §3.7 that the `placed_by_shape` + `index_counters` loop is
   preserved.
3. (Nice-to-have) Add the determinism property test to §4.

With (1) and (2) applied, proceed.
