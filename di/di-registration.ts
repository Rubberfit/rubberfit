import "reflect-metadata"
import { container, instanceCachingFactory } from "tsyringe"
import { TOKENS } from "./tokens"

// Application service interfaces
import type { IAuthService } from "@/src/application/services/auth.service.interface"
import type { ICsvService } from "@/src/application/services/csv.service.interface"
import type { ICutService } from "@/src/application/services/cut.service.interface"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IExportPdfService } from "@/src/application/services/export-pdf.service.interface"
import type { IExportService } from "@/src/application/services/export.service.interface"
import type { IMaterialTypeService } from "@/src/application/services/material-type.service.interface"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPriceHistoryService } from "@/src/application/services/price-history.service.interface"
import type { IProfileService } from "@/src/application/services/profile.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { IPurchaseOrderAnalyticsService } from "@/src/application/services/purchase-order-analytics.service.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { IReorderCalculationsService } from "@/src/application/services/reorder-calculations.service.interface"
import type { IRollService } from "@/src/application/services/roll.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { ITaxService } from "@/src/application/services/tax.service.interface"
import type { ITaxApiService } from "@/src/application/services/tax-api.service.interface"
import type { IVisionExtractionService } from "@/src/application/services/vision-extraction.service.interface"
import type { IUserManagementService } from "@/src/application/services/user-management.service.interface"
import type { IHealthAlertService } from "@/src/application/services/health-alert.service.interface"
import type { IHealthCheckService } from "@/src/application/services/health-check.service.interface"
import type { IAlertManagementService } from "@/src/application/services/alert-management.service.interface"
import type { ICutFavoritesService } from "@/src/application/services/cut-favorites.service.interface"
import type { IRollInventoryService } from "@/src/application/services/roll-inventory.service.interface"

// Infrastructure service singletons
import { authService } from "@/src/infrastructure/services/authService"
import { csvService } from "@/src/infrastructure/services/csvService"
import { cutService } from "@/src/infrastructure/services/cutService"
import { emailService } from "@/src/infrastructure/services/emailService"
import { exportPdfService } from "@/src/infrastructure/services/exportPdfService"
import { exportService } from "@/src/infrastructure/services/exportService"
import { ApiPackingService } from "@/src/infrastructure/services/apiPackingService"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { notificationService } from "@/src/infrastructure/services/notificationService"
import { priceHistoryService } from "@/src/infrastructure/services/priceHistoryService"
import { profileService } from "@/src/infrastructure/services/profileService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { purchaseOrderAnalytics } from "@/src/infrastructure/services/purchaseOrderAnalytics"
import { reorderService } from "@/src/infrastructure/services/reorderService"
import { reorderCalculations } from "@/src/infrastructure/services/reorderCalculations"
import { rollService } from "@/src/infrastructure/services/rollService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { taxService } from "@/src/infrastructure/services/taxService"
import { taxApiService } from "@/src/infrastructure/services/taxApiService"
import { visionExtractionService } from "@/src/infrastructure/services/visionExtractionService"
import { userManagementService } from "@/src/infrastructure/services/userManagementService"
import { healthAlertService } from "@/src/infrastructure/services/healthAlertService"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"
import { alertManagementService } from "@/src/infrastructure/services/alertManagementService"
import { cutFavoritesService } from "@/src/infrastructure/services/cutFavoritesService"
import { rollInventoryService } from "@/src/infrastructure/services/rollInventoryService"

