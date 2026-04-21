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

/**
 * Per-material sufficiency summary used by the job detail page.
 * Grouping key is the normalised material_type string, because
 * `job_parts.material_type_id` is optional — the name is the
 * only reliable cross-reference across parts + rolls.
 */
export interface JobMaterialSufficiency {
  material: string
  /** Square feet needed to fulfil the parts lines for this material. */
  needed_sqft: number
  /** Square feet currently available across active rolls of this material. */
  available_sqft: number
  /** `max(0, needed_sqft - available_sqft)`. Zero when inventory covers the job. */
  shortfall_sqft: number
  /** Individual rolls feeding the availability number — caller can render them. */
  matching_rolls: Pick<
    Roll,
    "id" | "part_number" | "width" | "remaining_length" | "location"
  >[]
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
    const [partsResult, rollsResult] = await Promise.all([
      supabase.from("job_parts").select("*").eq("job_id", jobId),
      supabase
        .from("rolls")
        .select("id, part_number, material_type, width, length, remaining_length, location")
        .eq("status", "active"),
    ])
    if (partsResult.error) throw partsResult.error
    if (rollsResult.error) throw rollsResult.error

    const parts = (partsResult.data ?? []) as JobPart[]
    const rolls = (rollsResult.data ?? []) as Array<
      Pick<
        Roll,
        "id" | "part_number" | "material_type" | "width" | "length" | "remaining_length" | "location"
      >
    >

    // Aggregate needed sqft per material (normalised to lowercase
    // to handle "Butyl" vs "butyl"). Unknown material on a part
    // is grouped under the literal label "Unspecified".
    const byMaterial = new Map<
      string,
      { display: string; needed: number }
    >()
    for (const p of parts) {
      const key = (p.material_type ?? "").trim().toLowerCase() || "unspecified"
      const display = p.material_type?.trim() || "Unspecified"
      const needed = (p.width * p.length * p.quantity) / 144
      const existing = byMaterial.get(key)
      if (existing) existing.needed += needed
      else byMaterial.set(key, { display, needed })
    }

    // Match rolls to each material by the same normalised key.
    const results: JobMaterialSufficiency[] = []
    for (const [key, { display, needed }] of byMaterial) {
      const matchingRolls = rolls.filter(
        (r) => r.material_type.trim().toLowerCase() === key
      )
      const available =
        matchingRolls.reduce(
          (sum, r) => sum + (r.remaining_length * r.width) / 144,
          0
        )
      results.push({
        material: display,
        needed_sqft: Number(needed.toFixed(2)),
        available_sqft: Number(available.toFixed(2)),
        shortfall_sqft: Number(Math.max(0, needed - available).toFixed(2)),
        matching_rolls: matchingRolls.map((r) => ({
          id: r.id,
          part_number: r.part_number,
          width: r.width,
          remaining_length: r.remaining_length,
          location: r.location,
        })),
      })
    }
    // Sort by biggest shortfall first — operators care about
    // what's blocking the job, not what's comfortably covered.
    results.sort((a, b) => b.shortfall_sqft - a.shortfall_sqft)
    return results
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
