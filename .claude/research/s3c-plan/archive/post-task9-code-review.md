# Post-Task 9 code review — procurement shims + typed SDK

**Commits reviewed:**
- `cfb0238` — feat(web): procurement cookie→bearer shims + typed SDK (S3c Task 9)

Note: the prompt referenced `1bb1d8f` + "the Task 9 commit just after it", but `1bb1d8f` is Task 8 (Rust CSV import). The Task 9 commit matching the listed file set is `cfb0238`; Task 10 (`aefb1bc`) also already landed but is out of review scope.

**Files:** 15 route shims under `app/api/v2/{po,reorder-rules,import/rolls}/**`, plus `src/infrastructure/api-client/rf/procurement.ts` (508 lines).

Verified against:
- `engine/crates/rf-api/src/router.rs`
- `src/infrastructure/api-client/types.ts` (regenerated — all 20 schemas exist)
- Legacy services (`purchaseOrderService`, `reorderService`, `csvService`, `taxService`)
- Bridge at `app/api/v2/_lib/bridge.ts`

---

## Critical

None.

## Major

### M1 — `reorderRules.suggestions` flag-OFF maps the wrong flag
**File:** `src/infrastructure/api-client/rf/procurement.ts:370-374`

The SDK calls `legacyReorder.generateReorderSuggestions(params?.include_pending)`, but the two booleans have disjoint semantics:

- **Rust `include_pending`** (`engine/crates/rf-api/src/procurement/reorder_rules.rs:204-208`): "include rules with at least one non-draft PO already in flight."
- **Legacy `includeInactive`** (`src/infrastructure/services/reorderService.ts:273`): "include inactive material types."

Flipping `include_pending=true` with the flag OFF yields an entirely different result set than with the flag ON. This will fail parity tests and confuse whatever T11b surface uses it.

**Fix:** Drop the arg when calling legacy (`generateReorderSuggestions()` default `false` is the closest equivalent), OR explicitly throw from the flag-OFF path as we already do for the three reorder→PO methods. A comment alone isn't enough — the current code silently does the wrong thing.

### M2 — `purchaseOrders.updateStatus` flag-OFF comment is inaccurate; behavior will surprise callers
**File:** `src/infrastructure/api-client/rf/procurement.ts:172-185`

The comment says "Legacy silently accepts `received`." That's wrong. `purchaseOrderService.updatePurchaseOrderStatus` (lines 357-359) calls `isValidStatusTransition` (lines 590-601), which only allows `ordered → received`. Any other state → `received` throws `Invalid status transition from X to received`. And the plan section on this path wants flag-OFF to preserve existing UI behavior, which today fails at the legacy layer for any non-`ordered` → `received` attempt.

Net effect: flag-OFF surfaces a messy string error; flag-ON surfaces a stable `RECEIVED_REQUIRES_RECEIVE_FLOW` code. Not identical but not disastrous. The fix is to correct the comment (remove the word "silently") and optionally emit a synthetic `RECEIVED_REQUIRES_RECEIVE_FLOW` on flag-OFF for transition consistency.

### M3 — Bridge forces `content-type: application/json` on every non-read forwarded body
**File:** `app/api/v2/_lib/bridge.ts:143`

Not introduced by Task 9, but Task 9 is the first commit to forward a non-JSON body through the bridge (CSV uploads). The bridge unconditionally sets `"content-type": "application/json"` whenever a body is present. For `/api/v2/import/rolls/csv`, this clobbers the real `text/csv` declaration.

Today it works because `procurement::import_rolls_csv` reads raw bytes and never checks content-type. But: (a) OpenAPI says `text/csv`, so the contract is violated on the wire; (b) any future content-negotiation or observability tooling will see garbage; (c) the Rust handler comment explicitly lists `text/csv | application/octet-stream | multipart/form-data` as accepted — the bridge lies about all three.

**Fix:** Propagate the incoming `content-type` when present, falling back to `application/json`:

```ts
const incomingCT = request.headers.get("content-type")
...headers = {
  authorization: `Bearer ${token}`,
  ...(body !== undefined ? { "content-type": incomingCT ?? "application/json" } : {}),
}
```

