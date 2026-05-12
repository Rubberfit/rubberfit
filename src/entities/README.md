# Entities

Domain models. Framework-agnostic: no Next.js, no Supabase imports, no React. Entities own business invariants; infrastructure services map them to/from DB rows.

Every entity follows the three-tier props pattern:

```ts
interface CreateXProps {
  /* user-supplied fields */
}
interface ReconstituteXProps extends CreateXProps {
  id: XId
  createdAt: Date
  // ... persisted audit / state fields
}
interface XSnapshot {
  /* DTO shape — primitive types only, for JSON marshalling */
}

class X {
  static create(props: CreateXProps): X // validates invariants, throws on bad input
  static fromPersistence(props: ReconstituteXProps): X // trusted, no validation
  toSnapshot(): XSnapshot
}
```

State transitions are methods on the entity (`po.approve(actor)`, `roll.depleteBy(length)`) that return a new instance, never mutate. Invariants enforced at the boundary so an instance is never observably invalid.

## Catalog

Grouped by aggregate cluster. Aggregate roots are bold.

### Tenancy / Auth / Billing

| File                                           | Role               | Purpose                                                                                           |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| [`tenant.ts`](./tenant.ts)                     | **Aggregate root** | Workspace / organisation. Owns slug, billing email, status.                                       |
| [`tenant-settings.ts`](./tenant-settings.ts)   | Entity (child)     | Per-tenant configuration (low-stock thresholds, quiet hours, etc.).                               |
| [`profile.ts`](./profile.ts)                   | **Aggregate root** | User profile. PK shared with `auth.users.id` — a `ProfileId` is also the underlying auth user id. |
| [`user-preferences.ts`](./user-preferences.ts) | Entity (child)     | Per-user UI / notification preferences (child of Profile).                                        |
| [`membership.ts`](./membership.ts)             | Entity (child)     | Tenant ↔ Profile join with role. Child of the Tenant aggregate.                                   |
| [`invitation.ts`](./invitation.ts)             | **Aggregate root** | Pending invitation lifecycle. Holds `InvitationToken` + acceptance state.                         |
| [`plan.ts`](./plan.ts)                         | **Aggregate root** | Billing plan (global, not tenant-scoped). Price + feature flags.                                  |
| [`subscription.ts`](./subscription.ts)         | **Aggregate root** | A tenant's subscription to a plan. Renewal + status.                                              |

### Contacts / Locations

| File                         | Role   | Purpose                                                               |
| ---------------------------- | ------ | --------------------------------------------------------------------- |
| [`address.ts`](./address.ts) | Entity | Reusable address record (tenant-scoped). Used for shipping + billing. |
| [`person.ts`](./person.ts)   | Entity | External contact record (e.g., supplier contact). Tenant-scoped.      |

### Inventory / Materials

| File                                             | Role               | Purpose                                                                       |
| ------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| [`material-type.ts`](./material-type.ts)         | **Aggregate root** | Catalog category (tenant-scoped). E.g., "Vinyl 60-inch", "Leather Top-Grain". |
| [`supplier.ts`](./supplier.ts)                   | **Aggregate root** | Vendor (tenant-scoped). Owns supplier-level pricing + lead times.             |
| [`supplier-contact.ts`](./supplier-contact.ts)   | Entity (child)     | Supplier ↔ Person join.                                                       |
| [`material-supplier.ts`](./material-supplier.ts) | Entity             | Material ↔ Supplier pricing + lead time row.                                  |
| [`price-history.ts`](./price-history.ts)         | Entity             | Audit trail for `material_suppliers` price changes.                           |
| [`reorder-rule.ts`](./reorder-rule.ts)           | Entity             | Per-material-type reorder threshold + EOQ inputs.                             |
| [`roll.ts`](./roll.ts)                           | **Aggregate root** | Physical stock roll. Owns remaining length + status; depletes on cut.         |

### Operations / Cuts

| File                                                     | Role               | Purpose                                                      |
| -------------------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| [`cut.ts`](./cut.ts)                                     | Entity             | Granular cut log entry (per-piece).                          |
| [`cut-history.ts`](./cut-history.ts)                     | **Aggregate root** | Job-level cut record (layout JSON + metrics + linked rolls). |
| [`cut-history-selection.ts`](./cut-history-selection.ts) | Entity             | Helper for cut-history filtering UI.                         |
| [`cut-favorite.ts`](./cut-favorite.ts)                   | Entity             | User bookmark of a cut history row.                          |

### Commerce / Procurement

| File                                                 | Role               | Purpose                                                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`purchase-order.ts`](./purchase-order.ts)           | **Aggregate root** | PO with 7-state lifecycle (`draft → pending_approval → approved → ordered → partial_received/received/cancelled`). Owns approval stamps, receipt tracking, money invariant (`total = subtotal + tax + shipping`). |
| [`purchase-order-item.ts`](./purchase-order-item.ts) | Entity (child VO)  | Immutable PO line item. `withReceipt()` returns a new instance.                                                                                                                                                   |

## Shared

These live alongside entities and are consumed by entity factories. Reuse them — don't reinvent:

| Path                                                                             | Use for                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`value-objects/`](./value-objects/)                                             | All VO definitions + ID brands. **Start here when adding a new field type.** See its [README](./value-objects/README.md). |
| [`shared/string-helpers.ts`](./shared/string-helpers.ts)                         | `trimRequired` + `trimOptional` — DB-varchar-aligned trim + length checks.                                                |
| [`shared/equality.ts`](./shared/equality.ts)                                     | `nullableEqual` — null-safe VO equality for no-op state-transition detection.                                             |
| [`errors/invalid-entity.error.ts`](./errors/invalid-entity.error.ts)             | `InvalidEntityError` for cross-field entity invariants.                                                                   |
| [`errors/invalid-value-object.error.ts`](./errors/invalid-value-object.error.ts) | `InvalidValueObjectError` thrown by VO factories.                                                                         |

## Patterns to copy

When adding a new entity, model it on these (each illustrates a different invariant style):

- **State machine with transition guards** → `purchase-order.ts` + `value-objects/po-status.ts`
- **Child VO collection with functional updates** → `PurchaseOrder.items` + `purchase-order-item.ts`
- **Money invariant derivation** → `PurchaseOrder`'s `total = subtotal + tax + shipping` recompute on item/tax/shipping change
- **Soft-delete + audit trail** → `roll.ts`
- **Three-tier props + private # fields** → any aggregate root above

---

## Keeping this index current

If you add, remove, or rename an entity under `src/entities/` (excluding `value-objects/`, `shared/`, `errors/` — those have their own indexes), update the matching aggregate cluster table above **in the same commit**. Row format: `| file | Role | Purpose |`. New aggregate clusters need a new heading. PRs that add or rename an entity file without a matching table edit should be sent back in review.
