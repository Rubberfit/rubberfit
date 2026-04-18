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

  // Use cases
  ICreatePurchaseOrderUseCase: Symbol("ICreatePurchaseOrderUseCase"),
  IUpdatePurchaseOrderUseCase: Symbol("IUpdatePurchaseOrderUseCase"),
  IApprovePurchaseOrderUseCase: Symbol("IApprovePurchaseOrderUseCase"),
  IRejectPurchaseOrderUseCase: Symbol("IRejectPurchaseOrderUseCase"),
  IReceivePurchaseOrderUseCase: Symbol("IReceivePurchaseOrderUseCase"),
  IGenerateReorderSuggestionsUseCase: Symbol("IGenerateReorderSuggestionsUseCase"),
  ICreateReorderPurchaseOrderUseCase: Symbol("ICreateReorderPurchaseOrderUseCase"),
} as const
