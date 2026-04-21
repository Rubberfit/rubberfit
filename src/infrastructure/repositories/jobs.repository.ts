import {
  supabase,
  type Job,
  type JobPart,
  type JobWithParts,
  type JobStatus,
  type JobAssignee,
  type JobAssigneeRole,
  type JobRollAllocation,
  type JobRollAllocationWithRoll,
  type JobFullDetail,
  type PurchaseOrder,
  type CutHistory,
  type Roll,
} from "@/src/infrastructure/models/supabase"

/** Part the sufficiency check rejected on width grounds. */
export interface InfeasibleJobPart {
  id: string
  description: string | null
  part_number: string | null
  width: number
  quantity: number
}

/**
 * Per-material sufficiency summary used by the job detail page.
 * Grouping key is the normalised material_type string, because
 * `job_parts.material_type_id` is optional — the name is the
 * only reliable cross-reference across parts + rolls.
 *
 * Two independent failure modes surface here:
 *   1. **Width infeasibility** — a part is wider than every roll of
 *      its material. No amount of sqft fixes it; `infeasible_parts`
 *      flags exactly which lines need a new roll class.
 *   2. **Sqft shortfall** — plenty of width, not enough length.
 *      `shortfall_sqft` > 0 when `needed_sqft > available_sqft`
 *      (after subtracting rolls reserved by other jobs).
 */
export interface JobMaterialSufficiency {
  material: string
  /** Total square feet required across ALL parts of this material (feasible or not). */
  needed_sqft: number
  /**
   * Square feet available across active rolls of this material,
   * net of lengths already allocated to other jobs.
   */
  available_sqft: number
  /** `max(0, needed_sqft - available_sqft)`. Zero when inventory covers the job. */
  shortfall_sqft: number
  /**
   * Square feet across this material's rolls that are earmarked
   * by *other* jobs' roll allocations. Informational — already
   * subtracted from `available_sqft`.
   */
  reserved_sqft: number
  /** Max width required by any part of this material. `0` if no parts. */
  max_required_width: number
  /** Max width of any active roll of this material. `0` if no rolls. */
  max_available_width: number
  /** Parts where `width > max_available_width` — no roll can cut them. */
  infeasible_parts: InfeasibleJobPart[]
  /** Individual rolls feeding the availability number — caller can render them. */
  matching_rolls: Pick<
    Roll,
    "id" | "part_number" | "width" | "remaining_length" | "location"
  >[]
}

/** Minimal roll shape the aggregator needs (lets tests pass lightweight fixtures). */
export type SufficiencyRoll = Pick<
  Roll,
  "id" | "part_number" | "material_type" | "width" | "remaining_length" | "location"
>

/** Minimal allocation shape — only the fields used to subtract reserved length. */
export interface SufficiencyAllocation {
  roll_id: string
  allocated_length: number
}

const MATERIAL_KEY_UNSPECIFIED = "unspecified"
const MATERIAL_LABEL_UNSPECIFIED = "Unspecified"

function normaliseMaterialKey(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim().toLowerCase()
  return trimmed || MATERIAL_KEY_UNSPECIFIED
}

