import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import {
  PurchaseOrder,
  type CreatePurchaseOrderProps,
  type PurchaseOrderUpdateProps,
} from "@/src/entities/purchase-order"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type { PoStatus } from "@/src/entities/value-objects/po-status"
import type { IPurchaseOrdersRepository } from "@/src/application/repositories/purchase-orders.repository.interface"
import type {
  IPurchaseOrderService,
  ReceiptDelta,
} from "@/src/application/services/purchase-order.service.interface"
import { TOKENS } from "@/di/tokens"

/**
 * Entity-typed orchestrator over `IPurchaseOrdersRepository`. Each
 * mutator follows the load → entity-mutate → repo.update pattern.
 * State-machine discipline (transition guards, money invariant,
 * receipt validation, auto-status-flip) lives in the `PurchaseOrder`
 * aggregate root.
 *
 * Cross-aggregate side effects (roll creation on receipt, notification
 * fan-out, tax recompute) are NOT this service's job — callers (the
 * 5 PO use-cases) own them. The service only persists the aggregate
 * state.
 */
@injectable()
export class PurchaseOrderService implements IPurchaseOrderService {
  constructor(
    @inject(TOKENS.IPurchaseOrdersRepository)
    private readonly repo: IPurchaseOrdersRepository
  ) {}

  // ─── Reads ──────────────────────────────────────────────────────────────

  getById(id: string): Promise<PurchaseOrder> {
    return this.repo.findById(id)
  }

  getActive(): Promise<PurchaseOrder[]> {
    return this.repo.findActive()
  }

  getByStatuses(statuses: PoStatus[]): Promise<PurchaseOrder[]> {
    return this.repo.findByStatuses(statuses)
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  createPO(props: CreatePurchaseOrderProps): Promise<PurchaseOrder> {
    const po = PurchaseOrder.create(props)
    return this.repo.insert(po)
  }

  async updateDetails(
    id: string,
    props: PurchaseOrderUpdateProps,
    actor: ProfileId
  ): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.updateDetails(props, actor)
    return this.repo.update(po)
  }

  async submitForApproval(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.submitForApproval(actor)
    return this.repo.update(po)
  }

  async approve(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.approve(actor)
    return this.repo.update(po)
  }

  async rejectToDraft(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.rejectToDraft(actor)
    return this.repo.update(po)
  }

  async markOrdered(id: string, orderDate: Date, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.markOrdered(orderDate, actor)
    return this.repo.update(po)
  }

  async cancel(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.cancel(actor)
    return this.repo.update(po)
  }

  async recordReceipts(
    id: string,
    receipts: ReceiptDelta[],
    actor: ProfileId
  ): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    const now = new Date()
    for (const receipt of receipts) {
      po.recordReceipt(
        receipt.lineNumber,
        receipt.quantityReceivedSqm,
        receipt.receivedDate ?? now,
        actor,
        now
      )
    }
    return this.repo.update(po)
  }

  async softDelete(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.softDelete(actor)
    return this.repo.update(po)
  }
}
