# S3c scoping picks — pick one option per question

You (Codex) just reviewed the S3c plan and surfaced four scoping
questions that Claude can't answer unilaterally. The user doesn't
want to hand-pick; they want your recommendation with reasoning.

You already have the read of the code from your sign-off. Treat
this as "make the call, brief justification each." The user will
override if any answer feels wrong.

## Questions

### 1. Tax port depth

Options:
- **Proxy** the existing TS tax service from Rust — Rust POSTs to
  the current `/api/tax-rates` and `taxService.calculatePurchaseOrderTax()`
  surface.
- **Full port** to Rust — replicate the cache
  (`upsert_cached_tax_rate`), ZIP API lookup, supplier override
  + exempt flags. ~2× the Rust-side work vs the simplified
  port the plan currently describes.

Which do you recommend for S3c, and why?

### 2. Notifications on PO approve / receive / manual reorder

Options:
- **Port** the notification calls that currently live in
  TS use cases (`approve-purchase-order.use-case.ts`,
  `receive-purchase-order.use-case.ts`,
  `create-reorder-purchase-order.use-case.ts`) into the Rust use
  cases.
- **Accept** a one-release-cycle regression: flag-ON users don't
  get these notifications until a follow-up phase. Flag-OFF users
  continue to.

Which?

### 3. Reorder bulk actions

Options:
- **Include** "Create Individual POs" + supplier-grouped
  "Create Bulk PO" in S3c. Adds Task coverage for both flows;
  grows Task 7 + Task 11b meaningfully.
- **Defer** to a later phase: row-level "Create PO" button
  flips to v2, the two bulk buttons stay on legacy inside
  the same reorder page.

Which?

### 4. `received` status reachability

Options:
- **Terminal-via-receive-only.** The generic status dropdown
  removes "received" as an option. Only the dedicated receive
  flow can set it, which guarantees rolls are created + dates
  stamped.
- **Preserve dropdown path.** Keep the current UX where a user
  can set `received` from the dropdown — same as today, silent
  bypass of the receive flow. Technically not a regression, but
  it leaves a real data-integrity bug in place.

Which?

## Response format

Write to `.claude/research/s3c-plan/codex-scoping-picks.md`:

```markdown
# S3c scoping picks — Codex

## 1. Tax port
Recommendation: [proxy | full port]
Why: (1-3 lines, concrete)

## 2. Notifications
Recommendation: [port | accept regression]
Why:

## 3. Reorder bulk actions
Recommendation: [include | defer]
Why:

## 4. `received` status
Recommendation: [terminal-via-receive | preserve dropdown]
Why:

## Anything I'd change about my own sign-off given these picks
(optional, skip if nothing)
```

Keep it tight. No need to re-litigate your sign-off findings.
