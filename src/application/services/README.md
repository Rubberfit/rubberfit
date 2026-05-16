# Service Interfaces

Service contracts. The application layer talks to the world through these interfaces; concrete Supabase-backed implementations live in [`src/infrastructure/services/`](../../infrastructure/services/) and are wired into the DI container by token in [`di/di-registration.ts`](../../../di/di-registration.ts).

When you need to call something that touches Supabase, the network, or any external boundary, resolve it via DI rather than importing the concrete class:

```ts
import { container } from "tsyringe"
import { TOKENS } from "@/di/tokens"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"

const poService = container.resolve<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
```

Use-cases inject via constructor decorators (`@inject(TOKENS.IFoo)`) — see the use-cases [README](../use-cases/README.md).

## Catalog (30)

### Packing / Export

| Interface           | File                                                                   | Purpose                                                                                                           |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `IPackingService`   | [`packing.service.interface.ts`](./packing.service.interface.ts)       | Canonical packing boundary — environment binds to `RustPackingService` (server) or `ApiPackingService` (browser). |
| `IExportService`    | [`export.service.interface.ts`](./export.service.interface.ts)         | Generic export orchestration.                                                                                     |
| `IExportPdfService` | [`export-pdf.service.interface.ts`](./export-pdf.service.interface.ts) | PDF export (cut sheets, job summaries).                                                                           |
| `ICsvService`       | [`csv.service.interface.ts`](./csv.service.interface.ts)               | CSV import/export utilities.                                                                                      |

### Inventory / Materials

| Interface                     | File                                                                                       | Purpose                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `IRollService`                | [`roll.service.interface.ts`](./roll.service.interface.ts)                                 | Roll CRUD + lifecycle (depletion, status). `findByPurchaseOrderItemId` powers 7c-2 admin reconcile stale-stamp recovery. |
| `IRollInventoryService`       | [`roll-inventory.service.interface.ts`](./roll-inventory.service.interface.ts)             | Aggregate inventory queries (admin-client bound).                                                                        |
| `ICutService`                 | [`cut.service.interface.ts`](./cut.service.interface.ts)                                   | Cut log writes + queries (granular per-piece).                                                                           |
| `IMaterialTypeService`        | [`material-type.service.interface.ts`](./material-type.service.interface.ts)               | Material catalog CRUD.                                                                                                   |
| `IMaterialSupplierService`    | [`material-supplier.service.interface.ts`](./material-supplier.service.interface.ts)       | Per-supplier material pricing + lead-time CRUD. Consumed by `UpdateMaterialPricingUseCase`.                              |
| `ISupplierService`            | [`supplier.service.interface.ts`](./supplier.service.interface.ts)                         | Supplier CRUD + contact management.                                                                                      |
| `IPriceHistoryService`        | [`price-history.service.interface.ts`](./price-history.service.interface.ts)               | Price-change audit trail (entity-typed).                                                                                 |
| `IReorderService`             | [`reorder.service.interface.ts`](./reorder.service.interface.ts)                           | Entity-typed reorder-rule CRUD + transitions.                                                                            |
| `IReorderCalculationsService` | [`reorder-calculations.service.interface.ts`](./reorder-calculations.service.interface.ts) | EOQ math + threshold derivation.                                                                                         |

### Commerce / Procurement

| Interface                        | File                                                                                               | Purpose                                                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IPurchaseOrderService`          | [`purchase-order.service.interface.ts`](./purchase-order.service.interface.ts)                     | Entity-typed PO lifecycle transitions + receipt recording. `recordReceiptsByItemId` is the idempotent variant (7c-1); `findReceiptById`, `findPendingApplyReceipts`, `findPendingRollCreationReceipts`, `markReceiptApplied`, `markReceiptRollCreated` back the 7c-2 admin reconcile dashboard. |
| `IPurchaseOrderAnalyticsService` | [`purchase-order-analytics.service.interface.ts`](./purchase-order-analytics.service.interface.ts) | PO analytics queries (totals, vendor performance).                                                                                                                                                                                                                                              |

### Operations / Cuts

| Interface              | File                                                                         | Purpose                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ICutHistoryService`   | [`cut-history.service.interface.ts`](./cut-history.service.interface.ts)     | Entity-typed cut-history reads/writes + analytics. Hybrid surface — exposes both the canonical entity API and a transitional raw-row reader for callers not yet migrated. Consumed by `RecordCutUseCase` and the cut-history list/get use-cases. |
| `ICutFavoritesService` | [`cut-favorites.service.interface.ts`](./cut-favorites.service.interface.ts) | User bookmarks of cut history rows.                                                                                                                                                                                                              |

