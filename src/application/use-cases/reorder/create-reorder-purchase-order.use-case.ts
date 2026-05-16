import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type {
  PurchaseOrderWithDetails,
  ReorderRuleWithDetails,
} from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"
import type { ReorderSuggestionOutput } from "./generate-reorder-suggestions.use-case"
import type {
  ICreatePurchaseOrderUseCase,
  CreatePurchaseOrderInput,
} from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"

export interface CreateReorderPurchaseOrderInput {
  suggestion: ReorderSuggestionOutput
  reorderRules: ReorderRuleWithDetails[]
  actor: ActionActor
}

export interface CreateReorderPurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
}

export interface ICreateReorderPurchaseOrderUseCase {
  execute(input: CreateReorderPurchaseOrderInput): Promise<CreateReorderPurchaseOrderResult>
}

const DELIVERY_WINDOW_DAYS = 7
const DEFAULT_ROLL_WIDTH_INCHES = 60
const DEFAULT_ROLL_THICKNESS_INCHES = 0.125

@injectable()
export class CreateReorderPurchaseOrderUseCase implements ICreateReorderPurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.ICreatePurchaseOrderUseCase)
    private readonly createPoUseCase: ICreatePurchaseOrderUseCase,
    @inject(TOKENS.IReorderService) private readonly reorderService: IReorderService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService
  ) {}

  async execute(input: CreateReorderPurchaseOrderInput): Promise<CreateReorderPurchaseOrderResult> {
    const { suggestion, reorderRules, actor } = input

    if (!suggestion.supplierId) {
      throw new Error("No supplier configured for this material")
    }

    const deliveryDate = new Date(
      Date.now() + DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    // Delegate to the canonical PO create use-case — entity construction,
    // currency, PO numbering, tax calculation, item conversion all live
    // there. Atomic creation (header + items in one insert) eliminates
    // the orphan-PO and partial-item-failure modes the legacy two-call
    // pattern had.
    const createInput: CreatePurchaseOrderInput = {
      supplierId: suggestion.supplierId,
      requestedDeliveryDate: deliveryDate,
      notes: `Reorder for ${suggestion.materialName} - ${suggestion.urgencyLevel} priority`,
      shippingCost: 0,
      items: [
        {
          materialTypeId: suggestion.materialTypeId,
          description: suggestion.materialName,
          quantitySqft: suggestion.suggestedQuantity,
          unitCost: suggestion.estimatedCost / suggestion.suggestedQuantity,
          width: DEFAULT_ROLL_WIDTH_INCHES,
          thickness: DEFAULT_ROLL_THICKNESS_INCHES,
        },
      ],
      actor,
    }

    const { purchaseOrder: po } = await this.createPoUseCase.execute(createInput)

    const rule = reorderRules.find((r) => r.material_type_id === suggestion.materialTypeId)
    if (rule) {
      await this.reorderService.recordTrigger(rule.id)
    }

    try {
      await this.notificationService.sendReorderTriggered({
        actorId: actor.id,
        userIdentifier: actor.id,
        materialName: suggestion.materialName,
        reorderQuantity: suggestion.suggestedQuantity,
        supplier: suggestion.supplierName ?? "Unknown supplier",
        poNumber: po.po_number,
      })
    } catch (error) {
      console.error("Failed to send reorder notification:", error)
    }

    return { purchaseOrder: po }
  }
}
