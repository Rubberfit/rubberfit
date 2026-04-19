/**
 * Typed inventory client — per-aggregate wrappers over the shared
 * openapi-fetch instance. Flag-gated: when
 * `NEXT_PUBLIC_USE_RUST_INVENTORY` is `"true"`, calls go to the
 * new `/api/v2/inventory/*` route handlers (which forward to
 * Rust); otherwise the wrappers fall back to the existing legacy
 * repositories/services so pages opting-in file-by-file keep
 * working.
 *
 * Per the S3b plan we coexist with legacy — we do NOT rewire
 * `rollService` / `materialTypeService` / `supplierService`
 * globally. That would be too large a blast radius for S3b.
 *
 * Known gap (deferred to S3c): the `user_id` field on the TS
 * models isn't carried on the Rust DTO yet. When the flag is on,
 * we stamp it as `""` — no UI surface reads user_id for display,
 * but admin/audit views that filter by it would need the DTO to
 * be widened. The admin user-picker endpoint is also S3c scope.
 */
import { materialTypeRepository as legacyMaterialTypes } from "@/src/infrastructure/repositories/material-types.repository"
import { rollsRepository as legacyRolls } from "@/src/infrastructure/repositories/rolls.repository"
import { supplierService as legacySuppliers } from "@/src/infrastructure/services/supplierService"
import type {
  MaterialSupplier,
  MaterialType,
  Roll,
  Supplier,
} from "@/src/infrastructure/models/supabase"

import { rfClient } from "../client"
import type { components } from "../types"

type MaterialTypeDto = components["schemas"]["MaterialTypeDto"]
type CreateMaterialTypeBody = components["schemas"]["CreateMaterialTypeBody"]
type UpdateMaterialTypeBody = components["schemas"]["UpdateMaterialTypeBody"]

type SupplierDto = components["schemas"]["SupplierDto"]
type CreateSupplierBody = components["schemas"]["CreateSupplierBody"]
type UpdateSupplierBody = components["schemas"]["UpdateSupplierBody"]

type MaterialSupplierDto = components["schemas"]["MaterialSupplierDto"]
type CreateMaterialSupplierBody = components["schemas"]["CreateMaterialSupplierBody"]
type UpdateMaterialSupplierBody = components["schemas"]["UpdateMaterialSupplierBody"]

type RollDto = components["schemas"]["RollDto"]
type CreateRollBody = components["schemas"]["CreateRollBody"]
type UpdateRollBody = components["schemas"]["UpdateRollBody"]

/**
 * Read the feature flag at call time (not module load) so a Vercel
 * env flip takes effect on the next request without a redeploy.
 */
function useRustBackend(): boolean {
  return process.env.NEXT_PUBLIC_USE_RUST_INVENTORY === "true"
}

// ---------------------------------------------------------------
// DTO → legacy model converters.
// ---------------------------------------------------------------
//
// The legacy models use `field?: T` (optional, `| undefined`) for
// nullable columns. The Rust DTO uses `field?: T | null`. We
// coalesce `null` to `undefined` so the resulting object satisfies
// the legacy shape.

function materialTypeFromDto(dto: MaterialTypeDto): MaterialType {
  return {
    id: dto.id,
    user_id: "",
    name: dto.name,
    description: dto.description ?? undefined,
    default_cost: dto.default_cost ?? undefined,
    min_stock_alert: dto.min_stock_alert ?? undefined,
    created_at: dto.created_at ?? new Date(0).toISOString(),
    updated_at: dto.updated_at ?? new Date(0).toISOString(),
  }
}

function supplierFromDto(dto: SupplierDto): Supplier {
  return {
    id: dto.id,
    user_id: "",
    name: dto.name,
    contact_person: dto.contact_person ?? undefined,
    email: dto.email ?? undefined,
    phone: dto.phone ?? undefined,
    address: dto.address ?? undefined,
    city: dto.city ?? undefined,
    state: dto.state ?? undefined,
    zip_code: dto.zip_code ?? undefined,
    country: dto.country ?? undefined,
    website: dto.website ?? undefined,
    tax_id: dto.tax_id ?? undefined,
    payment_terms: dto.payment_terms ?? undefined,
    rating: dto.rating ?? undefined,
    preferred: dto.preferred,
    active: dto.active,
    notes: dto.notes ?? undefined,
    created_at: dto.created_at ?? new Date(0).toISOString(),
    updated_at: dto.updated_at ?? new Date(0).toISOString(),
  } as Supplier
}

