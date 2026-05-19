import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ITaxService, TaxCalculation } from "@/src/application/services/tax.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { Currency } from "@/src/entities/value-objects/currency"
import { JobId, ProfileId, SupplierId } from "@/src/entities/value-objects/id"
import { purchaseOrderEntityToLegacy } from "@/src/infrastructure/services/po-entity-to-legacy"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"

import { computePoSubtotal } from "@/src/application/computePoSubtotal"
import { dollarsToMoney, mapItemsToEntityProps, type PoLineInput } from "./po-input-conversion"

export interface UpdatePurchaseOrderInput {
  purchaseOrderId: string
  supplierId: string
  requestedDeliveryDate?: string
  paymentTerms?: string
  /**
   * Legacy free-text address fields. New schema FKs to addresses(id);
   * dropped here for the same reason as createPurchaseOrder.
   */
  shippingAddress?: string
  billingAddress?: string
  notes?: string
  shippingCost?: number
  items: PoLineInput[]
  actor: ActionActor
}

export interface UpdatePurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
  taxCalculation: TaxCalculation
}

export interface IUpdatePurchaseOrderUseCase {
  execute(input: UpdatePurchaseOrderInput): Promise<UpdatePurchaseOrderResult>
}

/**
 * Edits an existing purchase order header AND its item collection in
 * a single round-trip via `IPurchaseOrderService.updateDetailsAndItems`.
 * The entity restricts edits to `draft` / `pending_approval` — POs in
 * later states throw, mirroring how the form gates the Edit action
 * anyway.
 *
 * `poNumber` and `tenantId` come from the existing aggregate (we don't
 * re-generate the PO number or change tenancy on update). Currency
 * pinned to USD — same TODO as create.
 */
@injectable()
export class UpdatePurchaseOrderUseCase implements IUpdatePurchaseOrderUseCase {
  // Currency on the existing PO is what we'll use; only kept here for
  // tax + shipping Money construction when persisting the new state.
  private static readonly DEFAULT_CURRENCY = Currency.fromPersistence("USD")

  constructor(
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService
  ) {}

  async execute(input: UpdatePurchaseOrderInput): Promise<UpdatePurchaseOrderResult> {
    const subtotal = computePoSubtotal(input.items)
    const taxCalc = await this.taxService.calculatePurchaseOrderTax(input.supplierId, subtotal)
    const shippingDollars = input.shippingCost ?? 50

    // Load existing for poNumber + currency. Currency is "the
    // aggregate's currency" — every item, tax, shipping must agree
    // with it. Today the entity always carries USD (no other path
    // produces it), but reading from the entity keeps this honest
    // when the supplier-driven resolver lands.
    const existing = await this.poService.getById(input.purchaseOrderId)
    const currency = existing.currency
    const actorId = ProfileId.fromPersistence(input.actor.id)

    const updated = await this.poService.updateDetailsAndItems(
      input.purchaseOrderId,
      {
        supplierId: SupplierId.fromPersistence(input.supplierId),
        shippingAddress: null,
        billingAddress: null,
        jobId: existing.jobId ? JobId.fromPersistence(existing.jobId.value) : null,
        poNumber: existing.poNumber,
        requestedDeliveryDate: input.requestedDeliveryDate
          ? new Date(input.requestedDeliveryDate)
          : null,
        taxAmount: dollarsToMoney(taxCalc.taxAmount, currency),
        shippingCost: dollarsToMoney(shippingDollars, currency),
        paymentTerms: input.paymentTerms ?? null,
        notes: input.notes ?? null,
      },
      mapItemsToEntityProps(input.items, currency),
      actorId
    )

    return {
      purchaseOrder: purchaseOrderEntityToLegacy(updated),
      taxCalculation: taxCalc,
    }
  }
}
