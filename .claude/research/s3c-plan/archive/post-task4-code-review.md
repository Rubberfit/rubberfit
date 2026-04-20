# S3c Task 4 Code Review — Tax Proxy + `/api/v2/po/tax/preview`

Scope: uncommitted changes since `f261984`. Files per the task brief.
Verdict: **ship-ready with two major items to address before commit.**

---

## Critical
None.

---

## Major

### M1. `supabase.auth.getUser(token)` creates a fresh client per request — correct API, but anon key misuse risk
File: `app/api/internal/tax/po-preview/route.ts:47-54`

`client.auth.getUser(token)` is the correct server-side JWT-verify
primitive (it hits `/auth/v1/user` with the token as a bearer, no
cookie round-trip). That part is right and avoids the
`createServerClient` cookie-dependency the brief worried about.

Two issues:
1. **Per-request `createClient` allocation.** Cheap in isolation, but
   this is on the PO write hot path. Hoist the client to module scope
   (or a cached singleton keyed by `supabaseUrl`) — the JS supabase
   client is internally HTTP-only and safe to share. See
   `src/infrastructure/models/supabase.ts` for the existing shared
   instance — reuse it instead of minting a new one.
2. **`NEXT_PUBLIC_SUPABASE_ANON_KEY` used for JWT verification.**
   `auth.getUser(jwt)` does not actually consume the anon key for the
   verify call (it forwards the user JWT), but passing any key that is
   missing or empty puts the client in an inconsistent state.
   The fail-closed check at 50 (`if (!supabaseUrl || !anonKey) return false`)
   is correct — keep it, and consider logging so ops sees the
   misconfiguration on boot.

Fix: module-scope the client, or import the existing `supabase` export.

### M2. Trailing-slash URL composition is fragile
File: `engine/crates/rf-supabase/src/tax.rs:97-100`

`format!("{}/api/internal/tax/po-preview?supplier_id={}&subtotal={}", ...)`
works because the constructor strips trailing slashes (line 76). But:
- **`supplier_id` is not URL-encoded.** Task brief calls this out.
  UUIDs are safe today, but `SupplierId` is typed as `String` (not a
  newtype validating UUID shape). A future supplier seed with a rogue
  value (`foo bar` or `?x=1`) would silently corrupt the query string.
  The TS route already handles empty supplier_id as "default tax," so
  a malformed value is a real path to consider.
- **`subtotal`'s `Display` impl for `f64`**: Rust uses `.` as decimal
  separator (locale-independent — good), but very large / very small
  values get scientific notation (`1e20`, `2.5e-7`), which
  `Number(raw)` on the TS side parses correctly (JS `Number()` accepts
  scientific notation). Tested mentally: `Number("1e20") === 1e20`.
  Not a bug, but document it.

Fix: use `reqwest::Url::parse_with_params` or
`url::form_urlencoded::Serializer` so the query string is always
well-formed:
```rust
let mut url = reqwest::Url::parse(&format!("{}/api/internal/tax/po-preview", self.base_url))
    .map_err(AppError::infrastructure)?;
url.query_pairs_mut()
    .append_pair("supplier_id", &supplier_id.0)
    .append_pair("subtotal", &subtotal.to_string());
```
Low-effort, eliminates an entire class of future bug.

---

## Minor

### m1. 401 → `AppError::Forbidden` is a semantic mismatch
File: `engine/crates/rf-supabase/src/tax.rs:121`

401 from the TS proxy means "your JWT is bad." Mapping to
`AppError::Forbidden` (which renders as 403) tells the UI "you lack
permission," which is wrong — the user needs to re-auth, not request
access. No `AppError::Unauthenticated` exists today (see
`engine/crates/rf-api/src/cuts.rs:221-270`), so this is a pre-existing
gap in `AppError`.

Fix: either (a) add `AppError::Unauthenticated` and map 401→401, or
(b) map 401→`Infrastructure` so it reads as "upstream rejected us"
rather than "user forbidden." Option (a) is cleaner; worth an S3d
cleanup ticket if not done now.

### m2. Missing authoritative subtotal validation layer
File: 3 layers validate `subtotal` is finite + non-negative:
- `route.ts:40-45` (`parseSubtotal`)
- `engine/crates/rf-api/src/procurement/tax.rs:74-77` (handler)
- `engine/crates/rf-supabase/src/tax.rs:92-96` (adapter)

Three is overkill. Authoritative layer should be the **adapter**
(closest to the wire, guards whatever internal code path ends up
calling it including future non-HTTP callers). Keep the Axum handler
check as defense-in-depth (flagged already, fine). Remove the
`parseSubtotal` rejection? No — keep, TS route is a public internal
endpoint, needs to guard itself.

Recommendation: keep all three; document that the adapter is
authoritative.

### m3. `TaxPreviewDto` drops `taxName` / `subtotal` / `total`
File: `engine/crates/rf-api/src/procurement/tax.rs:38-53`

