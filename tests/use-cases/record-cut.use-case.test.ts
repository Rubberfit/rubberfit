/**
 * Canonical DI-fakes pattern for use-case unit tests, established in
 * #155.
 *
 * The pattern: each test registers fakes for the use-case's
 * dependencies via `container.registerInstance(TOKENS.IFoo, fake)`,
 * then resolves the use-case with `container.resolve(...)`. No real
 * Supabase touched, no `vi.mock` of module-level singletons. Future
 * use-case tests should copy the structure from this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "reflect-metadata"
import { container } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import {
  RecordCutUseCase,
  validateRecordCutInput,
  type IRecordCutUseCase,
  type RecordCutInput,
} from "@/src/application/use-cases/cuts/record-cut.use-case"
import type {
  IRollInventoryService,
  ParentRollMetadata,
} from "@/src/application/services/roll-inventory.service.interface"

import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

// Mock the orchestration helpers that aren't behind a service
// interface — `insertCutHistory` and `maybeAutoCompleteJob`. Module
// mocks are the right tool here because these are exported functions,
// not services injected via DI.
const insertCutHistory = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/cutHistoryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/infrastructure/services/cutHistoryService")
  >("@/src/infrastructure/services/cutHistoryService")
  return { ...actual, insertCutHistory }
})

const maybeAutoCompleteJob = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/repositories/jobs.repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/infrastructure/repositories/jobs.repository")
  >("@/src/infrastructure/repositories/jobs.repository")
  return { ...actual, maybeAutoCompleteJob }
})

const PARENT_ROLL: ParentRollMetadata = {
  remaining_length: 240,
  width: 60,
  thickness: 0.5,
  material_type: "Butyl",
  material_type_id: "mat-1",
  color: "black",
  supplier: "Acme",
  cost_per_sqft: 1.25,
  location: "Bay A",
}

const VALID_INPUT: RecordCutInput = {
  material_id: 1,
  part_id: 1,
  cut_length: 24,
  cut_width: 36,
  cut_thickness: 0.5,
  cut_amount: 1,
  parts_completed: 1,
  cut_pieces: 1,
  material_used_sqft: 6,
  reusable_offset_sqft: 0,
  scrap_sqft: 0,
  fab_score: 80,
}

function makeFakeRollInventory(
  overrides: Partial<IRollInventoryService> = {}
): IRollInventoryService {
  return {
    getParentRoll: vi.fn(async () => PARENT_ROLL),
    decrementRollLength: vi.fn(async () => undefined),
    spawnOffcuts: vi.fn(async () => undefined),
    ...overrides,
  }
}

function resolveUseCase(): IRecordCutUseCase {
  return container.resolve(TOKENS.IRecordCutUseCase) as IRecordCutUseCase
}

describe("validateRecordCutInput", () => {
  it("accepts a well-formed body", () => {
    expect(validateRecordCutInput(VALID_INPUT)).toBeNull()
  })

  it("rejects negative dimensions", () => {
    const bad = { ...VALID_INPUT, cut_length: -1 }
    expect(validateRecordCutInput(bad)).toEqual({
      field: "cut_length",
      message: expect.stringContaining("cut_length"),
    })
  })

  it("rejects non-integer cut_amount", () => {
    const bad = { ...VALID_INPUT, cut_amount: 2.5 }
    expect(validateRecordCutInput(bad)).toEqual({
      field: "cut_amount",
      message: expect.stringContaining("cut_amount"),
    })
  })

  it("rejects zero parts_completed (must be >= 1)", () => {
    const bad = { ...VALID_INPUT, parts_completed: 0 }
    expect(validateRecordCutInput(bad)).toEqual({
      field: "parts_completed",
      message: expect.stringContaining("parts_completed"),
    })
  })

  it("rejects negative material_id", () => {
    const bad = { ...VALID_INPUT, material_id: -1 }
    expect(validateRecordCutInput(bad)).toEqual({
      field: "material_id",
      message: expect.stringContaining("material_id"),
    })
  })

  it("accepts material_id of 0 (sentinel)", () => {
    expect(validateRecordCutInput({ ...VALID_INPUT, material_id: 0 })).toBeNull()
  })
})

describe("RecordCutUseCase.execute (DI fakes pattern)", () => {
  const childContainer = container.createChildContainer()
  childContainer.register(TOKENS.IRecordCutUseCase, RecordCutUseCase)

  const client = makeFakeClient()
  const userId = "user-1"

  let rollInventory: IRollInventoryService
  let useCase: IRecordCutUseCase

  beforeEach(() => {
    insertCutHistory.mockReset()
    maybeAutoCompleteJob.mockReset()
    rollInventory = makeFakeRollInventory()
    childContainer.clearInstances()
    childContainer.registerInstance<IRollInventoryService>(
      TOKENS.IRollInventoryService,
      rollInventory
    )
    childContainer.register(TOKENS.IRecordCutUseCase, RecordCutUseCase)
    useCase = childContainer.resolve(TOKENS.IRecordCutUseCase) as IRecordCutUseCase
    insertCutHistory.mockResolvedValue({ id: "cut-1" })
    maybeAutoCompleteJob.mockResolvedValue(undefined)
  })

  afterEach(() => {
    childContainer.clearInstances()
  })

  it("returns 400 when validation fails", async () => {
    const result = await useCase.execute(client, { ...VALID_INPUT, cut_length: -1 }, userId)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(insertCutHistory).not.toHaveBeenCalled()
  })

  it("happy path with no roll/job: only inserts cut_history", async () => {
    const result = await useCase.execute(client, VALID_INPUT, userId)
    expect(result.ok).toBe(true)
    expect(insertCutHistory).toHaveBeenCalledOnce()
    expect(rollInventory.getParentRoll).not.toHaveBeenCalled()
    expect(rollInventory.decrementRollLength).not.toHaveBeenCalled()
    expect(rollInventory.spawnOffcuts).not.toHaveBeenCalled()
    expect(maybeAutoCompleteJob).not.toHaveBeenCalled()
  })

  it("with roll_id: decrements roll length and skips offcuts when reusable area is zero", async () => {
    const input = {
      ...VALID_INPUT,
      roll_id: "11111111-1111-1111-1111-111111111111",
    }
    await useCase.execute(client, input, userId)
    expect(rollInventory.decrementRollLength).toHaveBeenCalledWith(
      client,
      "11111111-1111-1111-1111-111111111111",
      24
    )
    expect(rollInventory.spawnOffcuts).not.toHaveBeenCalled()
  })

  it("with reusable_offset_sqft >= 0.1: spawns offcuts using the parent roll's width", async () => {
    const input = {
      ...VALID_INPUT,
      roll_id: "11111111-1111-1111-1111-111111111111",
      reusable_offset_sqft: 5,
    }
    await useCase.execute(client, input, userId)
    expect(rollInventory.spawnOffcuts).toHaveBeenCalledOnce()
    const call = (rollInventory.spawnOffcuts as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].pieces).toHaveLength(1)
    expect(call[1].pieces[0].width_in).toBe(PARENT_ROLL.width)
  })

  it("with explicit offcut_pieces: spawns one row per piece, ignoring tiny scraps", async () => {
    const input = {
      ...VALID_INPUT,
      roll_id: "11111111-1111-1111-1111-111111111111",
      reusable_offset_sqft: 10,
      offcut_pieces: [
        { width_in: 24, length_in: 12 },
        { width_in: 0.5, length_in: 0.5 }, // tiny — filtered out
        { width_in: 18, length_in: 18 },
      ],
    }
    await useCase.execute(client, input, userId)
    const call = (rollInventory.spawnOffcuts as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].pieces).toHaveLength(2)
    expect(call[1].pieces.map((p: { width_in: number }) => p.width_in)).toEqual([24, 18])
  })

  it("with job_id: runs maybeAutoCompleteJob after the insert", async () => {
    const input = {
      ...VALID_INPUT,
      job_id: "22222222-2222-2222-2222-222222222222",
    }
    await useCase.execute(client, input, userId)
    expect(maybeAutoCompleteJob).toHaveBeenCalledWith(
      client,
      "22222222-2222-2222-2222-222222222222"
    )
  })

  it("malformed job_id is dropped silently (no auto-complete attempted)", async () => {
    const input = { ...VALID_INPUT, job_id: "not-a-uuid" }
    await useCase.execute(client, input, userId)
    expect(maybeAutoCompleteJob).not.toHaveBeenCalled()
  })

  it("returns 500 on cut_history insert failure", async () => {
    insertCutHistory.mockRejectedValueOnce(
      Object.assign(new Error("FK violation"), { code: "23503" })
    )
    const result = await useCase.execute(client, VALID_INPUT, userId)
    expect(result).toMatchObject({
      ok: false,
      status: 500,
      error: "Failed to record cut",
      code: "23503",
    })
  })
})

// Suppress unused-variable warning for the imported SupabaseClient type
// (kept for documentation of the use-case's contract).
type _AssertClientType = SupabaseClient
