# Use Cases

Business-logic orchestrators. A use-case coordinates one or more services to fulfil a single business operation: charge tax + create a PO + queue a notification, or reorder math + roll-stock check + bulk PO creation.

## When to create one

Create a use-case if the operation does **any** of:

- Fires a side effect (notification, audit log, cache invalidation)
- Touches more than one service
- Enforces a business rule (status transition, threshold check, EOQ math)
- Will be reused from multiple entry points

**Don't** create one for pure read/list/get/delete, single-field updates with no validation, or pass-through wrappers. Call the infrastructure service directly from the hook in those cases.

## Wiring contract

Every use-case follows the same shape:

```ts
@injectable()
export class XUseCase implements IXUseCase {
  constructor(
    @inject(TOKENS.IFoo) private readonly foo: IFoo,
    @inject(TOKENS.IBar) private readonly bar: IBar
  ) {}

  async execute(input: XInput): Promise<XResult> {
    /* … */
  }
}

export interface XInput {
  /* domain fields */
  actor: ActionActor // ← always present; threaded from the server action
}
export interface IXUseCase {
  execute(input: XInput): Promise<XResult>
}
```

- Registered as a singleton in [`di/di-registration.ts`](../../../di/di-registration.ts) with `container.registerSingleton(TOKENS.IXUseCase, XUseCase)`.
- Resolved at the action layer via `resolveUseCase<IXUseCase>(TOKENS.IXUseCase)` from [`@/di/resolve`](../../../di/resolve.ts). **Never** instantiate the class directly — that bypasses test fakes and DI overrides.
- Server actions take `Omit<XInput, "actor">` as their public input and inject `actor` after `requireAuthenticatedUser()` — clients can't spoof identity.
- Class files have no module-level singleton exports. They are import-safe in isolation, so unit tests can register fakes (`container.registerInstance(TOKENS.IDependency, fake)`) before resolving the use-case without pulling Supabase.

Two legacy use-cases predate this convention and have different signatures: `RecordCutUseCase.execute(client, body, userId)` (takes a Supabase client + raw `userId` instead of an `actor`) and `UpdateMaterialPricingUseCase`'s input uses `actorId: string` instead of `actor: ActionActor`. Both retire when their consumer pages migrate to the entity-typed action shape — until then, treat them as exceptions, not patterns to copy. The four cut-history use-cases also predate the convention — they take an explicit `client: SupabaseClient` plus `requesterUserId / requesterRoles` instead of an `actor`, because they were stamped out as part of the `legacyCutHistoryService` retirement before the actor convention had stabilised. They retire onto the canonical shape when the cut-history server actions migrate.

## Catalog (20)

### Purchase Orders (7)

| Use case                                                                                                       | Input (shape)                                                                      | Orchestrates                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`create-purchase-order.use-case.ts`](./purchase-orders/create-purchase-order.use-case.ts)                     | `CreatePurchaseOrderInput` (supplier, items, dates, costs, jobId, actor)           | Tax calc → PO create → analytics warm-up. Returns PO + tax breakdown.                                                                                                                                                                                                                                                                                                               |
| [`update-purchase-order.use-case.ts`](./purchase-orders/update-purchase-order.use-case.ts)                     | `UpdatePurchaseOrderInput` (poId, partial fields, actor)                           | Status-guarded edit (only `draft` / `pending_approval`); recomputes money invariant on item/tax/shipping change.                                                                                                                                                                                                                                                                    |
| [`approve-purchase-order.use-case.ts`](./purchase-orders/approve-purchase-order.use-case.ts)                   | `ApprovePurchaseOrderInput` (poId, actor)                                          | Status transition `pending_approval → approved`; stamps approver + timestamp; queues approval notification.                                                                                                                                                                                                                                                                         |
| [`reject-purchase-order.use-case.ts`](./purchase-orders/reject-purchase-order.use-case.ts)                     | `RejectPurchaseOrderInput` (poId, reason, actor)                                   | Status transition `pending_approval → draft`; records reason; notifies requester.                                                                                                                                                                                                                                                                                                   |
| [`receive-purchase-order.use-case.ts`](./purchase-orders/receive-purchase-order.use-case.ts)                   | `ReceivePurchaseOrderInput` (poId, idempotencyKey, per-item receipt deltas, actor) | Idempotent receipt persistence (step 7c-1): inserts a `po_item_receipts` row keyed by `(item_id, idempotency_key)` BEFORE the entity apply so retries dedup via the UNIQUE constraint; records receipts on items; auto-flips PO status to `partial_received` or `received`; stamps `actualDeliveryDate` on full receipt. Roll creation per receipt is optional via `rollRequested`. |
| [`reconcile-pending-apply.use-case.ts`](./purchase-orders/reconcile-pending-apply.use-case.ts)                 | `ReconcilePendingApplyInput` (receiptId, actor)                                    | Admin-only recovery (step 7c-2): replays a `po_item_receipts` row whose INSERT committed but whose PO entity apply was lost. Loads the PO, re-runs `recordReceipts` with the receipt's stored values, stamps `applied_at`. Idempotent if `applied_at` is already populated. Backs the admin reconciliation dashboard's "Pending apply" section.                                     |
| [`reconcile-pending-roll-creation.use-case.ts`](./purchase-orders/reconcile-pending-roll-creation.use-case.ts) | `ReconcilePendingRollCreationInput` (receiptId, actor)                             | Admin-only recovery (step 7c-2): for receipts where the PO apply landed but `rollService.createRoll` failed. Replays `buildCreateRollPropsFromReceipt` from the receipt's typed roll-intent columns + PO-item fallbacks, calls `createRoll`, stamps `roll_created_at`. Three-state outcome: `created` / `already-exists` (stale-stamp recovery) / `already-stamped` (idempotent).   |

