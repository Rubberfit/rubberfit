import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"

export const TOKENS = {
  // Services
  IAuthService: Symbol("IAuthService"),
  ICsvService: Symbol("ICsvService"),
  ICutHistoryService: Symbol("ICutHistoryService"),
  ICutService: Symbol("ICutService"),
  IEmailService: Symbol("IEmailService"),
  IExportPdfService: Symbol("IExportPdfService"),
  IExportService: Symbol("IExportService"),
  IInvitationService: Symbol("IInvitationService"),
  IMaterialTypeService: Symbol("IMaterialTypeService"),
  INotificationService: Symbol("INotificationService"),
  // Re-exported from PACKING_TOKENS (src/application/services/packing.service.interface.ts).
  // Both surfaces must resolve to the same Symbol — do not replace with Symbol("IPackingService")
  // or PACKING_TOKENS consumers break.
  IPackingService: PACKING_TOKENS.IPackingService,
  IMaterialSupplierService: Symbol("IMaterialSupplierService"),
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

  // Repositories
  ICutHistoryRepository: Symbol("ICutHistoryRepository"),
  ICutsRepository: Symbol("ICutsRepository"),
  IInvitationsRepository: Symbol("IInvitationsRepository"),
  IMaterialSuppliersRepository: Symbol("IMaterialSuppliersRepository"),
  IMaterialTypesRepository: Symbol("IMaterialTypesRepository"),
  IPriceHistoryRepository: Symbol("IPriceHistoryRepository"),
  IPurchaseOrdersRepository: Symbol("IPurchaseOrdersRepository"),
  IReorderRulesRepository: Symbol("IReorderRulesRepository"),
  IRollsRepository: Symbol("IRollsRepository"),
  ISuppliersRepository: Symbol("ISuppliersRepository"),

  // Legacy service shims (transitional, deprecated)
  ILegacyPurchaseOrderService: Symbol("ILegacyPurchaseOrderService"),

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
  IReconcilePendingApplyUseCase: Symbol("IReconcilePendingApplyUseCase"),
  IReconcilePendingRollCreationUseCase: Symbol("IReconcilePendingRollCreationUseCase"),
  IGenerateReorderSuggestionsUseCase: Symbol("IGenerateReorderSuggestionsUseCase"),
  ICreateReorderPurchaseOrderUseCase: Symbol("ICreateReorderPurchaseOrderUseCase"),
  ICreateBulkReorderPurchaseOrderUseCase: Symbol("ICreateBulkReorderPurchaseOrderUseCase"),
  IRecordCutUseCase: Symbol("IRecordCutUseCase"),
  IUpdateMaterialPricingUseCase: Symbol("IUpdateMaterialPricingUseCase"),
  ICreateInvitationUseCase: Symbol("ICreateInvitationUseCase"),
  IResendInvitationUseCase: Symbol("IResendInvitationUseCase"),
  IRevokeInvitationUseCase: Symbol("IRevokeInvitationUseCase"),
  IAcceptInvitationUseCase: Symbol("IAcceptInvitationUseCase"),
} as const
