# Task 10 second-opinion — Codex

## Context

Task 10 adds First-Fit-Decreasing (FFD) bin-assignment to replace `pack.rs`'s current "iterate bins in input order" pattern. Fresh code, not a sparrow port.

Parent plan Task 10: `infrastructure/search/assignment/ffd.rs`, area-decreasing sort, wrap warm_start::greedy_bottom_left per-bin, three items + two bins test where naive overflows and FFD doesn't.

Parallel Gemini researcher is at `.claude/research/task10/gemini-report.md`. Your independent read.

## Your assignment

Write `.claude/research/task10/codex-report.md` (or print if sandbox read-only).

Focus on risks Gemini may miss:

1. **Interaction with OptimizerConfig (Task 8 seam).** Post-Task-8, `search::optimize` takes `bin: Bin` + `items: Vec<Part>` via config. After FFD assigns items-per-bin, each per-bin optimize call now gets the SUBSET of items FFD routed to that bin, not the full `remaining` list. Does that change any invariant in `optimize()`?

2. **Quantity explosion.** REMA's `Part.quantity: u32` is the count of identical copies. FFD needs to treat each quantity-1 as a separate assignment unit. Is there a clean way to do this without blowing up the sort vector for quantity=100 cases? Fixture `tests/fixtures/*.json` may have quantity >> 1.

3. **Bin-priority respect.** `Bin.priority: Option<u32>` exists in the domain. Operators may want priority-1 bins used first even if FFD's area logic disagrees. Is priority a HARD constraint (always honored) or a SOFT sort key (tiebreaker)? Check `src/domain/` for any doc on this.

4. **Determinism across quantity.** Two items with identical shape + equal area — their `instance_index` must be assigned deterministically post-FFD. The Task-8 snapshot_to_seed sort key was `(item_id, tx, ty, rot)` — does FFD's output produce stable item_ids per-bin?

5. **Overflow-semantic change.** Current `pack.rs` accumulates overflow across bins. FFD should produce a SINGLE overflow number (items that fit no bin). Does that match the domain's semantics for `PackResult.overflow_count`? Any TS side expectations?

6. **Edge cases.** What if `bins.is_empty()`? `items.is_empty()`? Item whose bbox exceeds every bin? All items overflow? These should all Result::Ok with sensible overflow, not Err.

7. **Test fixtures.** Look at `engine/crates/rema-layout/tests/fixtures/` for realistic REMA data shapes. Propose 2-3 fixtures that would legitimately show FFD beating naive.

8. **TDD ordering.** Standard plan sequence: skeleton + unimplemented → tests fail → implement → tests pass → gates → commit. Anything specific to FFD that changes this?

## Output

≤1200 words at path above (or printed). Verdict: APPROVE for Claude to draft the plan / REJECT pending research.