### Reorder (3)

| Use case                                                                                                     | Input (shape)                                                      | Orchestrates                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [`generate-reorder-suggestions.use-case.ts`](./reorder/generate-reorder-suggestions.use-case.ts)             | `GenerateReorderSuggestionsInput` (tenantId, actor)                | Scans roll inventory + reorder rules; computes EOQ via `IReorderCalculationsService`; returns ranked suggestions. |
| [`create-reorder-purchase-order.use-case.ts`](./reorder/create-reorder-purchase-order.use-case.ts)           | `CreateReorderPurchaseOrderInput` (suggestionId, overrides, actor) | Materialises one reorder suggestion into a real PO via `CreatePurchaseOrderUseCase`.                              |
| [`create-bulk-reorder-purchase-order.use-case.ts`](./reorder/create-bulk-reorder-purchase-order.use-case.ts) | `CreateBulkReorderPurchaseOrderInput` (suggestionIds, actor)       | Groups suggestions by supplier, fans out to per-supplier `CreatePurchaseOrderUseCase` calls.                      |

### Cuts (1)

| Use case                                                  | Input (shape)                                    | Orchestrates                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [`record-cut.use-case.ts`](./cuts/record-cut.use-case.ts) | `RecordCutInput` (rollId, length, jobRef, actor) | Deplete roll → write cut log → queue completion notification. Enforces "no cut from depleted roll" invariant. |

### Cut History (4)

Replaces the retired `legacyCutHistoryService` listing/get/delete/analytics surface. All four take an explicit `client` + `requesterUserId / requesterRoles` (pre-`actor` convention).

| Use case                                                                       | Input (shape)                                                                            | Orchestrates                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`list-cut-history.use-case.ts`](./cut-history/list-cut-history.use-case.ts)   | `ListCutHistoryInput` (client, page, limit, from, to, filterUserId, requester{Id,Roles}) | Paginated cut-history listing with privilege scoping. admin/manager/supervisor see all rows (optionally narrowed by `filterUserId`); non-privileged users always see only their own. Returns raw legacy row shape pending entity migration. |
| [`get-cut-by-id.use-case.ts`](./cut-history/get-cut-by-id.use-case.ts)         | `GetCutByIdInput` (client, cutId, requester{Id,Roles})                                   | Single-row fetch with authorization: admin/manager/supervisor see any row; everyone else only their own. Throws `CutNotFoundError` / `CutForbiddenError`.                                                                                   |
| [`get-cut-analytics.use-case.ts`](./cut-history/get-cut-analytics.use-case.ts) | `GetCutAnalyticsInput` (client, from, to, requester{Id,Roles}, filterUserId)             | Date-range rows for the analytics dashboard. Same privilege scoping as the list use-case; returns the full set in range for client-side aggregation.                                                                                        |
| [`delete-cut.use-case.ts`](./cut-history/delete-cut.use-case.ts)               | `DeleteCutInput` (client, cutId, requester{Id,Roles})                                    | Authorize-then-delete: admin/manager can delete any record; cutters can delete only records they own; everyone else forbidden. Throws `CutNotFoundError` / `CutForbiddenError`.                                                             |

### Pricing (1)

