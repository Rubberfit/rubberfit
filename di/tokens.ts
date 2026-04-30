import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"

export const TOKENS = {
  // Services
  IAuthService: Symbol("IAuthService"),
  ICsvService: Symbol("ICsvService"),
  ICutService: Symbol("ICutService"),
  IEmailService: Symbol("IEmailService"),
  IExportPdfService: Symbol("IExportPdfService"),
  IExportService: Symbol("IExportService"),
  IMaterialTypeService: Symbol("IMaterialTypeService"),
  INotificationService: Symbol("INotificationService"),
  // Re-exported from PACKING_TOKENS (src/application/services/packing.service.interface.ts).
  // Both surfaces must resolve to the same Symbol — do not replace with Symbol("IPackingService")
  // or PACKING_TOKENS consumers break.
  IPackingService: PACKING_TOKENS.IPackingService,
  IPriceHistoryService: Symbol("IPriceHistoryService"),
  IProfileService: Symbol("IProfileService"),
  IPurchaseOrderService: Symbol("IPurchaseOrderService"),
  IPurchaseOrderAnalyticsService: Symbol("IPurchaseOrderAnalyticsService"),
  IReorderService: Symbol("IReorderService"),
  IReorderCalculationsService: Symbol("IReorderCalculationsService"),
  IRollService: Symbol("IRollService"),
  ISupplierService: Symbol("ISupplierService"),
  ITaxService: Symbol("ITaxService"),
  ITaxApiService: Symbol("ITaxApiService"),
  IVisionExtractionService: Symbol("IVisionExtractionService"),

  // Admin portal services
  IUserManagementService: Symbol("IUserManagementService"),
  IHealthAlertService: Symbol("IHealthAlertService"),
  IHealthCheckService: Symbol("IHealthCheckService"),
  IAlertManagementService: Symbol("IAlertManagementService"),

  // Cut history / inventory services (admin-client bound)
  ICutFavoritesService: Symbol("ICutFavoritesService"),
  IRollInventoryService: Symbol("IRollInventoryService"),

  // Use cases
  ICreatePurchaseOrderUseCase: Symbol("ICreatePurchaseOrderUseCase"),
  IUpdatePurchaseOrderUseCase: Symbol("IUpdatePurchaseOrderUseCase"),
  IApprovePurchaseOrderUseCase: Symbol("IApprovePurchaseOrderUseCase"),
  IRejectPurchaseOrderUseCase: Symbol("IRejectPurchaseOrderUseCase"),
  IReceivePurchaseOrderUseCase: Symbol("IReceivePurchaseOrderUseCase"),
  IGenerateReorderSuggestionsUseCase: Symbol("IGenerateReorderSuggestionsUseCase"),
  ICreateReorderPurchaseOrderUseCase: Symbol("ICreateReorderPurchaseOrderUseCase"),
  IRecordCutUseCase: Symbol("IRecordCutUseCase"),
} as const
