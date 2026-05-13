# Dependency Injection

TSyringe container that wires service interfaces and use-cases to concrete implementations. Two files:

- [`tokens.ts`](./tokens.ts) — `TOKENS.IFoo = Symbol("IFoo")` for every wireable thing. Source of truth for what's resolvable.
- [`di-registration.ts`](./di-registration.ts) — binds each token to a concrete singleton or class. Imported once at startup; idempotent thereafter.

Resolution sites:

- **Use-cases inject** dependencies via constructor decorators: `@inject(TOKENS.IFoo) private readonly foo: IFoo`.
- **Server actions resolve** use-cases via `resolveUseCase<IFooUseCase>(TOKENS.IFooUseCase)` from [`./resolve.ts`](./resolve.ts).
- **Tests register fakes** via `container.registerInstance(TOKENS.IFoo, fake)` before resolving the use-case under test.

**Never** import the concrete class directly to bypass DI — that breaks test fakes and the packing service's runtime branching.

## Token catalog

### Services (28)

Two binding styles:

- **Module singleton via `registerInstance`** — the default. Binds the token to a long-lived singleton instance exported from `src/infrastructure/services/`. Used by every service that hasn't been DDD-migrated yet.
- **Class via `registerSingleton`** — used by the 6 DDD-migrated services (`Supplier`, `MaterialSupplier`, `MaterialType`, `PriceHistory`, `Roll`, `Reorder`). The container lazily constructs the class on first resolve and threads the repository in through `@inject`. Class rows are marked with the constructor name (e.g. `RollService`) in the table; singleton rows use the lowercase instance name (e.g. `rollService`).

Order in `tokens.ts` is alphabetical within each group.

| Token                            | Concrete implementation                   |
| -------------------------------- | ----------------------------------------- |
| `IAuthService`                   | `authService`                             |
| `ICsvService`                    | `csvService`                              |
| `ICutService`                    | `cutService`                              |
| `IEmailService`                  | `emailService`                            |
| `IExportPdfService`              | `exportPdfService`                        |
| `IExportService`                 | `exportService`                           |
| `IMaterialSupplierService`       | `MaterialSupplierService` (class)         |
| `IMaterialTypeService`           | `MaterialTypeService` (class)             |
| `INotificationService`           | `notificationService`                     |
| `IPackingService`                | **Runtime-branching factory** — see below |
| `IPriceHistoryService`           | `PriceHistoryService` (class)             |
| `IProfileService`                | `profileService`                          |
| `IPurchaseOrderService`          | `purchaseOrderService`                    |
| `IPurchaseOrderAnalyticsService` | `purchaseOrderAnalytics`                  |
| `IReorderService`                | `ReorderService` (class)                  |
| `ILegacyReorderService`          | `legacyReorderService`                    |
| `IReorderCalculationsService`    | `reorderCalculations`                     |
| `IRollService`                   | `RollService` (class)                     |
| `ISupplierService`               | `SupplierService` (class)                 |
| `ITaxService`                    | `taxService`                              |
| `ITaxApiService`                 | `taxApiService`                           |
| `IVisionExtractionService`       | `visionExtractionService`                 |
| `IUserManagementService`         | `userManagementService`                   |
| `IHealthAlertService`            | `healthAlertService`                      |
| `IHealthCheckService`            | `healthCheckService`                      |
| `IAlertManagementService`        | `alertManagementService`                  |
| `ICutFavoritesService`           | `cutFavoritesService`                     |
| `IRollInventoryService`          | `rollInventoryService`                    |

### Repositories (6)

Registered with `container.registerInstance` — each binds the token to the module-singleton repository exported from `src/infrastructure/repositories/`. Repositories are the entity-typed persistence boundary that DDD-migrated services inject through `@inject`.

| Token                          | Concrete implementation       |
| ------------------------------ | ----------------------------- |
| `IMaterialSuppliersRepository` | `materialSuppliersRepository` |
| `IMaterialTypesRepository`     | `materialTypeRepository`      |
| `IPriceHistoryRepository`      | `priceHistoryRepository`      |
| `IReorderRulesRepository`      | `reorderRulesRepository`      |
| `IRollsRepository`             | `rollsRepository`             |
| `ISuppliersRepository`         | `suppliersRepository`         |

### Use cases (10)

Registered with `container.registerSingleton` — the container lazily constructs each class on first resolve. This keeps use-case modules import-safe for unit tests: importing `create-purchase-order.use-case.ts` does not instantiate it and does not pull Supabase.