TS `TaxCalculation` carries `taxName` (e.g., "Texas State", "Supplier
Override Rate", "Tax Exempt") — `po-tax-helpers.ts:22-27` threads
`taxName` / `taxLevel` into the UI. The Rust DTO drops `taxName`.

Checked `po-tax-helpers.ts` — the consumers (`fetchTaxDetails`,
`fetchCreateFormTaxDetails`, `fetchEditFormTaxDetails`) return
`TaxDetails { taxRate, taxName, taxLevel }`. If any existing UI
component renders `taxName` from this endpoint, we're dropping useful
display context.

Fix: add `tax_name: String` to `TaxPreviewDto` and plumb it through.
Cheap, matches TS, future-proofs the S3d full-port wire format.

Subtotal + total can stay dropped (client already has them).

### m4. `TAX_PROXY_BASE` unconfigured returns 500 — 503 is more accurate
File: `engine/crates/rf-api/src/auth.rs:245-250`, rendered at
`cuts.rs:264-268` as `500 "internal error"`.

The server is healthy; the dependency isn't configured. 503 + a clear
header would let the UI distinguish "retry later" from "something
blew up." Accept as-is if the deployment runbook guarantees
`TAX_PROXY_BASE` is present in prod (main.rs warns loudly on boot),
but it's a soft signal mismatch.

Fix (optional): add `AppError::ServiceUnavailable(String)` and map to
503 in `ApiError::into_response`.

### m5. Integration test coverage is thin
Task 4 has 3 unit tests (NaN, negative, empty base URL). No HTTP-level
integration test for the adapter's happy-path or the TS route handler.

The TS route is currently untested — `parseSubtotal`, bearer regex,
`verifyBearer` fail-closed path, and the empty-supplier-id "default
tax" behavior are all uncovered.

Recommendation for S3d prep:
- `wiremock` (Rust) test for `HttpTaxProxy::calculate_po_tax` happy
  path + 401 + 400 + 500 responses. Cheap, 30 lines.
- Vitest test for the TS route: mock `auth.getUser`, mock
  `taxService.calculatePurchaseOrderTax`, assert the 401/400/200/502
  branches.

Not a blocker for commit, but note it in the S3d exit criteria.

### m6. S3d exit criteria — capture golden fixtures now
File: `.claude/research/s3c-plan/`

Before the S3c → S3d swap, record (supplier_id, subtotal) → TS
`TaxCalculation` JSON for: exempt supplier, supplier with override
rate, supplier with state+city, supplier with zip-only, default
(empty supplier_id), supplier with `tax_rate === 0.08` (the "fall
through to location" edge). Store as JSON fixtures the S3d Rust port
must reproduce byte-for-byte at the `TaxCalculation` boundary.

Do this before the S3d port starts, not during — the TS service is
the spec.

---

## Nit

### n1. `reqwest::Client::builder()` per adapter construction
File: `engine/crates/rf-supabase/src/tax.rs:61-67`

Every `factory.tax(auth)` call builds a fresh `reqwest::Client`. The
client has a connection pool so the cost is small, but on a high-QPS
PO write path (unlikely in this app) it would fragment pools. Match
the pattern used elsewhere in `rf-supabase` — accept a shared client
via constructor — only if a future audit flags it.

### n2. Route ordering verified
File: `engine/crates/rf-api/src/router.rs:131-155`

`/po/tax/preview` is registered before `/po/{id}`, and
`/po/{id}/status` / `/po/{po_id}/items` remain reachable because Axum
picks the most specific match first (static > dynamic). Visually
confirmed. The inline comment at 127-130 documents the invariant —
good.

### n3. `tax_proxy_base` nullability threaded everywhere
File: `engine/crates/rf-api/src/auth.rs:307-339`, `rolls.rs:234`,
`material_types.rs:175`, `suppliers.rs:180`, `material_suppliers.rs:173`

All test factories pass `tax_proxy_base: None`. Good. `AppState::new`
defaults to `None` (line 299), back-compat preserved. Clean.

---

## Verified Fine

- **Bearer extraction** (`BEARER_RE = /^Bearer\s+(.+)$/i`) — case
  insensitive, matches Axum middleware's `Bearer ` / `bearer `
  recognition. Empty/whitespace-only bearer is rejected because `(.+)`
  requires at least one char (trimmed via `parseSubtotal`? no — the
  bearer trim isn't present, but `auth.getUser("")` will fail at
  Supabase, yielding the same 401 outcome via `verifyBearer`).
- **JWT forward path** — `auth.raw_jwt` (from Axum middleware) →
  `HttpTaxProxy::new` → `bearer_auth(&self.user_jwt)` (line 104).
  Forwards verbatim. Matches how PostgREST clients thread the JWT.
- **5s timeout** — reasonable for a DB read + in-process calc.
  Consider lowering to 3s once TS tax service latency is measured in
  prod.
- **`ProcurementPortFactory::tax`** — factory pattern matches
  `purchase_orders()` / `po_items()` / `notifications()`. Consistent.
- **OpenAPI** — `TaxPreviewQuery` + `TaxPreviewDto` registered in
  `ProcurementDoc`. `types.ts` regenerated (assumed; not verified
  against openapi.json diff in this review).
- **Auth model** — the TS proxy route verifies the caller's JWT. No
  service-role key leakage. The Rust adapter cannot call the TS route
  without a valid user JWT.
- **Subtotal edge cases** — NaN, Infinity, -0.0, negative all
  rejected. `0.0` allowed (correct; zero-subtotal PO preview is
  legal).

---

## Summary

2 majors (URL encoding, client reuse), 6 minors, 3 nits. Ship with
M1 (module-scope the supabase client) and M2 (url-encoded query
params) addressed. m3 (taxName in DTO) should land before the UI
integration lands in a later S3c task. The rest are S3d prep /
quality-of-life and can ride in follow-up commits.

Recommended pre-commit actions:
1. Fix M2: `Url::parse_with_params` in `tax.rs`.
2. Fix M1: hoist supabase client in `route.ts`.
3. (Optional but cheap) Add `tax_name` to `TaxPreviewDto`.
4. File a ticket for `AppError::Unauthenticated` (m1).
5. Capture S3d golden fixtures from the TS service (m6).
