import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { ICutHistoryRepository } from "@/src/application/repositories/cut-history.repository.interface"
import type { ICutHistoryService } from "@/src/application/services/cut-history.service.interface"
import { CutHistory, type CreateCutHistoryProps } from "@/src/entities/cut-history"
import {
  CutHistoryId,
  MaterialTypeId,
  ProfileId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { CutHistoryService } from "@/src/infrastructure/services/cutHistoryService"
import { TOKENS } from "@/di/tokens"

const CUT_HISTORY_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const ROLL_UUID = "33333333-3333-4333-8333-333333333333"
const MATERIAL_TYPE_UUID = "55555555-5555-4555-8555-555555555555"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"

function makeCreateProps(overrides: Partial<CreateCutHistoryProps> = {}): CreateCutHistoryProps {
  return {
    id: CutHistoryId.fromPersistence(CUT_HISTORY_UUID),
    tenantId: TenantId.fromPersistence(TENANT_UUID),
    materialTypeId: MaterialTypeId.fromPersistence(MATERIAL_TYPE_UUID),
    rollId: RollId.fromPersistence(ROLL_UUID),
    cutLengthMm: 1000,
    cutWidthMm: 500,
    cutAmount: 2,
    partsCompleted: 1,
    selections: [
      { selectionIndex: 0, sizeValue: 12, sizeText: '12"', label: "Front" },
      { selectionIndex: 1, sizeValue: 24, sizeText: '24"', label: "Back" },
    ],
    ...overrides,
  }
}

function makeCutHistory(overrides: Partial<CreateCutHistoryProps> = {}): CutHistory {
  return CutHistory.create(makeCreateProps(overrides), new Date("2026-05-14T09:00:00.000Z"))
}

function makeFakeRepo(): ICutHistoryRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findRecent: vi.fn(),
    findByUser: vi.fn(),
    findByRoll: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
}

describe("CutHistoryService", () => {
  let repo: ICutHistoryRepository
  let service: ICutHistoryService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<ICutHistoryRepository>(TOKENS.ICutHistoryRepository, repo)
    service = container.resolve(CutHistoryService)
  })

  describe("reads", () => {
    it("getById delegates to repo.findById with the same id", async () => {
      const entity = makeCutHistory()
      vi.mocked(repo.findById).mockResolvedValue(entity)
      expect(await service.getById(CUT_HISTORY_UUID)).toBe(entity)
      expect(repo.findById).toHaveBeenCalledWith(CUT_HISTORY_UUID)
    })

    it("getAll delegates to repo.findAll", async () => {
      const rows = [makeCutHistory()]
      vi.mocked(repo.findAll).mockResolvedValue(rows)
      expect(await service.getAll()).toBe(rows)
      expect(repo.findAll).toHaveBeenCalledOnce()
    })

    it("getRecent forwards the limit", async () => {
      vi.mocked(repo.findRecent).mockResolvedValue([])
      await service.getRecent(10)
      expect(repo.findRecent).toHaveBeenCalledWith(10)
    })

    it("getByUser delegates to repo.findByUser", async () => {
      vi.mocked(repo.findByUser).mockResolvedValue([])
      await service.getByUser(ACTOR_UUID)
      expect(repo.findByUser).toHaveBeenCalledWith(ACTOR_UUID)
    })

    it("getByRoll delegates to repo.findByRoll", async () => {
      vi.mocked(repo.findByRoll).mockResolvedValue([])
      await service.getByRoll(ROLL_UUID)
      expect(repo.findByRoll).toHaveBeenCalledWith(ROLL_UUID)
    })
  })

  describe("create", () => {
    it("invokes CutHistory.create and persists via repo.insert", async () => {
      vi.mocked(repo.insert).mockImplementation((e) => Promise.resolve(e))

      const result = await service.create(makeCreateProps())

      expect(repo.insert).toHaveBeenCalledOnce()
      expect(result.id.value).toBe(CUT_HISTORY_UUID)
      expect(result.selections).toHaveLength(2)
      expect(result.selections[0]?.label).toBe("Front")
    })

    it("propagates entity invariant violations (partsCompleted > cutAmount)", async () => {
      await expect(
        service.create(makeCreateProps({ cutAmount: 1, partsCompleted: 5 }))
      ).rejects.toThrow(/partsCompleted/)
      expect(repo.insert).not.toHaveBeenCalled()
    })

    it("propagates entity invariant violations (duplicate selectionIndex)", async () => {
      await expect(
        service.create(
          makeCreateProps({
            selections: [
              { selectionIndex: 0, label: "A" },
              { selectionIndex: 0, label: "B" },
            ],
          })
        )
      ).rejects.toThrow(/duplicate selectionIndex/)
      expect(repo.insert).not.toHaveBeenCalled()
    })
  })

  describe("softDelete", () => {
    it("loads, marks deleted, and persists", async () => {
      const entity = makeCutHistory()
      vi.mocked(repo.findById).mockResolvedValue(entity)
      vi.mocked(repo.update).mockImplementation((e) => Promise.resolve(e))

      const result = await service.softDelete(CUT_HISTORY_UUID, actor)

      expect(repo.findById).toHaveBeenCalledWith(CUT_HISTORY_UUID)
      expect(repo.update).toHaveBeenCalledWith(entity)
      expect(result.isDeleted).toBe(true)
      expect(result.deletedAt).not.toBeNull()
      expect(result.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("is idempotent — a second softDelete is a no-op on the entity", async () => {
      const entity = makeCutHistory()
      entity.softDelete(actor, new Date("2026-05-14T09:00:00.000Z"))
      const originalDeletedAt = entity.deletedAt
      vi.mocked(repo.findById).mockResolvedValue(entity)
      vi.mocked(repo.update).mockImplementation((e) => Promise.resolve(e))

      await service.softDelete(CUT_HISTORY_UUID, actor)

      expect(entity.deletedAt).toBe(originalDeletedAt)
    })
  })
})