| Token                                    | Class                                   |
| ---------------------------------------- | --------------------------------------- |
| `ICreatePurchaseOrderUseCase`            | `CreatePurchaseOrderUseCase`            |
| `IUpdatePurchaseOrderUseCase`            | `UpdatePurchaseOrderUseCase`            |
| `IApprovePurchaseOrderUseCase`           | `ApprovePurchaseOrderUseCase`           |
| `IRejectPurchaseOrderUseCase`            | `RejectPurchaseOrderUseCase`            |
| `IReceivePurchaseOrderUseCase`           | `ReceivePurchaseOrderUseCase`           |
| `IGenerateReorderSuggestionsUseCase`     | `GenerateReorderSuggestionsUseCase`     |
| `ICreateReorderPurchaseOrderUseCase`     | `CreateReorderPurchaseOrderUseCase`     |
| `ICreateBulkReorderPurchaseOrderUseCase` | `CreateBulkReorderPurchaseOrderUseCase` |
| `IRecordCutUseCase`                      | `RecordCutUseCase`                      |
| `IUpdateMaterialPricingUseCase`          | `UpdateMaterialPricingUseCase`          |

## Special case: `IPackingService`

The packing token does not bind to a single instance — it uses `instanceCachingFactory` with three branches:

| Caller context      | Result                                                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server, dev / tests | `new RustPackingService()` — spawns `pack-cli` subprocess. Throws at construction time if the binary is missing.                                                                                                                                                        |
| Server, production  | **Throws.** Production server-side resolution is unsupported — the Vercel Rust serverless function (`api/v2/pack`) is invoked directly by the browser. A stray server resolve indicates a misrouted caller; the throw makes that visible instead of silently degrading. |
| Browser             | `new ApiPackingService()` — POSTs to `/api/v2/pack`.                                                                                                                                                                                                                    |

There is one additional subtlety: `TOKENS.IPackingService` is **re-exported** from `PACKING_TOKENS` (defined in [`src/application/services/packing.service.interface.ts`](../src/application/services/packing.service.interface.ts)). Both surfaces must resolve to the **same `Symbol`** — do not replace with `Symbol("IPackingService")` or `PACKING_TOKENS` consumers stop seeing the registration. Existing comment in `tokens.ts` says this; preserve it on edits.

## Adding a new service

1. Define the interface in `src/application/services/<name>.service.interface.ts` and update [its README](../src/application/services/README.md).
2. Implement the singleton in `src/infrastructure/services/<name>Service.ts`. Use `await getDatabaseClient()` for Supabase, not the browser singleton.
3. Add `INameService: Symbol("INameService"),` to `tokens.ts` (alphabetical within its group).
4. Import the singleton and call `container.registerInstance<INameService>(TOKENS.INameService, nameService)` in `di-registration.ts`.
5. Update the **Services** table in this README.

## Adding a new use-case

1. Define the class in `src/application/use-cases/<domain>/<name>.use-case.ts` per the [use-cases README contract](../src/application/use-cases/README.md). Constructor `@inject` dependencies via existing service tokens.
2. Add `INameUseCase: Symbol("INameUseCase"),` to `tokens.ts` (under the `// Use cases` heading).
3. Import the class and call `container.registerSingleton(TOKENS.INameUseCase, NameUseCase)` in `di-registration.ts`.
4. Update the **Use cases** table in this README.
5. Update the [use-cases README](../src/application/use-cases/README.md) catalog.

## Important gotchas

- **Never put request-scoped state in TSyringe singletons.** Singletons are shared across serverless requests on the same Vercel worker. Per-request auth (`actor: ActionActor`) is passed as a use-case argument, not stored on the container.
- **Tests must reset the container between cases** if they `registerInstance` overrides. Use TSyringe's child-container pattern or call `container.reset()` in `beforeEach`.
- **No module-level singleton exports from use-case files.** The use-case class is the public surface; instances come from `resolveUseCase()`.

---

## Keeping this index current

If you add, remove, or rename a token in [`tokens.ts`](./tokens.ts) or a registration in [`di-registration.ts`](./di-registration.ts), update the matching table above **in the same commit**. Row format: `| Token | Concrete implementation (or class) |`. PRs that touch this folder without a matching table edit should be sent back in review. Also update [`src/application/services/README.md`](../src/application/services/README.md) (for new service interfaces) or [`src/application/use-cases/README.md`](../src/application/use-cases/README.md) (for new use-cases).