function displayMaterial(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim()
  return trimmed || MATERIAL_LABEL_UNSPECIFIED
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Pure aggregation — exported so the unit tests can exercise the
 * width-feasibility and allocation-subtraction logic without
 * touching Supabase. `otherJobAllocations` must already exclude
 * the current job (the repository method handles that filter).
 */
export function aggregateSufficiency(
  parts: JobPart[],
  rolls: SufficiencyRoll[],
  otherJobAllocations: SufficiencyAllocation[]
): JobMaterialSufficiency[] {
  // Sum reserved length per roll so a single roll earmarked across
  // several other jobs is only subtracted once, capped at its
  // remaining length (can't reserve more than exists).
  const reservedByRoll = new Map<string, number>()
  for (const a of otherJobAllocations) {
    reservedByRoll.set(
      a.roll_id,
      (reservedByRoll.get(a.roll_id) ?? 0) + a.allocated_length
    )
  }

  // Bucket parts + rolls by normalised material name. Using the
  // name (not material_type_id) keeps offcuts and ad-hoc part
  // entries from falling through the cracks when the FK is null.
  interface PartsGroup {
    display: string
    parts: JobPart[]
  }
  const partsByMaterial = new Map<string, PartsGroup>()
  for (const p of parts) {
    const key = normaliseMaterialKey(p.material_type)
    const group = partsByMaterial.get(key)
    if (group) {
      group.parts.push(p)
    } else {
      partsByMaterial.set(key, { display: displayMaterial(p.material_type), parts: [p] })
    }
  }

  const rollsByMaterial = new Map<string, SufficiencyRoll[]>()
  for (const r of rolls) {
    const key = normaliseMaterialKey(r.material_type)
    const list = rollsByMaterial.get(key)
    if (list) list.push(r)
    else rollsByMaterial.set(key, [r])
  }

  const results: JobMaterialSufficiency[] = []
  for (const [key, { display, parts: groupParts }] of partsByMaterial) {
    const materialRolls = rollsByMaterial.get(key) ?? []
    const maxAvailableWidth = materialRolls.reduce(
      (max, r) => (r.width > max ? r.width : max),
      0
    )
    const maxRequiredWidth = groupParts.reduce(
      (max, p) => (p.width > max ? p.width : max),
      0
    )

    const infeasibleParts: InfeasibleJobPart[] = []
    for (const p of groupParts) {
      if (p.width > maxAvailableWidth) {
        infeasibleParts.push({
          id: p.id,
          description: p.description,
          part_number: p.part_number,
          width: p.width,
          quantity: p.quantity,
        })
      }
    }

    // Total needed counts every part — the UI shows infeasibility
    // separately, but the sqft figure reflects the whole job.
    const needed = groupParts.reduce(
      (sum, p) => sum + (p.width * p.length * p.quantity) / 144,
      0
    )

    let available = 0
    let reserved = 0
    for (const r of materialRolls) {
      const rawReserved = reservedByRoll.get(r.id) ?? 0
      const effectiveReserved = Math.min(rawReserved, r.remaining_length)
      reserved += (effectiveReserved * r.width) / 144
      const effectiveRemaining = Math.max(0, r.remaining_length - effectiveReserved)
      available += (effectiveRemaining * r.width) / 144
    }

    results.push({
      material: display,
      needed_sqft: round2(needed),
      available_sqft: round2(available),
      shortfall_sqft: round2(Math.max(0, needed - available)),
      reserved_sqft: round2(reserved),
      max_required_width: maxRequiredWidth,
      max_available_width: maxAvailableWidth,
      infeasible_parts: infeasibleParts,
      matching_rolls: materialRolls.map((r) => ({
        id: r.id,
        part_number: r.part_number,
        width: r.width,
        remaining_length: r.remaining_length,
        location: r.location,
      })),
    })
  }

  // Surface infeasibility first (nothing else matters until there's
  // a roll wide enough), then biggest shortfall, then everything
  // else by display name for deterministic output.
  results.sort((a, b) => {
    if (a.infeasible_parts.length !== b.infeasible_parts.length) {
      return b.infeasible_parts.length - a.infeasible_parts.length
    }
    if (a.shortfall_sqft !== b.shortfall_sqft) {
      return b.shortfall_sqft - a.shortfall_sqft
    }
    return a.material.localeCompare(b.material)
  })
  return results
}

/**
 * Jobs + job_parts repository. Keeps the surface intentionally
 * small: list/get/create/update/delete on jobs, plus add/remove on
 * job_parts. Matching against inventory (sufficiency check) and
 * deep-linking into the cutting engine live one layer up —
 * repository stays focused on persistence.
 */

export type CreateJobInput = Pick<Job, "name"> &
  Partial<
    Pick<
      Job,
      | "description"
      | "customer_name"
      | "customer_email"
      | "customer_phone"
      | "customer_po_number"
      | "status"
      | "due_date"
      | "notes"
    >
  >

export type UpdateJobInput = Partial<Omit<Job, "id" | "user_id" | "job_number" | "created_at" | "updated_at">>

export type CreateJobPartInput = Pick<JobPart, "job_id" | "width" | "length" | "quantity"> &
  Partial<
    Pick<
      JobPart,
      | "material_type_id"
      | "material_type"
      | "part_number"
      | "description"
      | "thickness"
      | "unit_price"
      | "notes"
    >
  >

export type CreateJobAssigneeInput = Pick<JobAssignee, "job_id" | "name" | "role"> &
  Partial<Pick<JobAssignee, "notes">>

export type CreateJobRollAllocationInput = Pick<
  JobRollAllocation,
  "job_id" | "roll_id" | "allocated_length"
> &
  Partial<Pick<JobRollAllocation, "notes">>

export class JobsRepository {
  async list(options?: {
    status?: JobStatus
    customerName?: string
    limit?: number
  }): Promise<Job[]> {
    let query = supabase.from("jobs").select("*").order("created_at", { ascending: false })
    if (options?.status) query = query.eq("status", options.status)
    if (options?.customerName) query = query.ilike("customer_name", `%${options.customerName}%`)
    if (options?.limit) query = query.limit(options.limit)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Job[]
  }

  async get(id: string): Promise<JobWithParts | null> {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single()
    if (jobErr) {
      if (jobErr.code === "PGRST116") return null
      throw jobErr
    }
    const { data: parts, error: partsErr } = await supabase
      .from("job_parts")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: true })
    if (partsErr) throw partsErr
    return { ...(job as Job), parts: (parts ?? []) as JobPart[] }
  }

  async create(input: CreateJobInput): Promise<Job> {
    const { data, error } = await supabase.from("jobs").insert(input).select().single()
    if (error) throw error
    return data as Job
  }

  async update(id: string, updates: UpdateJobInput): Promise<Job> {
    const { data, error } = await supabase
      .from("jobs")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data as Job
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("jobs").delete().eq("id", id)
    if (error) throw error
  }

  // ── job_parts ────────────────────────────────────────────────

  async addPart(input: CreateJobPartInput): Promise<JobPart> {
    const { data, error } = await supabase
      .from("job_parts")
      .insert(input)
      .select()
      .single()
    if (error) throw error
    return data as JobPart
  }

  async updatePart(id: string, updates: Partial<JobPart>): Promise<JobPart> {
    const { data, error } = await supabase
      .from("job_parts")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data as JobPart
  }

  async removePart(id: string): Promise<void> {
    const { error } = await supabase.from("job_parts").delete().eq("id", id)
    if (error) throw error
  }

  // ── full detail (parts + assignees + allocations) ───────────

  async getFull(id: string): Promise<JobFullDetail | null> {
    const base = await this.get(id)
    if (!base) return null
    // Secondary queries must never prevent the detail page from
    // loading. If a follow-up migration isn't applied or transient
    // RLS state blocks one of these tables, we degrade gracefully
    // to empty arrays instead of erroring out the whole page.
    const [assigneesR, allocationsR] = await Promise.allSettled([
      this.listAssignees(id),
      this.listAllocations(id),
    ])
    const assignees =
      assigneesR.status === "fulfilled" ? assigneesR.value : []
    const allocations =
      allocationsR.status === "fulfilled" ? allocationsR.value : []
    if (assigneesR.status === "rejected") {
      console.error("[jobs] listAssignees failed", assigneesR.reason)
    }
    if (allocationsR.status === "rejected") {
      console.error("[jobs] listAllocations failed", allocationsR.reason)
    }
    return { ...base, assignees, allocations }
  }

  // ── assignees ───────────────────────────────────────────────

  async listAssignees(jobId: string): Promise<JobAssignee[]> {
    const { data, error } = await supabase
      .from("job_assignees")
      .select("*")
      .eq("job_id", jobId)
      // Lead first, then workers alphabetically — reads well on the PDF.
      .order("role", { ascending: true })
      .order("name", { ascending: true })
    if (error) throw error
    return (data ?? []) as JobAssignee[]
  }

  async addAssignee(input: CreateJobAssigneeInput): Promise<JobAssignee> {
    const { data, error } = await supabase
      .from("job_assignees")
      .insert(input)
      .select()
      .single()
    if (error) throw error
    return data as JobAssignee
  }

  async updateAssignee(
    id: string,
    updates: Partial<Pick<JobAssignee, "name" | "role" | "notes">>
  ): Promise<JobAssignee> {
    const { data, error } = await supabase
      .from("job_assignees")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data as JobAssignee
  }

  async removeAssignee(id: string): Promise<void> {
    const { error } = await supabase.from("job_assignees").delete().eq("id", id)
    if (error) throw error
  }

  // ── roll allocations ────────────────────────────────────────

  async listAllocations(jobId: string): Promise<JobRollAllocationWithRoll[]> {
    // Two-step query — originally one PostgREST embedded-resource
    // select (`*, roll:rolls (…)`) but the join was silently failing
    // when the relationship detection hadn't refreshed on the
    // schema cache. Splitting keeps the drawer reliable across
    // environments (and the second call is cached by the browser
    // anyway since it's the same rolls the inventory list hits).
    const { data: rows, error: allocErr } = await supabase
      .from("job_roll_allocations")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
    if (allocErr) {
      console.error("listAllocations query failed", {
        message: allocErr.message,
        code: allocErr.code,
        details: allocErr.details,
        hint: allocErr.hint,
      })
      // 42P01 = relation does not exist (migration not applied).
      // 42703 = column does not exist. Either case → empty list
      // so the detail page renders. Other errors still throw.
      if (allocErr.code === "42P01" || allocErr.code === "42703") return []
      throw allocErr
    }
    const allocations = (rows ?? []) as JobRollAllocation[]
    if (allocations.length === 0) return []

    const rollIds = allocations.map((a) => a.roll_id)
    const { data: rolls, error: rollErr } = await supabase
      .from("rolls")
      .select("id, part_number, material_type, width, length, remaining_length, location")
      .in("id", rollIds)
    if (rollErr) {
      console.error("listAllocations rolls lookup failed", {
        message: rollErr.message,
        code: rollErr.code,
      })
      // Still return the allocations, just without roll metadata.
      return allocations.map((a) => ({ ...a, roll: null }))
    }
    type RollSummary = NonNullable<JobRollAllocationWithRoll["roll"]>
    const rollRows = (rolls ?? []) as RollSummary[]
    const byId = new Map<string, RollSummary>(rollRows.map((r) => [r.id, r]))
    return allocations.map<JobRollAllocationWithRoll>((a) => ({
      ...a,
      roll: byId.get(a.roll_id) ?? null,
    }))
  }

  async addAllocation(input: CreateJobRollAllocationInput): Promise<JobRollAllocation> {
    const { data, error } = await supabase
      .from("job_roll_allocations")
      .insert(input)
      .select()
      .single()
    if (error) throw error
    return data as JobRollAllocation
  }

  async updateAllocation(
    id: string,
    updates: Partial<Pick<JobRollAllocation, "allocated_length" | "notes">>
  ): Promise<JobRollAllocation> {
    const { data, error } = await supabase
      .from("job_roll_allocations")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data as JobRollAllocation
  }

  async removeAllocation(id: string): Promise<void> {
    const { error } = await supabase.from("job_roll_allocations").delete().eq("id", id)
    if (error) throw error
  }

  // ── linked purchase orders (purchase_orders.job_id) ─────────

  async listPurchaseOrders(jobId: string): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
    if (error) {
      // Environments without the 0006 migration applied — surface
      // an empty list rather than crashing the detail page.
      if (error.code === "42703") return []
      throw error
    }
    return (data ?? []) as PurchaseOrder[]
  }

  // ── linked cuts (cut_history.job_id) ────────────────────────

  async listCuts(jobId: string): Promise<CutHistory[]> {
    const { data, error } = await supabase
      .from("cut_history")
      .select("*")
      .eq("job_id", jobId)
      .order("cut_date", { ascending: false })
    if (error) {
      if (error.code === "42703") return []
      throw error
    }
    return (data ?? []) as CutHistory[]
  }

  // ── sufficiency check (client-side aggregation) ────────────

  async computeSufficiency(jobId: string): Promise<JobMaterialSufficiency[]> {
    // Three reads, all parallel. Allocations query is scoped to
    // *other* jobs so we subtract competing reservations from the
    // available pool without double-counting the current job's own
    // earmarks (which the sufficiency view shouldn't penalise).
    const [partsResult, rollsResult, allocationsResult] = await Promise.all([
      supabase.from("job_parts").select("*").eq("job_id", jobId),
      supabase
        .from("rolls")
        .select("id, part_number, material_type, width, remaining_length, location")
        .eq("status", "active"),
      supabase
        .from("job_roll_allocations")
        .select("roll_id, allocated_length")
        .neq("job_id", jobId),
    ])
    if (partsResult.error) throw partsResult.error
    if (rollsResult.error) throw rollsResult.error

    const parts = (partsResult.data ?? []) as JobPart[]
    const rolls = (rollsResult.data ?? []) as SufficiencyRoll[]

    // Allocations table may be unmigrated in some envs — degrade
    // gracefully instead of failing the whole check. 42P01 =
    // relation does not exist; 42703 = column missing.
    let otherAllocations: SufficiencyAllocation[] = []
    if (allocationsResult.error) {
      const code = allocationsResult.error.code
      if (code !== "42P01" && code !== "42703") {
        console.warn("[jobs] allocations lookup failed; sufficiency will ignore reservations", {
          message: allocationsResult.error.message,
          code,
        })
      }
    } else {
      otherAllocations = (allocationsResult.data ?? []) as SufficiencyAllocation[]
    }

    return aggregateSufficiency(parts, rolls, otherAllocations)
  }
}

export type {
  JobAssigneeRole,
  JobAssignee,
  JobRollAllocation,
  JobRollAllocationWithRoll,
  JobFullDetail,
}

export const jobsRepository = new JobsRepository()
