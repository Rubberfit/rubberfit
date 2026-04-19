# Task 5 plan sign-off — Gemini

You wrote the initial design (`.claude/research/task5/gemini-report.md`). Claude synthesized your design with Codex's second opinion and the jagua-rs API audit into an execution plan at:

**`docs/superpowers/plans/2026-04-18-s2.5-task5-separator.md`**

Your job: review the plan end-to-end and return a structured sign-off verdict. No code changes. No implementation.

## Checklist

For each of the 9 sections of the plan, answer:
1. Does the section match the intent of your original report?
2. Is anything factually wrong (API signatures, sparrow behaviour, jagua-rs behaviour)?
3. Is anything missing that would bite us in implementation?

## Specific points to verify

- §2.1 type shapes — are the field sets complete and correctly typed? Do the types exist at jagua-rs 0.7.1?
- §2.2 methods — does `Separator::separate` preserve sparrow `separate()` (lines 71-144 of upstream)? Does `move_items_multi` preserve Algorithm 10?
- §2.4 deviation block — anything missing, or incorrectly stated?
- §3 tests — do they exercise the intended behaviour? Fixture construction realistic against current `engine/crates/rema-layout/tests/` patterns?
- §4 TDD sequence — any step out of order or that won't compile incrementally?
- §5 quality gates — sufficient? Excessive?

## Output

Write `.claude/research/task5/gemini-signoff.md` with:

1. Verdict: APPROVE / APPROVE WITH CHANGES / REJECT.
2. If "APPROVE WITH CHANGES": a bulleted list of required changes with file:section:line references.
3. If "REJECT": what would need to change fundamentally.
4. Any nice-to-haves that are explicitly optional.

Under 800 words. Concrete and direct.
