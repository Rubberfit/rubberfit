# Pack-gate quality review — Gemini

## Verdict: conditional ship

## Does the quality premise hold?
No. The assumption that a deliberate "Pack" action produces a better layout than live churn is factually incorrect for our current fixture set. Evidence A and B prove that density is bit-identical across "fast", "balanced", and "thorough" modes. The First Fit Decreasing (FFD) initial assignment is already Pareto-optimal; Guided Local Search (GLS) operators return `Ok(None)` on the first tick, meaning extra compute time is literally wasted cycles. Quality gains seen in Task 19a came from the deterministic 2D grid warm-start (Evidence G), not from increased search duration.

## Recommended time budget
"Fast" (2,000ms). There is zero evidence-based justification for using "balanced" (10s) or "thorough" (30s). Since current compute times are consistently <40ms (Evidence A), the 2,000ms budget already provides a 50x safety margin for more complex geometry without penalizing the user with a 10-30 second lockout for no density lift.

## Gate design feedback
- **450ms minimum loader:** OK, but only as a debouncing "floor" to prevent UI flicker on ultra-fast results. Anything longer is purely performative.
- **Invalidate-on-input:** Incorrect. We should keep the last valid layout (ghosted/dimmed) while in the `idle` or `packing` states. Wiping the board on every keystroke creates unnecessary layout shift and prevents the user from comparing their changes to the previous result.
- **Cancel affordance:** Required. While current fixtures are fast, the engine supports `AbortSignal` (Evidence E) and we must allow users to escape if they trigger a complex edge case that actually hits the 2s budget.
- **Fake timer progress:** Block. Using `setTimeout` instead of awaiting `svc.pack` (Evidence F) is a race condition risk. We must wire the real `onProgress` NDJSON stream (Evidence E). Even if it only emits once for these fixtures, real wiring is the only way to support future "hard" problems where iterations actually happen.

## Other quality levers worth pulling
Only `clearance` and `seed` actually matter for this workflow. `improvementBudgetMs` is confirmed unused (Evidence C). Since FFD is currently hitting the plateau immediately, `operatorProfile` is irrelevant. `clearance` is the primary lever for physical safety; `seed` should be exposed only for "re-roll" scenarios if we encounter fixtures where FFD is not optimal.

## Ship with these changes
Standardize on "fast" mode with a real `AbortSignal` implementation. Replace the fake `setTimeout` with a functional `await svc.pack()` call. Modify `invalidate()` to retain the previous layout in a "stale" visual state rather than clearing the board. Wire the `onProgress` stream to the `Pack-progress.tsx` component to replace the fake timer with real engine frames.