// Use case implementations
import { CreatePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"
import { UpdatePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/update-purchase-order.use-case"
import { ApprovePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/approve-purchase-order.use-case"
import { RejectPurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/reject-purchase-order.use-case"
import { ReceivePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/receive-purchase-order.use-case"
import { GenerateReorderSuggestionsUseCase } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import { CreateReorderPurchaseOrderUseCase } from "@/src/application/use-cases/reorder/create-reorder-purchase-order.use-case"
import { RecordCutUseCase } from "@/src/application/use-cases/cuts/record-cut.use-case"

// Register all service singletons with the container.
// Using registerInstance so the same singleton used by app/ consumers is also
// what the container provides when resolving dependencies.
container.registerInstance<IAuthService>(TOKENS.IAuthService, authService)
container.registerInstance<ICsvService>(TOKENS.ICsvService, csvService)
container.registerInstance<ICutService>(TOKENS.ICutService, cutService)
container.registerInstance<IEmailService>(TOKENS.IEmailService, emailService)
container.registerInstance<IExportPdfService>(TOKENS.IExportPdfService, exportPdfService)
container.registerInstance<IExportService>(TOKENS.IExportService, exportService)
container.registerInstance<IMaterialTypeService>(TOKENS.IMaterialTypeService, materialTypeService)
container.registerInstance<INotificationService>(TOKENS.INotificationService, notificationService)
// IPackingService: production now lives in `api/v2/pack.rs` (a Vercel
// Rust serverless function), so the browser POSTs the PackRequest to
// /api/v2/pack and the Rust function runs the pack in-process — no
// Node subprocess, no `pack-cli` binary on Vercel.
//
// Server-side resolution is only meaningful in dev / tests:
//   - `next dev` server code paths that resolve via container
//   - Vitest server-context tests
//   - `vercel dev` (forwards to the Rust function but local pack-cli
//     is still convenient for raw Node tests + benchmarks)
//
// In production the server-side branch is unreachable: the only
// previous caller (`app/api/v2/pack/route.ts`) is deleted, and the
// Vercel Rust function is invoked directly by the browser. A
// production server resolve here would silently return
// `ApiPackingService`, which is browser-only — its first call to
// `getSupabaseClient().auth.getSession()` would crash. Throw loudly
// so any stray server resolve becomes a visible misconfiguration
// instead of an obscure runtime error.
const IS_SERVER = typeof window === "undefined"
const IS_DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production"
const BINARY_EXT = typeof process !== "undefined" && process.platform === "win32" ? ".exe" : ""
// PACK_CLI_PATH lets local dev override the binary location.
export const RUST_PACK_BINARY =
  (typeof process !== "undefined" ? process.env?.PACK_CLI_PATH : undefined) ??
  `${typeof process !== "undefined" ? process.cwd?.() : ""}/engine/target/release/pack-cli${BINARY_EXT}`
function verifyRustBinary(): void {
  if (typeof process === "undefined" || !process.versions?.node) return
  // Wrapped in eval() to keep `require` opaque to the bundler's static
  // analysis — Turbopack treats `require("node:fs")` as an external
  // dependency it can't resolve for client chunks, even under a
  // runtime guard. This is the documented escape hatch.
  const nodeRequire = eval("require") as (m: string) => typeof import("node:fs")
  const fs = nodeRequire("node:fs")
  if (!fs.existsSync(RUST_PACK_BINARY)) {
    throw new Error(
      `[packing] pack-cli binary not found at ${RUST_PACK_BINARY}. ` +
        `Run "npm run build:engine" to build the Rust nesting engine.`
    )
  }
}
container.register(TOKENS.IPackingService, {
  useFactory: instanceCachingFactory(() => {
    if (IS_SERVER && IS_DEV) {
      verifyRustBinary()
      return new RustPackingService()
    }
    if (IS_SERVER) {
      throw new Error(
        "[packing] Server-side IPackingService resolution is unsupported in production — " +
          "the browser must POST directly to /api/v2/pack (the Vercel Rust function). " +
          "If this fires, an unexpected server-side caller is resolving IPackingService; " +
          "trace the call site rather than papering over with ApiPackingService."
      )
    }
    return new ApiPackingService()
  }),
})
container.registerInstance<IPriceHistoryService>(TOKENS.IPriceHistoryService, priceHistoryService)
container.registerInstance<IProfileService>(TOKENS.IProfileService, profileService)
container.registerInstance<IPurchaseOrderService>(
  TOKENS.IPurchaseOrderService,
  purchaseOrderService
)
container.registerInstance<IPurchaseOrderAnalyticsService>(
  TOKENS.IPurchaseOrderAnalyticsService,
  purchaseOrderAnalytics
)
container.registerInstance<IReorderService>(TOKENS.IReorderService, reorderService)
container.registerInstance<IReorderCalculationsService>(
  TOKENS.IReorderCalculationsService,
  reorderCalculations
)
container.registerInstance<IRollService>(TOKENS.IRollService, rollService)
container.registerInstance<ISupplierService>(TOKENS.ISupplierService, supplierService)
container.registerInstance<ITaxService>(TOKENS.ITaxService, taxService)
container.registerInstance<ITaxApiService>(TOKENS.ITaxApiService, taxApiService)
container.registerInstance<IVisionExtractionService>(
  TOKENS.IVisionExtractionService,
  visionExtractionService
)
container.registerInstance<IUserManagementService>(
  TOKENS.IUserManagementService,
  userManagementService
)
container.registerInstance<IHealthAlertService>(TOKENS.IHealthAlertService, healthAlertService)
container.registerInstance<IHealthCheckService>(TOKENS.IHealthCheckService, healthCheckService)
container.registerInstance<IAlertManagementService>(
  TOKENS.IAlertManagementService,
  alertManagementService
)
container.registerInstance<ICutFavoritesService>(TOKENS.ICutFavoritesService, cutFavoritesService)
container.registerInstance<IRollInventoryService>(
  TOKENS.IRollInventoryService,
  rollInventoryService
)

// Use cases — registered as class-based singletons so the container lazily
// constructs them on first resolve, keeping use-case modules import-safe for
// unit tests.
container.registerSingleton(TOKENS.ICreatePurchaseOrderUseCase, CreatePurchaseOrderUseCase)
container.registerSingleton(TOKENS.IUpdatePurchaseOrderUseCase, UpdatePurchaseOrderUseCase)
container.registerSingleton(TOKENS.IApprovePurchaseOrderUseCase, ApprovePurchaseOrderUseCase)
container.registerSingleton(TOKENS.IRejectPurchaseOrderUseCase, RejectPurchaseOrderUseCase)
container.registerSingleton(TOKENS.IReceivePurchaseOrderUseCase, ReceivePurchaseOrderUseCase)
container.registerSingleton(
  TOKENS.IGenerateReorderSuggestionsUseCase,
  GenerateReorderSuggestionsUseCase
)
container.registerSingleton(
  TOKENS.ICreateReorderPurchaseOrderUseCase,
  CreateReorderPurchaseOrderUseCase
)
container.registerSingleton(TOKENS.IRecordCutUseCase, RecordCutUseCase)

export { container }
