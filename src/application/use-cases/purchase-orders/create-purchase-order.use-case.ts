import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import { requireActiveTenant } from "@/app/server/auth/require-active-tenant"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ITaxService, TaxCalculation } from "@/src/application/services/tax.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  JobId,
  ProfileId,
  PurchaseOrderId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { purchaseOrderEntityToLegacy } from "@/src/infrastructure/services/po-entity-to-legacy"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"

import { computePoSubtotal } from "@/src/application/computePoSubtotal"
import { dollarsToMoney, mapItemsToEntityProps, type PoLineInput } from "./po-input-conversion"

export type CreatePurchaseOrderItemInput = PoLineInput

export interface CreatePurchaseOrderInput {
  supplierId: string
  requestedDeliveryDate?: string
  paymentTerms?: string
  /**
   * Free-text address (legacy form field). The new schema FKs to
   * `addresses(id)` — there's no place for free text. Silently
   * dropped here; the form will switch to an address picker before
   * shipping/billing addresses become useful again.
   */
  shippingAddress?: string
  billingAddress?: string
  notes?: string
  shippingCost?: number
  jobId?: string
  items: CreatePurchaseOrderItemInput[]
  actor: ActionActor
}

export interface CreatePurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
  taxCalculation: TaxCalculation
}

export interface ICreatePurchaseOrderUseCase {
  execute(input: CreatePurchaseOrderInput): Promise<CreatePurchaseOrderResult>
}

/**
 * Creates a new purchase order on the entity-typed service.
 *
 * Conversion responsibilities (legacy form units → entity units):
 *   • `quantitySqft` → `quantitySqm` via 1 sqft = 0.0929030400 sqm
 *   • `width` (inches) → `widthMm` (rounded integer, per entity invariant)
 *   • `thickness` (inches) → `thicknessMm` (float allowed)
 *   • `unitCost` ($/sqft) → per-sqm `Money` cents
 *   • `shippingCost`, `taxAmount` ($ float) → `Money` cents
 *
 * Currency is hardcoded to USD pending a real per-supplier / per-tenant
 * resolution. The supplier-driven path (read supplier.currency, fall
 * back to tenant_settings.default_currency) is its own follow-up — the
 * UI doesn't surface multi-currency POs yet anyway.
 *
 * `tenantId` comes from `actor.activeTenantId` (populated by step 3 of
 * the rollout). `requireActiveTenant` narrows the type and throws
 * Forbidden if it's null — that's the case multi-tenant users hit
 * before the chooser resolves; the form shouldn't be submittable in
 * that state.
 */
@injectable()
export class CreatePurchaseOrderUseCase implements ICreatePurchaseOrderUseCase {
  // TODO: real currency resolution (supplier → tenant_settings).
  private static readonly DEFAULT_CURRENCY = Currency.fromPersistence("USD")

  constructor(
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService
  ) {}

  async execute(input: CreatePurchaseOrderInput): Promise<CreatePurchaseOrderResult> {
    requireActiveTenant(input.actor)

    const subtotal = computePoSubtotal(input.items)
    const taxCalc = await this.taxService.calculatePurchaseOrderTax(input.supplierId, subtotal)
    const shippingDollars = input.shippingCost ?? 50
    const currency = CreatePurchaseOrderUseCase.DEFAULT_CURRENCY

    // Race-safe per-year sequence via `generate_po_number()` SQL function.
    const poNumber = await this.poService.generatePoNumber()

    const po = await this.poService.createPO({
      id: PurchaseOrderId.fromPersistence(crypto.randomUUID()),
      tenantId: TenantId.fromPersistence(input.actor.activeTenantId),
      supplierId: SupplierId.fromPersistence(input.supplierId),
      currency,
      poNumber,
      jobId: input.jobId ? JobId.fromPersistence(input.jobId) : null,
      orderDate: new Date(),
      requestedDeliveryDate: input.requestedDeliveryDate
        ? new Date(input.requestedDeliveryDate)
        : null,
      taxAmount: dollarsToMoney(taxCalc.taxAmount, currency),
      shippingCost: dollarsToMoney(shippingDollars, currency),
      paymentTerms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
      items: mapItemsToEntityProps(input.items, currency),
      createdBy: ProfileId.fromPersistence(input.actor.id),
    })

    return {
      purchaseOrder: purchaseOrderEntityToLegacy(po),
      taxCalculation: taxCalc,
    }
  }
}
