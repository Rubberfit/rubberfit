import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import type { ICutsRepository } from "@/src/application/repositories/cuts.repository.interface"
import type { ICutService } from "@/src/application/services/cut.service.interface"
import { Cut } from "@/src/entities/cut"
import { CutId, ProfileId, RollId, TenantId } from "@/src/entities/value-objects/id"
import { CutService } from "@/src/infrastructure/services/cutService"
import { TOKENS } from "@/di/tokens"

const CUT_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const ROLL_UUID = "33333333-3333-4333-8333-333333333333"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"

function makeCut(
  overrides: { quantity?: number; jobReference?: string | null; notes?: string | null } = {}
): Cut {
  return Cut.create(
    {
      id: CutId.fromPersistence(CUT_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      rollId: RollId.fromPersistence(ROLL_UUID),
      cutWidthMm: 1000,
      cutLengthMm: 2000,
      quantity: overrides.quantity ?? 1,
      jobReference: overrides.jobReference ?? null,
      notes: overrides.notes ?? null,
    },
    new Date("2026-05-14T09:00:00.000Z")
  )
}

function makeFakeRepo(): ICutsRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findByRoll: vi.fn(),
    findRecent: vi.fn(),
    findByDateRange: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
}

describe("CutService", () => {
  let repo: ICutsRepository
  let service: ICutService
  const actor = ProfileId.fromPersistence(ACTOR_UUID)

  beforeEach(() => {
    container.clearInstances()
    repo = makeFakeRepo()
    container.registerInstance<ICutsRepository>(TOKENS.ICutsRepository, repo)
    service = container.resolve(CutService)
  })

  describe("reads", () => {
    it("getById delegates to repo.findById with the same id", async () => {
      const cut = makeCut()
      vi.mocked(repo.findById).mockResolvedValue(cut)
      expect(await service.getById(CUT_UUID)).toBe(cut)
      expect(repo.findById).toHaveBeenCalledWith(CUT_UUID)
    })

    it("getAll delegates to repo.findAll", async () => {
      const rows = [makeCut()]
      vi.mocked(repo.findAll).mockResolvedValue(rows)
      expect(await service.getAll()).toBe(rows)
      expect(repo.findAll).toHaveBeenCalledOnce()
    })

    it("getByRoll delegates to repo.findByRoll", async () => {
      vi.mocked(repo.findByRoll).mockResolvedValue([])
      expect(await service.getByRoll(ROLL_UUID)).toEqual([])
      expect(repo.findByRoll).toHaveBeenCalledWith(ROLL_UUID)
    })

    it("getRecent forwards the limit", async () => {
      vi.mocked(repo.findRecent).mockResolvedValue([])
      await service.getRecent(5)
      expect(repo.findRecent).toHaveBeenCalledWith(5)
    })

    it("getByDateRange forwards from, to, and opts", async () => {
      const from = new Date("2026-05-01T00:00:00.000Z")
      const to = new Date("2026-05-14T00:00:00.000Z")
      vi.mocked(repo.findByDateRange).mockResolvedValue([])
      await service.getByDateRange(from, to, { ascending: true })
      expect(repo.findByDateRange).toHaveBeenCalledWith(from, to, { ascending: true })
    })

    it("getByDateRange tolerates omitted to / opts", async () => {
      const from = new Date("2026-05-01T00:00:00.000Z")
      vi.mocked(repo.findByDateRange).mockResolvedValue([])
      await service.getByDateRange(from)
      expect(repo.findByDateRange).toHaveBeenCalledWith(from, undefined, undefined)
    })
  })

  describe("updateDetails", () => {
    it("loads, mutates, and persists the cut", async () => {
      const cut = makeCut({ quantity: 1, jobReference: null, notes: null })
      vi.mocked(repo.findById).mockResolvedValue(cut)
      vi.mocked(repo.update).mockImplementation((c) => Promise.resolve(c))

      const result = await service.updateDetails(
        CUT_UUID,
        { quantity: 3, jobReference: "JOB-123", cutBy: actor, notes: "rework" },
        actor
      )

      expect(repo.findById).toHaveBeenCalledWith(CUT_UUID)
      expect(repo.update).toHaveBeenCalledWith(cut)
      expect(result.quantity).toBe(3)
      expect(result.jobReference).toBe("JOB-123")
      expect(result.notes).toBe("rework")
      expect(result.cutBy?.value).toBe(ACTOR_UUID)
      expect(result.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("propagates entity invariant violations (zero quantity)", async () => {
      const cut = makeCut()
      vi.mocked(repo.findById).mockResolvedValue(cut)

      await expect(
        service.updateDetails(
          CUT_UUID,
          { quantity: 0, jobReference: null, cutBy: null, notes: null },
          actor
        )
      ).rejects.toThrow(/quantity/)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe("softDelete", () => {
    it("loads, marks deleted, and persists", async () => {
      const cut = makeCut()
      vi.mocked(repo.findById).mockResolvedValue(cut)
      vi.mocked(repo.update).mockImplementation((c) => Promise.resolve(c))

      const result = await service.softDelete(CUT_UUID, actor)

      expect(repo.findById).toHaveBeenCalledWith(CUT_UUID)
      expect(repo.update).toHaveBeenCalledWith(cut)
      expect(result.isDeleted).toBe(true)
      expect(result.deletedAt).not.toBeNull()
      expect(result.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("is idempotent — a second softDelete is a no-op on the entity", async () => {
      const cut = makeCut()
      cut.softDelete(actor, new Date("2026-05-14T09:00:00.000Z"))
      const originalDeletedAt = cut.deletedAt
      vi.mocked(repo.findById).mockResolvedValue(cut)
      vi.mocked(repo.update).mockImplementation((c) => Promise.resolve(c))

      await service.softDelete(CUT_UUID, actor)

      expect(cut.deletedAt).toBe(originalDeletedAt)
    })
  })
})