### Auth / Profile / Users

| Interface                | File                                                                             | Purpose                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IAuthService`           | [`auth.service.interface.ts`](./auth.service.interface.ts)                       | Sign-in, sign-out, session, OAuth, password reset.                                                                                                                                                                                                                                                 |
| `IProfileService`        | [`profile.service.interface.ts`](./profile.service.interface.ts)                 | Profile read/write.                                                                                                                                                                                                                                                                                |
| `IUserManagementService` | [`user-management.service.interface.ts`](./user-management.service.interface.ts) | Admin-portal user CRUD + role assignments.                                                                                                                                                                                                                                                         |
| `IInvitationService`     | [`invitation.service.interface.ts`](./invitation.service.interface.ts)           | Tenant-membership invitation lifecycle: create / get-by-token / list-pending / revoke / record-send-attempt / accept-by-token. Atomic accept + public lookup wrap two SECURITY DEFINER RPCs (`accept_invitation`, `get_invitation_by_token`) so brand-new invitees clear RLS via token possession. |

### Comms

| Interface              | File                                                                       | Purpose                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IEmailService`        | [`email.service.interface.ts`](./email.service.interface.ts)               | Email send + queue processing.                                                                                                                                                                  |
| `INotificationService` | [`notification.service.interface.ts`](./notification.service.interface.ts) | **Always route notification side effects through this.** Handles preferences, quiet hours, toast, DB persist, queue — in one call. Don't write `notifications` / `notification_queue` directly. |

### Health / Alerts (admin)

| Interface                 | File                                                                               | Purpose                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `IHealthCheckService`     | [`health-check.service.interface.ts`](./health-check.service.interface.ts)         | Periodic + on-demand health probes.                           |
| `IHealthCheckAdapter`     | [`health-check-adapter.interface.ts`](./health-check-adapter.interface.ts)         | Per-endpoint adapter pluggable into the health-check service. |
| `IHealthAlertService`     | [`health-alert.service.interface.ts`](./health-alert.service.interface.ts)         | Health-driven alert fan-out.                                  |
| `IAlertManagementService` | [`alert-management.service.interface.ts`](./alert-management.service.interface.ts) | Admin alert CRUD + acknowledgement.                           |

### Tax

| Interface        | File                                                             | Purpose                                                               |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ITaxService`    | [`tax.service.interface.ts`](./tax.service.interface.ts)         | Tax calculation orchestration (uses `ITaxApiService` under the hood). |
| `ITaxApiService` | [`tax-api.service.interface.ts`](./tax-api.service.interface.ts) | External tax-rate API adapter.                                        |

### Vision / Extraction

| Interface                  | File                                                                                 | Purpose                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `IVisionExtractionService` | [`vision-extraction.service.interface.ts`](./vision-extraction.service.interface.ts) | LLM-vision extraction of structured data from images (e.g., PO PDFs). |

## Notes

- Interface files are import-safe — they declare types only and never pull Supabase or Next.js. Unit tests can import them freely.
- DDD-migrated concretes under [`src/infrastructure/services/`](../../infrastructure/services/) call `await getDatabaseClient()` from `@/src/infrastructure/supabase/get-database-client` so they receive the cookie-bound `createServerClient` on the server (RLS-respecting) and the browser singleton client-side. Some pre-DDD services still import the browser singleton from `@/src/infrastructure/models/supabase` directly; those migrate opportunistically as their callers are touched. The transitional mappers `po-entity-to-legacy.ts` and `roll-entity-to-legacy.ts` import the browser singleton by design — they exist to keep pre-entity UI callers working until those surfaces are migrated. `IHealthCheckAdapter` has no DI token; it's wired by the health-check service factory, not the container.
- A few interfaces are "admin-client-bound" (`IRollInventoryService`, `ICutFavoritesService`) — their concretes use the service-role client because they read across tenants. Treat these as escape hatches; do not extend the pattern without a clear reason.

---

## Keeping this index current

If you add, remove, or rename a `*.service.interface.ts` in this folder, update the matching domain section above **in the same commit**. Row format: `| Interface | file | Purpose |`. New domain sections need a new heading + an updated count in the catalog header. PRs that touch this folder without a matching table edit should be sent back in review.