### M4 — CSV quick-upload path: SDK bypasses `rfClient` with a plain `fetch`; flag-OFF/flag-ON error shapes diverge
**File:** `src/infrastructure/api-client/rf/procurement.ts:459-485`

Using `fetch` direct for `text/csv` is correct (openapi-fetch serializes to JSON by default). But the flag-ON branch throws a plain `new Error("<status> <text>: <body>")` with no `.code`, while every other flag-ON path throws an Error with `.code` populated from the problem-JSON. T11's "discriminate on `error.code`" contract breaks specifically on CSV upload.

**Fix:** Parse the Rust error body (`try { JSON.parse(text) } catch`) and if it has a `code` field, use the same `unwrap`-style error with `.code` + `.status`. Also reject 413 (10 MiB cap from Rust) explicitly.

### M5 — `receive` flag-OFF silently drops any `rollData` fields beyond the 5 declared ones
**File:** `src/infrastructure/api-client/rf/procurement.ts:210-222`

The Rust `ReceiveRollDataBody` has `{ width, length, thickness, color, location }` — that's the full domain. But legacy `POReceiptItem.rollData` is `Partial<Roll>`, which includes `material_type_id`, `supplier_id`, `cost_per_sqft`, `date_received`, `notes`, etc. The SDK explicitly enumerates only the 5 fields. A caller supplying additional Roll fields on the DTO-ON path today cannot, so this is theoretical. But a caller migrating in the other direction (from legacy shape to SDK) will see fields dropped.

**Fix:** Either spread `...i.roll_data` into the legacy shape (accept that the extra fields are `undefined` under DTO) or add an inline comment explaining the intentional narrowing.

## Minor

### m1 — `purchaseOrders.delete` swallows non-OK without enforcing a thrown Error when `res.error` is undefined
**File:** `procurement.ts:197-201` (also `items.delete`, `reorderRules.delete`)

`if (!res.response.ok) unwrap(res)` works if `res.error` is populated, but a 5xx that returns no body gives `result.data === undefined && result.error === undefined`, which falls into `unwrap`'s "response had no data" generic throw. That's fine — but the message is "response had no data" rather than `500 Internal Server Error`. Consider also checking `response.ok` inside `unwrap` and using `response.status` in the thrown error.

### m2 — `reorderRules.get` flag-OFF uses `try/catch → null`, which hides non-404 errors
**File:** `procurement.ts:318-326`

A database error, a network blip, or a permission failure all turn into `null`, indistinguishable from "not found." Flag-ON path correctly only returns null on 404. Legacy `getReorderRuleById` throws on any DB error including `.single()` "no rows" — the SDK would need to branch on PostgREST code `PGRST116` to differentiate. Current approach is a parity/telemetry hole.

**Fix:** Narrow the catch to the not-found case — either by code inspection (`(error as { code?: string }).code === "PGRST116"`) or by adding a legacy `findById` variant that returns null.

### m3 — `purchaseOrders.items.list` flag-OFF re-fetches the whole PO to extract `items`
**File:** `procurement.ts:239-245`

Pragmatic for the cutover, but costs an extra round-trip when the caller wanted items only. Low priority — the flag-OFF path is temporary. Flag a follow-up for T11a to cut over the items surface first and remove this.

### m4 — Every handler builds its own `type Params = Promise<{ id: string }>`
**File:** all `[id]/route.ts` and `[id]/[item_id]/route.ts` handlers

Could be a shared alias `import type { ParamsOf }`. Purely a readability nit — acceptable to leave.

### m5 — `purchaseOrders.list()` flag-ON: `query: params` is forwarded wholesale; `undefined` fields become literal `undefined` in the URL
**File:** `procurement.ts:128-131`

openapi-fetch generally strips undefined query params, but when `params` is itself undefined, `query: undefined` triggers a slightly different code path. Consider passing `query: params ?? {}` for consistency with the inventory SDK (which takes the same shape).

## Nit

### n1 — `unwrap` error construction uses `new Error(e.code)` — the message becomes the code string
**File:** `procurement.ts:87`

`error.message === "RECEIVED_REQUIRES_RECEIVE_FLOW"` is fine for stability but reads badly in logs where the error.message is surfaced. Consider `new Error(\`${e.code}: ${e.message ?? "<no message>"}\`)` and keep `.code` authoritative. Mirrors what the inventory SDK does.

