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

## Catalog (10)

### Purchase Orders (5)

| Use case                                                                                     | Input (shape)                                                            | Orchestrates                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`create-purchase-order.use-case.ts`](./purchase-orders/create-purchase-order.use-case.ts)   | `CreatePurchaseOrderInput` (supplier, items, dates, costs, jobId, actor) | Tax calc → PO create → analytics warm-up. Returns PO + tax breakdown.                                                                                     |
| [`update-purchase-order.use-case.ts`](./purchase-orders/update-purchase-order.use-case.ts)   | `UpdatePurchaseOrderInput` (poId, partial fields, actor)                 | Status-guarded edit (only `draft` / `pending_approval`); recomputes money invariant on item/tax/shipping change.                                          |
| [`approve-purchase-order.use-case.ts`](./purchase-orders/approve-purchase-order.use-case.ts) | `ApprovePurchaseOrderInput` (poId, actor)                                | Status transition `pending_approval → approved`; stamps approver + timestamp; queues approval notification.                                               |
| [`reject-purchase-order.use-case.ts`](./purchase-orders/reject-purchase-order.use-case.ts)   | `RejectPurchaseOrderInput` (poId, reason, actor)                         | Status transition `pending_approval → draft`; records reason; notifies requester.                                                                         |
| [`receive-purchase-order.use-case.ts`](./purchase-orders/receive-purchase-order.use-case.ts) | `ReceivePurchaseOrderInput` (poId, per-item receipt deltas, actor)       | Records receipts on items; auto-flips PO status to `partial_received` or `received` based on aggregate fill; stamps `actualDeliveryDate` on full receipt. |

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

### Pricing (1)

| Use case                                                                                          | Input (shape)                                                                                                          | Orchestrates                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`update-material-pricing.use-case.ts`](./pricing/update-material-pricing.use-case.ts)            | `UpdateMaterialPricingInput` (materialSupplierId, newCostCents, newEffectiveDate, newExpirationDate, changeReason, actorId) | Loads the `material_supplier` entity → captures the prior cost → updates pricing via `IMaterialSupplierService` → appends an audit row via `IPriceHistoryService`. Two writes; not transactional yet. |

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