function materialSupplierFromDto(dto: MaterialSupplierDto): MaterialSupplier {
  return {
    id: dto.id,
    user_id: "",
    material_type_id: dto.material_type_id,
    supplier_id: dto.supplier_id,
    supplier_material_code: dto.supplier_material_code ?? undefined,
    cost_per_sqft: dto.cost_per_sqft,
    minimum_order_sqft: dto.minimum_order_sqft ?? 0,
    lead_time_days: dto.lead_time_days ?? 0,
    preferred_supplier: dto.preferred_supplier,
    active: dto.active,
    notes: dto.notes ?? undefined,
    effective_date: dto.effective_date ?? new Date(0).toISOString(),
    expiration_date: dto.expiration_date ?? undefined,
    created_at: dto.created_at ?? new Date(0).toISOString(),
    updated_at: dto.updated_at ?? new Date(0).toISOString(),
  } as MaterialSupplier
}

function rollFromDto(dto: RollDto): Roll {
  return {
    id: dto.id,
    user_id: "",
    material_type_id: dto.material_type_id ?? undefined,
    material_type: dto.material_type,
    width: dto.width,
    length: dto.length,
    thickness: dto.thickness,
    color: dto.color ?? undefined,
    location: dto.location ?? undefined,
    date_received: dto.date_received ?? undefined,
    supplier: dto.supplier ?? undefined,
    cost_per_sqft: dto.cost_per_sqft ?? undefined,
    remaining_length: dto.remaining_length,
    status: dto.status as Roll["status"],
    notes: dto.notes ?? undefined,
    created_at: dto.created_at ?? new Date(0).toISOString(),
    updated_at: dto.updated_at ?? new Date(0).toISOString(),
  } as Roll
}

/**
 * Unwrap an openapi-fetch result. `{ data, error }` is the library's
 * Result-style return; we want to throw on error so callers get the
 * same shape legacy services return.
 */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined) {
    const e = result.error as { code?: string; message?: string }
    if (e && typeof e === "object" && "code" in e && e.code) {
      const err = new Error(e.code) as Error & { code?: string; status: number }
      err.code = e.code
      err.status = result.response.status
      throw err
    }
    throw new Error(
      `${result.response.status} ${result.response.statusText || "request failed"}`
    )
  }
  if (result.data === undefined) {
    throw new Error("response had no data")
  }
  return result.data
}

// ---------------------------------------------------------------
// Material types
// ---------------------------------------------------------------

