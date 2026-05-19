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
  IStripeClientService: Symbol("IStripeClientService"),
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
  // (legacy PO + reorder shims retired 2026-05-15)

  // Admin portal services
  IUserManagementService: Symbol("IUserManagementService"),
  IHealthAlertService: Symbol("IHealthAlertService"),
  IHealthCheckService: Symbol("IHealthCheckService"),
  IAlertManagementService: Symbol("IAlertManagementService"),

  // Cut history / inventory services (admin-client bound)
  ICutFavoritesService: Symbol("ICutFavoritesService"),
  IRollInventoryService: Symbol("IRollInventoryService"),

  // Billing / organizations (Stripe rollout)
  IOrganizationService: Symbol("IOrganizationService"),
  IOrganizationPreferencesService: Symbol("IOrganizationPreferencesService"),
  IUserPreferencesService: Symbol("IUserPreferencesService"),
  IStripeWebhookService: Symbol("IStripeWebhookService"),

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

  // Cut-history (DDD slice that retired legacyCutHistoryService)
  IListCutHistoryUseCase: Symbol("IListCutHistoryUseCase"),
  IGetCutByIdUseCase: Symbol("IGetCutByIdUseCase"),
  IDeleteCutUseCase: Symbol("IDeleteCutUseCase"),
  IGetCutAnalyticsUseCase: Symbol("IGetCutAnalyticsUseCase"),

  IUpdateMaterialPricingUseCase: Symbol("IUpdateMaterialPricingUseCase"),

  // Invitations (DDD 8-phase slice — wins over dev's PR6 implementation).
  // Backed by accept_invitation + get_invitation_by_token SECURITY DEFINER
  // RPCs; SQLSTATEs P0001–P0006 discriminate the four reason codes.
  IAcceptInvitationUseCase: Symbol("IAcceptInvitationUseCase"),
  ICreateInvitationUseCase: Symbol("ICreateInvitationUseCase"),
  IResendInvitationUseCase: Symbol("IResendInvitationUseCase"),
  IRevokeInvitationUseCase: Symbol("IRevokeInvitationUseCase"),

  // Stripe / billing / onboarding (from dev)
  ICreateOrganizationFromOnboardingUseCase: Symbol("ICreateOrganizationFromOnboardingUseCase"),
  ICreateCheckoutSessionUseCase: Symbol("ICreateCheckoutSessionUseCase"),
  ICreateBillingPortalSessionUseCase: Symbol("ICreateBillingPortalSessionUseCase"),

  // Seat management (from dev — dev's invite use-cases overlap DDD's; only the
  // non-overlapping pieces survive, gated by DDD's accept/create/revoke/resend).
  IDeactivateMemberUseCase: Symbol("IDeactivateMemberUseCase"),
  IUpdateSubscriptionSeatCountUseCase: Symbol("IUpdateSubscriptionSeatCountUseCase"),
} as const
