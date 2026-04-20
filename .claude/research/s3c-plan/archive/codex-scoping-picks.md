# S3c scoping picks — Codex

## 1. Tax port
Recommendation: proxy
Why: S3c needs parity, not a second tax implementation rushed under migration pressure. Proxying keeps supplier override/exempt handling, ZIP lookup, and cache behavior on the one proven path without doubling Rust scope.

## 2. Notifications
Recommendation: port
Why: These are user-visible side effects on the exact PO flows S3c is moving. Accepting a flag-ON-only regression here will look like broken workflow behavior, and there is no DB trigger already covering it.

## 3. Reorder bulk actions
Recommendation: include
Why: The reorder page ships three PO-creation paths today. Cutting over only the row action leaves a mixed legacy/v2 page, which is harder to reason about, test, and support than paying the extra scope now.

## 4. `received` status
Recommendation: terminal-via-receive
Why: The generic status path bypasses roll creation and `actual_delivery_date` stamping. Preserving it knowingly carries a data-integrity bug into v2 for no upside beyond matching a bad legacy shortcut.

## Anything I'd change about my own sign-off given these picks
Nothing material. These picks resolve the open scope calls in the safer direction and keep the conditional sign-off intact.