### n2 — The four namespaces are top-level exports with no barrel; consumers must know which namespace has which method
**File:** `procurement.ts:106, 309, 435, 492`

Consider `export const procurement = { purchaseOrders, reorderRules, importRolls, tax }` in addition to the individual exports, mirroring the shape the Rust router has.

---

## Verified fine

- **Route paths all match `router.rs`.** The 15 shims line up 1:1 with the Axum routes including tax-preview registration order, static-path-before-`/{id}` ordering, and the PO-items double-dynamic nested route.
- **`Promise<{...}>` params shape is correct for Next 16.** Every `[id]` route awaits `ctx.params`.
- **`encodeURIComponent` is applied consistently** — on every dynamic segment across all 9 parameterized routes. Defense-in-depth even though the Rust matcher would tolerate unencoded UUIDs.
- **Flag-read timing is correct.** `useRustBackend()` reads `process.env` at call time; Next.js runtime server-side DOES re-read `process.env` per request (only the client bundle inlines `NEXT_PUBLIC_*` at build). A Vercel env flip takes effect on the next server-side invocation without a redeploy. Pattern matches S3b's inventory SDK.
- **Type references match generated `types.ts`.** All 20 schema references (`PurchaseOrderDto`, `CreatePurchaseOrderBody`, `ReceiveItemBody`, etc.) exist at the expected line numbers (538-1087).
- **No credential leakage.** SDK never touches Supabase directly; `rfClient.baseUrl=""` means browser→Next.js→bridge (owns bearer minting)→Rust. No service-role keys, no JWT handling in the SDK.
- **`as unknown as X` casts are confined to the legacy-boundary** (7 sites, all marked). Flag-ON paths return `unwrap(res)` directly — no hidden casts.
- **Three reorder→PO `throw`s are acceptable** given the scope note: the legacy entrypoint shape genuinely doesn't round-trip cleanly, and T11b will flip the flag. Error message mentions the env var by name, which is good.
- **`params: Promise<{...}>`** await pattern is consistent across all 9 param-handling shims.

---

## Coverage gaps for T10 (parity tests)

T10 parity tests already landed at `aefb1bc`. Worth auditing that it covers:

- `purchaseOrders.list` — flag-ON (with status) vs flag-OFF `getPurchaseOrdersByStatus`; and no-filter case → `getAllPurchaseOrders`
- `purchaseOrders.get` — 404 → null on flag-ON, legacy-throw vs shape-return on flag-OFF
- `purchaseOrders.create` — DTO body → legacy `CreatePurchaseOrder` shape
- `purchaseOrders.update` — same as above
- `purchaseOrders.updateStatus` — flag-ON `RECEIVED_REQUIRES_RECEIVE_FLOW` vs flag-OFF invalid-transition throw (M2)
- `purchaseOrders.delete` — void on success, unwrap on non-OK
- `purchaseOrders.receive` — snake→camel field mapping, including the dropped-fields case (M5)
- `purchaseOrders.items.list` — flag-OFF PO-extract path (m3)
- `purchaseOrders.items.add` — `{ ...body, purchase_order_id: po_id }` merge
- `purchaseOrders.items.update/delete` — path-segment plumbing
- `reorderRules.list/get/create/update/delete` — full CRUD parity
- `reorderRules.suggestions` — **M1 parity gap**; flag-OFF currently drops `include_pending` semantics
- `reorderRules.createPo / createIndividualPos / createBulkPo` — flag-ON only (flag-OFF throws; test the throw)
- `importRolls.uploadJson` — flag-ON uses openapi-fetch, flag-OFF converts to legacy `uploadRolls` + shapes receipt
- `importRolls.uploadCsv` — flag-ON uses direct `fetch` (bypasses openapi-fetch); flag-OFF runs `parseCSV → transformToRolls → uploadRolls`; M3 (content-type clobber), M4 (error-shape divergence), 413 handling
- `tax.preview` — camelCase-to-snake_case boundary, zero-subtotal, missing-supplier, tax-exempt-supplier

Recommend test cases explicitly asserting M1, M3, M4 behavior so they don't regress silently.