| Use case                                                                               | Input (shape)                                                                                                               | Orchestrates                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`update-material-pricing.use-case.ts`](./pricing/update-material-pricing.use-case.ts) | `UpdateMaterialPricingInput` (materialSupplierId, newCostCents, newEffectiveDate, newExpirationDate, changeReason, actorId) | Loads the `material_supplier` entity → captures the prior cost → updates pricing via `IMaterialSupplierService` → appends an audit row via `IPriceHistoryService`. Two writes; not transactional yet. |

### Invitations (4)

| Use case                                                                       | Input (shape)                                                        | Orchestrates                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`create-invitation.use-case.ts`](./invitations/create-invitation.use-case.ts) | `CreateInvitationInput` (client, actor, email, roles, acceptUrlBase) | Generates a 32-byte hex token, looks up the tenant name, persists via `IInvitationService.create`, dispatches the email synchronously via `IEmailService.sendInvitation`, then records the send outcome on the row (success clears `last_send_error`; failure stamps it). Email failure is non-fatal — the row stays so the admin can resend. Returns `{ ok, invitation, emailSent, emailError }`. Refuses duplicate active invitations (409) and invalid email/empty roles (400). |
| [`resend-invitation.use-case.ts`](./invitations/resend-invitation.use-case.ts) | `ResendInvitationInput` (client, actor, invitationId, acceptUrlBase) | Loads the invitation, refuses accepted/revoked/expired (409) and cross-tenant (404), re-dispatches the email, records the send outcome. Same non-fatal-failure pattern as create.                                                                                                                                                                                                                                                                                                  |
| [`revoke-invitation.use-case.ts`](./invitations/revoke-invitation.use-case.ts) | `RevokeInvitationInput` (actor, invitationId)                        | Loads the invitation, refuses cross-tenant (404) and accepted (409). Calls entity `.revoke()` via `IInvitationService.revoke`. Idempotent on already-revoked.                                                                                                                                                                                                                                                                                                                      |
| [`accept-invitation.use-case.ts`](./invitations/accept-invitation.use-case.ts) | `AcceptInvitationInput` (actor, token)                               | Calls `IInvitationService.acceptByToken` (wraps the `accept_invitation` SECURITY DEFINER RPC: validates auth + token + state + email match, then INSERTs the membership and stamps `accepted_at` in one transaction). Maps custom SQLSTATEs P0001-P0006 to a typed `reason` (`not_found / already_accepted / revoked / expired / email_mismatch / unknown`) so the page layer can render reason-specific empty states.                                                             |

### Helpers

Not use-cases themselves — pure helper modules that live in `use-cases/<domain>/` because their lifetime is tied to a use-case input boundary.

| File                                                                                 | Used by                                                                                                                          | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`purchase-orders/po-input-conversion.ts`](./purchase-orders/po-input-conversion.ts) | `CreatePurchaseOrderUseCase`, `UpdatePurchaseOrderUseCase`, `ReceivePurchaseOrderUseCase`, `ReconcilePendingRollCreationUseCase` | Unit conversion at the input boundary — sqft → sqm (× 0.0929030400), inches → mm (× 25.4), dollars → cents. Forms still send imperial; the PO aggregate is strictly metric + cents. Also exports `buildRollIntent` (operator imperial → metric receipt snapshot, no fallbacks), `buildCreateRollProps` (live receive path, fallback chain to PO-item defaults), and `buildCreateRollPropsFromReceipt` (admin reconcile replay, same fallback chain but driven by the persisted receipt row). |

## Patterns to copy

When adding a new use-case, model it on the closest existing one:

- **Cross-service write with side effect** → `CreatePurchaseOrderUseCase` (tax + PO + analytics)
- **Status transition with audit stamping** → `ApprovePurchaseOrderUseCase` / `RejectPurchaseOrderUseCase`
- **Aggregate state update with auto-derived status flip** → `ReceivePurchaseOrderUseCase`
- **Fan-out / batch composition** → `CreateBulkReorderPurchaseOrderUseCase` (composes a smaller use-case)
- **Read-with-side-computation** → `GenerateReorderSuggestionsUseCase`

---

## Keeping this index current

If you add, remove, or rename a `*.use-case.ts` under `src/application/use-cases/`, update the matching domain section above **in the same commit**. Row format: `| use case file | Input shape | Orchestrates |`. New domain folders need a new heading + a bump to the catalog header count. Also update [`di/README.md`](../../../di/README.md) if you added a new use-case token. PRs that touch this folder without a matching table edit should be sent back in review.
