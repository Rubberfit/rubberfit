# Value Objects

Self-validating, immutable domain primitives. Every VO in this folder follows the same lifecycle pattern — internalise it once and you'll know how to use (and write) all of them.

```ts
SomeVO.create(input)        // user-supplied; validates, throws InvalidValueObjectError on bad input
SomeVO.fromPersistence(...) // DB-sourced; trusted, no validation
some.equals(other)          // value equality
some.toString()             // canonical string form
some.toJSON()               // JSON serialisation
```

Reuse the VOs in the table below before introducing a new primitive type or hardcoding a string/number.

## Catalog

| File                                           | Type                    | Purpose                                                                 | Reuse before reinventing                                                                                                                                                                |
| ---------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`money.ts`](./money.ts)                       | `Money`                 | Integer cents + `Currency`; safe arithmetic; cross-currency math throws | **ALL** monetary fields — never use `number` for money. Factories: `fromCents`, `zero`, `fromPersistence`, `fromSnapshot`. Display via `Intl.NumberFormat` at the UI layer, not the VO. |
| [`currency.ts`](./currency.ts)                 | `Currency`              | ISO-4217 3-letter code                                                  | Pair with `Money`. Don't pass currency as a bare string.                                                                                                                                |
| [`email.ts`](./email.ts)                       | `Email`                 | RFC-compliant email, case-preserved                                     | Profile + Invitation contact fields. Format regex + 320-char cap.                                                                                                                       |
| [`tenant-slug.ts`](./tenant-slug.ts)           | `TenantSlug`            | URL-safe tenant identifier (2–100 chars)                                | Tenant routing, public URLs. Regex `[a-z0-9][a-z0-9-]*[a-z0-9]`.                                                                                                                        |
| [`invitation-token.ts`](./invitation-token.ts) | `InvitationToken`       | 64-char hex token (32 bytes hex-encoded)                                | Invitation row token + email-link payload.                                                                                                                                              |
| [`po-status.ts`](./po-status.ts)               | `PoStatus`              | Purchase-order lifecycle state machine (7 states)                       | **Don't hardcode status strings.** Use `canPoStatusTransitionTo`, `assertPoStatusTransition`, `isPoStatus` guards. Copy this shape when modeling new status fields.                     |
| [`invoice-status.ts`](./invoice-status.ts)     | `InvoiceStatus`         | Invoice lifecycle state machine (5 states)                              | Same shape as `po-status.ts`. Use `canInvoiceStatusTransitionTo`, `assertInvoiceStatusTransition`, `isInvoiceStatus`.                                                                   |
| [`project-status.ts`](./project-status.ts)     | `ProjectStatus`         | Project lifecycle state machine (4 states)                              | Same shape. `canProjectStatusTransitionTo`, `assertProjectStatusTransition`, `isProjectStatus`.                                                                                         |
| [`job-status.ts`](./job-status.ts)             | `JobStatus`             | Job lifecycle state machine (5 states)                                  | Same shape. `canJobStatusTransitionTo`, `assertJobStatusTransition`, `isJobStatus`.                                                                                                     |
| [`id.ts`](./id.ts)                             | `Id<Brand>` + factories | Branded UUID; phantom typing per entity                                 | All entity primary keys. **21 brands already declared** — see below. Add a new brand instead of typing `string`.                                                                        |
| [`postal-address.ts`](./postal-address.ts)     | `PostalAddress`         | Inline address VO (line1, line2, city, state, postal_code, country)     | Used on Supplier (live), PurchaseOrder shipping + billing (snapshot at issue time), Invoice billing (snapshot). Replaces the dropped `addresses` table + standalone `Address` entity (2026-05-12). |

## ID brands (21)

Each brand below is a `type` alias **and** a `const` factory object with `create()` / `fromPersistence()` methods. Same nominal-typing trick — `TenantId` is not assignable to `ProfileId` even though both are UUIDs at runtime.

`TenantId`, `ProfileId`, `MembershipId`, `InvitationId`, `PlanId`, `SubscriptionId`, `PersonId`, `MaterialTypeId`, `SupplierId`, `SupplierContactId`, `MaterialSupplierId`, `RollId`, `PriceHistoryId`, `ReorderRuleId`, `CutId`, `CutHistoryId`, `CutFavoriteId`, `PurchaseOrderId`, `JobId`, `InvoiceId`, `ProjectId`.

If you need an ID brand that isn't here, add it — the pattern is ~6 lines per brand.

## Most-overlooked

Agents most commonly reinvent these. **Check first:**

- **`Money`** — agents tend to use `number` for prices, totals, costs. Always wrap in `Money`. Cross-currency math must use explicit FX in a use-case, not silent coercion.
- **`Id<Brand>` factories** — agents tend to pass raw UUID strings. Use `EntityNameId.fromPersistence(row.id)` at every Supabase → entity boundary.
- **`PoStatus` transition guards** — agents tend to write `if (status === "approved")` checks. Use `canPoStatusTransitionTo(current, target)` instead so the state machine is centralised.

## Shared helpers (not VOs, but live nearby)

These are utilities used by entity factories — also commonly reinvented:

- [`../shared/string-helpers.ts`](../shared/string-helpers.ts) — `trimRequired(value, field, max, entityName)` and `trimOptional(value, field, max, entityName)`. DB-aligned varchar length validation. Use at every entity factory + state-transition boundary.
- [`../shared/equality.ts`](../shared/equality.ts) — `nullableEqual(a, b)`: null-safe equality for `Field | null` VOs. Use in entity state-transition no-op checks.
- [`../errors/invalid-value-object.error.ts`](../errors/invalid-value-object.error.ts) — `InvalidValueObjectError`, thrown by VO `create()` factories. Code field: `"INVALID_VALUE_OBJECT"`.
- [`../errors/invalid-entity.error.ts`](../errors/invalid-entity.error.ts) — `InvalidEntityError`, thrown for cross-field entity invariants. Code field: `"INVALID_ENTITY"`.

---

## Keeping this index current

If you add, remove, or rename a VO under `src/entities/value-objects/`, or add a new `Id<Brand>` factory, update the table above **in the same commit**. Row format for VOs: `| file | Type | Purpose | Reuse note |`. For new ID brands, add the name to the comma-separated list and bump the count in the heading. PRs that touch this folder without a matching table edit should be sent back in review.