export const materialTypes = {
  async list(): Promise<MaterialType[]> {
    if (!useRustBackend()) return legacyMaterialTypes.getAll()
    const res = await rfClient.GET("/api/v2/inventory/material-types")
    return unwrap(res).map(materialTypeFromDto)
  },
  async get(id: string): Promise<MaterialType | null> {
    if (!useRustBackend()) {
      const list = await legacyMaterialTypes.getByIds([id])
      return list[0] ?? null
    }
    const res = await rfClient.GET("/api/v2/inventory/material-types/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return materialTypeFromDto(unwrap(res))
  },
  async create(body: CreateMaterialTypeBody): Promise<MaterialType> {
    if (!useRustBackend()) {
      return legacyMaterialTypes.create({
        name: body.name,
        description: body.description ?? undefined,
        default_cost: body.default_cost ?? undefined,
        min_stock_alert: body.min_stock_alert ?? undefined,
      })
    }
    const res = await rfClient.POST("/api/v2/inventory/material-types", { body })
    return materialTypeFromDto(unwrap(res))
  },
  async update(id: string, body: UpdateMaterialTypeBody): Promise<MaterialType> {
    if (!useRustBackend()) {
      const patch: Partial<MaterialType> = {}
      if (body.name != null) patch.name = body.name
      if (body.description !== undefined)
        patch.description = body.description ?? undefined
      if (body.default_cost !== undefined)
        patch.default_cost = body.default_cost ?? undefined
      if (body.min_stock_alert !== undefined)
        patch.min_stock_alert = body.min_stock_alert ?? undefined
      return legacyMaterialTypes.update(id, patch)
    }
    const res = await rfClient.PUT("/api/v2/inventory/material-types/{id}", {
      params: { path: { id } },
      body,
    })
    return materialTypeFromDto(unwrap(res))
  },
  async delete(id: string): Promise<void> {
    if (!useRustBackend()) return legacyMaterialTypes.delete(id)
    const res = await rfClient.DELETE("/api/v2/inventory/material-types/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },
}

// ---------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------

export const suppliers = {
  async list(params?: {
    active?: boolean
    preferred?: boolean
    q?: string
  }): Promise<Supplier[]> {
    if (!useRustBackend()) {
      return legacySuppliers.getSuppliers({
        filterActive: params?.active,
        filterPreferred: params?.preferred,
      })
    }
    const res = await rfClient.GET("/api/v2/inventory/suppliers", {
      params: { query: params },
    })
    return unwrap(res).map(supplierFromDto)
  },
  async get(id: string): Promise<Supplier | null> {
    if (!useRustBackend()) return legacySuppliers.getSupplierById(id)
    const res = await rfClient.GET("/api/v2/inventory/suppliers/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return supplierFromDto(unwrap(res))
  },
  async create(body: CreateSupplierBody): Promise<Supplier> {
    if (!useRustBackend()) {
      return legacySuppliers.createSupplier(
        body as unknown as Parameters<typeof legacySuppliers.createSupplier>[0]
      )
    }
    const res = await rfClient.POST("/api/v2/inventory/suppliers", { body })
    return supplierFromDto(unwrap(res))
  },
  async update(id: string, body: UpdateSupplierBody): Promise<Supplier> {
    if (!useRustBackend()) {
      return legacySuppliers.updateSupplier(
        id,
        body as unknown as Parameters<typeof legacySuppliers.updateSupplier>[1]
      )
    }
    const res = await rfClient.PUT("/api/v2/inventory/suppliers/{id}", {
      params: { path: { id } },
      body,
    })
    return supplierFromDto(unwrap(res))
  },
  async delete(id: string): Promise<void> {
    if (!useRustBackend()) {
      await legacySuppliers.deleteSupplier(id)
      return
    }
    const res = await rfClient.DELETE("/api/v2/inventory/suppliers/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },
}

// ---------------------------------------------------------------
// Material suppliers (junction)
// ---------------------------------------------------------------

export const materialSuppliers = {
  async list(params?: {
    material_type_id?: string
    supplier_id?: string
    active?: boolean
  }): Promise<MaterialSupplier[]> {
    if (!useRustBackend()) {
      if (params?.material_type_id) {
        return legacySuppliers.getSuppliersByMaterialType(
          params.material_type_id
        )
      }
      if (params?.supplier_id) {
        return legacySuppliers.getMaterialsBySupplier(params.supplier_id)
      }
      throw new Error(
        "materialSuppliers.list requires material_type_id or supplier_id when flag is off"
      )
    }
    const res = await rfClient.GET("/api/v2/inventory/material-suppliers", {
      params: { query: params },
    })
    return unwrap(res).map(materialSupplierFromDto)
  },
  async create(body: CreateMaterialSupplierBody): Promise<MaterialSupplier> {
    if (!useRustBackend()) {
      return legacySuppliers.linkMaterialToSupplier(
        body as unknown as Parameters<
          typeof legacySuppliers.linkMaterialToSupplier
        >[0]
      )
    }
    const res = await rfClient.POST("/api/v2/inventory/material-suppliers", {
      body,
    })
    return materialSupplierFromDto(unwrap(res))
  },
  async update(
    id: string,
    body: UpdateMaterialSupplierBody
  ): Promise<MaterialSupplier> {
    if (!useRustBackend()) {
      return legacySuppliers.updateMaterialSupplier(
        id,
        body as unknown as Parameters<
          typeof legacySuppliers.updateMaterialSupplier
        >[1]
      )
    }
    const res = await rfClient.PUT(
      "/api/v2/inventory/material-suppliers/{id}",
      { params: { path: { id } }, body }
    )
    return materialSupplierFromDto(unwrap(res))
  },
  async delete(id: string): Promise<void> {
    if (!useRustBackend()) {
      await legacySuppliers.unlinkMaterialFromSupplier(id)
      return
    }
    const res = await rfClient.DELETE(
      "/api/v2/inventory/material-suppliers/{id}",
      { params: { path: { id } } }
    )
    if (!res.response.ok) unwrap(res)
  },
}

// ---------------------------------------------------------------
// Rolls
// ---------------------------------------------------------------

export const rolls = {
  async list(params?: {
    status?: "active" | "depleted" | "reserved"
    material_type_id?: string
    location?: string
    q?: string
    limit?: number
    offset?: number
  }): Promise<Roll[]> {
    if (!useRustBackend()) {
      if (params?.status === "active" || params?.status === undefined) {
        return legacyRolls.getActiveRolls()
      }
      return legacyRolls.getAllRolls()
    }
    const res = await rfClient.GET("/api/v2/inventory/rolls", {
      params: { query: params },
    })
    return unwrap(res).map(rollFromDto)
  },
  async get(id: string): Promise<Roll | null> {
    if (!useRustBackend()) {
      try {
        return await legacyRolls.getRollById(id)
      } catch {
        return null
      }
    }
    const res = await rfClient.GET("/api/v2/inventory/rolls/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return rollFromDto(unwrap(res))
  },
  async create(body: CreateRollBody): Promise<Roll> {
    if (!useRustBackend()) {
      return legacyRolls.addRoll(
        body as unknown as Parameters<typeof legacyRolls.addRoll>[0]
      )
    }
    const res = await rfClient.POST("/api/v2/inventory/rolls", { body })
    return rollFromDto(unwrap(res))
  },
  async update(id: string, body: UpdateRollBody): Promise<Roll> {
    if (!useRustBackend()) {
      return legacyRolls.updateRoll(
        id,
        body as unknown as Parameters<typeof legacyRolls.updateRoll>[1]
      )
    }
    const res = await rfClient.PUT("/api/v2/inventory/rolls/{id}", {
      params: { path: { id } },
      body,
    })
    return rollFromDto(unwrap(res))
  },
  async delete(id: string): Promise<void> {
    if (!useRustBackend()) return legacyRolls.deleteRoll(id)
    const res = await rfClient.DELETE("/api/v2/inventory/rolls/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },

  async inventoryValue(): Promise<number> {
    if (!useRustBackend()) return legacyRolls.getInventoryValue()
    const res = await rfClient.GET(
      "/api/v2/inventory/rolls/stats/inventory-value"
    )
    return unwrap(res).value
  },
  async lowStockCount(): Promise<number> {
    if (!useRustBackend()) return legacyRolls.getLowStockCount()
    const res = await rfClient.GET(
      "/api/v2/inventory/rolls/stats/low-stock-count"
    )
    return unwrap(res).count
  },
  async growthPercentage(): Promise<number> {
    if (!useRustBackend()) return legacyRolls.getInventoryGrowthPercentage()
    const res = await rfClient.GET(
      "/api/v2/inventory/rolls/stats/growth-percentage"
    )
    return unwrap(res).percentage
  },
  async recent(limit = 10): Promise<Roll[]> {
    if (!useRustBackend()) return legacyRolls.getRecentRolls(limit)
    const res = await rfClient.GET("/api/v2/inventory/rolls/recent", {
      params: { query: { limit } },
    })
    return unwrap(res).map(rollFromDto)
  },
}
