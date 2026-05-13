/**
 * New entity-typed `PurchaseOrderService` orchestrator tests. The wide
 * pre-DDD test file `tests/services/purchaseOrderService.test.ts` still
 * covers the legacy raw-row implementation; this file targets the new
 * thin service that wraps `IPurchaseOrdersRepository`.
 */
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import { PurchaseOrder } from "@/src/entities/purchase-order"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialTypeId,
  ProfileId,
  PurchaseOrderId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import type { IPurchaseOrdersRepository } from "@/src/application/repositories/purchase-orders.repository.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import { PurchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { TOKENS } from "@/di/tokens"

const PO_UUID = "10000000-1000-4000-8000-bbbbbbbbbbb1"
const TENANT_UUID = "20000000-2000-4000-8000-bbbbbbbbbbb2"
const SUPPLIER_UUID = "30000000-3000-4000-8000-bbbbbbbbbbb3"
const MT_UUID = "40000000-4000-4000-8000-bbbbbbbbbbb4"
const ACTOR_UUID = "60000000-6000-4000-8000-bbbbbbbbbbb6"

const USD = Currency.fromPersistence("USD")

function makePO(
  options: { status?: "draft" | "pending_approval" | "approved" | "ordered" } = {}
): PurchaseOrder {
  return PurchaseOrder.create(
    {
      id: PurchaseOrderId.fromPersistence(PO_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      currency: USD,
      poNumber: "PO-2026-0099",
      status: options.status ?? "draft",
      requestedDeliveryDate: new Date("2026-07-01T00:00:00.000Z"),
      taxAmount: Money.fromCents(800, USD),
      shippingCost: Money.fromCents(500, USD),
      items: [
        {
          lineNumber: 1,
          materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
          quantitySqm: 25,
          unitCost: Money.fromCents(200, USD),
        },
      ],
      createdBy: ProfileId.fromPersistence(ACTOR_UUID),
    },
    new Date("2026-04-01T00:00:00.000Z")
  )
}

function makeFakeRepo(): IPurchaseOrdersRepository {
  return {
    findById: vi.fn(),
    findActive: vi.fn(),
    findByStatuses: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    itemIdToLineNumberMap: vi.fn(),
  }
}

describe("PurchaseOrderService (entity-typed)", () => {
  let repo: IPurchaseOrdersRepository
  let service: IPurchaseOrderService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<IPurchaseOrdersRepository>(TOKENS.IPurchaseOrdersRepository, repo)
    service = container.resolve(PurchaseOrderService)
  })

  describe("reads", () => {
    it("getById delegates to repo.findById", async () => {
      const po = makePO()
      vi.mocked(repo.findById).mockResolvedValue(po)
      await expect(service.getById(PO_UUID)).resolves.toBe(po)
    })

    it("getByStatuses delegates with the status list", async () => {
      vi.mocked(repo.findByStatuses).mockResolvedValue([])
      await service.getByStatuses(["draft", "pending_approval"])
      expect(repo.findByStatuses).toHaveBeenCalledWith(["draft", "pending_approval"])
    })
  })

  describe("createPO", () => {
    it("constructs via PurchaseOrder.create and persists", async () => {
      const persisted = makePO()
      vi.mocked(repo.insert).mockResolvedValue(persisted)

      const result = await service.createPO({
        id: PurchaseOrderId.fromPersistence(PO_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
        currency: USD,
        poNumber: "PO-2026-0099",
        items: [
          {
            lineNumber: 1,
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
            quantitySqm: 10,
            unitCost: Money.fromCents(100, USD),
          },
        ],
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      })

      expect(result).toBe(persisted)
      const inserted = vi.mocked(repo.insert).mock.calls[0]![0]
      expect(inserted).toBeInstanceOf(PurchaseOrder)
      expect(inserted.poNumber).toBe("PO-2026-0099")
      expect(inserted.items.length).toBe(1)
    })
  })

  describe("status transitions", () => {
    it("submitForApproval → pending_approval", async () => {
      const po = makePO({ status: "draft" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.submitForApproval(PO_UUID, actor)
      expect(updated.status).toBe("pending_approval")
    })

    it("approve stamps approver + flips to approved", async () => {
      const po = makePO({ status: "pending_approval" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.approve(PO_UUID, actor)
      expect(updated.status).toBe("approved")
      expect(updated.approvedBy?.value).toBe(ACTOR_UUID)
      expect(updated.approvedAt).not.toBeNull()
    })

    it("rejectToDraft reverses approval back to draft and clears approver", async () => {
      const po = makePO({ status: "pending_approval" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.rejectToDraft(PO_UUID, actor)
      expect(updated.status).toBe("draft")
      expect(updated.approvedBy).toBeNull()
    })

    it("markOrdered stamps order_date and flips status", async () => {
      const po = makePO({ status: "approved" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const orderDate = new Date("2026-04-20T00:00:00.000Z")
      const updated = await service.markOrdered(PO_UUID, orderDate, actor)
      expect(updated.status).toBe("ordered")
      expect(updated.orderDate?.toISOString()).toBe("2026-04-20T00:00:00.000Z")
    })

    it("cancel flips status to cancelled (allowed from draft)", async () => {
      const po = makePO({ status: "draft" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.cancel(PO_UUID, actor)
      expect(updated.status).toBe("cancelled")
    })

    it("propagates entity transition errors and does NOT persist", async () => {
      const po = makePO({ status: "draft" })
      vi.mocked(repo.findById).mockResolvedValue(po)

      await expect(service.approve(PO_UUID, actor)).rejects.toThrow()
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe("recordReceipts", () => {
    it("applies each per-line delta and persists once", async () => {
      const po = makePO({ status: "ordered" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.recordReceipts(
        PO_UUID,
        [
          {
            lineNumber: 1,
            quantityReceivedSqm: 25,
            receivedDate: new Date("2026-05-01T00:00:00.000Z"),
          },
        ],
        actor
      )

      // 25 of 25 = fully received
      expect(updated.status).toBe("received")
      expect(repo.update).toHaveBeenCalledOnce()
    })

    it("partial receipt flips to partial_received", async () => {
      const po = makePO({ status: "ordered" })
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.recordReceipts(
        PO_UUID,
        [{ lineNumber: 1, quantityReceivedSqm: 10 }],
        actor
      )

      expect(updated.status).toBe("partial_received")
    })
  })

  describe("softDelete", () => {
    it("soft-deletes and persists", async () => {
      const po = makePO()
      vi.mocked(repo.findById).mockResolvedValue(po)
      vi.mocked(repo.update).mockImplementation(async (p) => p)

      const updated = await service.softDelete(PO_UUID, actor)
      expect(updated.isDeleted).toBe(true)
    })
  })
})
