/**
 * Typed procurement client — per-aggregate wrappers over the shared
 * openapi-fetch instance. Flag-gated: when
 * `NEXT_PUBLIC_USE_RUST_PROCUREMENT` is `"true"`, calls go to the
 * new `/api/v2/po/**`, `/api/v2/reorder-rules/**`,
 * `/api/v2/import/rolls/**`, and `/api/v2/po/tax/preview` route
 * handlers (which forward to Rust); otherwise the wrappers fall
 * back to the existing legacy services so pages opting-in
 * file-by-file keep working.
 *
 * Four namespaces: `purchaseOrders`, `reorderRules`, `importRolls`,
 * `tax`. The UI cutover in Tasks 11a/b/c swaps call sites one
 * surface at a time; the flag controls the backend per call.
 *
 * **`reorderRules` and `purchaseOrders` namespaces are now flag-ON-only.**
 * The legacy fallbacks were retired alongside `legacyReorderService`
 * and `legacyPurchaseOrderService`. Each flag-OFF branch throws an
 * explicit error directing operators to flip
 * `NEXT_PUBLIC_USE_RUST_PROCUREMENT=true`. The retirement was safe
 * because the legacy CRUD already referenced columns the schema
 * redesign dropped (`user_id`), so flag-OFF writes were runtime-broken
 * anyway. `importRolls` and `tax` namespaces still carry working
 * legacy fallbacks (csvService + taxService remain entity-clean).
 *
 * Scope: Task 9 ships the flag-ON plumbing as the source of truth.
 * Legacy fallbacks exist to keep the UI functional during the
 * cutover but are intentionally thin — the legacy shape is
 * preserved where it matches the DTO closely, and complex paths
 * (bulk reorder, receive, CSV import) delegate to the existing
 * service method without extra adaptation. If a code path throws
 * from the legacy fallback, Task 11 will either surface the error
 * or flip the flag ON for that surface.
 */

import { csvService as legacyCsv } from "@/src/infrastructure/services/csvService"
import { taxService as legacyTax } from "@/src/infrastructure/services/taxService"

import { rfClient } from "../client"
import type { components } from "../types"

type PurchaseOrderDto = components["schemas"]["PurchaseOrderDto"]
type CreatePurchaseOrderBody = components["schemas"]["CreatePurchaseOrderBody"]
type UpdatePurchaseOrderBody = components["schemas"]["UpdatePurchaseOrderBody"]
type UpdatePurchaseOrderStatusBody = components["schemas"]["UpdatePurchaseOrderStatusBody"]

type PurchaseOrderItemDto = components["schemas"]["PurchaseOrderItemDto"]
type CreatePurchaseOrderItemBody = components["schemas"]["CreatePurchaseOrderItemBody"]
type UpdatePurchaseOrderItemBody = components["schemas"]["UpdatePurchaseOrderItemBody"]

type ReceivePurchaseOrderBody = components["schemas"]["ReceivePurchaseOrderBody"]
type ReceiveReceiptDto = components["schemas"]["ReceiveReceiptDto"]

type ReorderRuleDto = components["schemas"]["ReorderRuleDto"]
type CreateReorderRuleBody = components["schemas"]["CreateReorderRuleBody"]
type UpdateReorderRuleBody = components["schemas"]["UpdateReorderRuleBody"]
type ReorderSuggestionDto = components["schemas"]["ReorderSuggestionDto"]

type CreateReorderPoRowBody = components["schemas"]["CreateReorderPoRowBody"]
type CreateReorderPoBatchBody = components["schemas"]["CreateReorderPoBatchBody"]
type CreateReorderPoBulkBody = components["schemas"]["CreateReorderPoBulkBody"]
type ReorderPoReceiptDto = components["schemas"]["ReorderPoReceiptDto"]

type ImportRollsBody = components["schemas"]["ImportRollsBody"]
type ImportReceiptDto = components["schemas"]["ImportReceiptDto"]

type TaxPreviewDto = components["schemas"]["TaxPreviewDto"]

/**
 * Read the feature flag at call time (not module load) so a Vercel
 * env flip takes effect on the next request without a redeploy.
 */
function isRustBackendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_RUST_PROCUREMENT === "true"
}

/**
 * Narrow the openapi-fetch result union so the caller gets a
 * concrete DTO or a thrown Error carrying the stable conflict code
 * on the `code` property. Mirrors the inventory SDK's helper so
 * call sites can use `error.code === "RECEIVED_REQUIRES_RECEIVE_FLOW"`
 * etc.
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
    throw new Error(`${result.response.status} ${result.response.statusText || "request failed"}`)
  }
  if (result.data === undefined) {
    throw new Error("response had no data")
  }
  return result.data
}

// ---------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------

// `legacyPurchaseOrderService` was retired alongside this surface —
// every flag-OFF branch below throws so operators are explicitly
// directed to flip `NEXT_PUBLIC_USE_RUST_PROCUREMENT=true`. Mirrors
// the `reorderFlagOffError` pattern.
function purchaseOrderFlagOffError(operation: string): Error {
  return new Error(
    `purchase order ${operation} flag-OFF path not wired (legacyPurchaseOrderService retired); flip NEXT_PUBLIC_USE_RUST_PROCUREMENT=true for this surface`
  )
}

export const purchaseOrders = {
  async list(params?: {
    status?: string
    supplier_id?: string
    auto_generated?: boolean
    q?: string
    limit?: number
    offset?: number
  }): Promise<PurchaseOrderDto[]> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("list")
    }
    const res = await rfClient.GET("/api/v2/po", {
      params: { query: params },
    })
    return unwrap(res)
  },
  async get(id: string): Promise<PurchaseOrderDto | null> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("get")
    }
    const res = await rfClient.GET("/api/v2/po/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return unwrap(res)
  },
  async create(body: CreatePurchaseOrderBody): Promise<PurchaseOrderDto> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("create")
    }
    const res = await rfClient.POST("/api/v2/po", { body })
    return unwrap(res)
  },
  async update(id: string, body: UpdatePurchaseOrderBody): Promise<PurchaseOrderDto> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("update")
    }
    const res = await rfClient.PUT("/api/v2/po/{id}", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async updateStatus(id: string, body: UpdatePurchaseOrderStatusBody): Promise<PurchaseOrderDto> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("updateStatus")
    }
    const res = await rfClient.PUT("/api/v2/po/{id}/status", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async delete(id: string): Promise<void> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("delete")
    }
    const res = await rfClient.DELETE("/api/v2/po/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },
  async receive(id: string, body: ReceivePurchaseOrderBody): Promise<ReceiveReceiptDto> {
    if (!isRustBackendEnabled()) {
      throw purchaseOrderFlagOffError("receive")
    }
    const res = await rfClient.POST("/api/v2/po/{id}/receive", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  items: {
    async list(po_id: string): Promise<PurchaseOrderItemDto[]> {
      if (!isRustBackendEnabled()) {
        throw purchaseOrderFlagOffError("items.list")
      }
      const res = await rfClient.GET("/api/v2/po/{po_id}/items", {
        params: { path: { po_id } },
      })
      return unwrap(res)
    },
    async add(po_id: string, body: CreatePurchaseOrderItemBody): Promise<PurchaseOrderItemDto> {
      if (!isRustBackendEnabled()) {
        throw purchaseOrderFlagOffError("items.add")
      }
      const res = await rfClient.POST("/api/v2/po/{po_id}/items", {
        params: { path: { po_id } },
        body,
      })
      return unwrap(res)
    },
    async update(
      po_id: string,
      item_id: string,
      body: UpdatePurchaseOrderItemBody
    ): Promise<PurchaseOrderItemDto> {
      if (!isRustBackendEnabled()) {
        throw purchaseOrderFlagOffError("items.update")
      }
      const res = await rfClient.PUT("/api/v2/po/{po_id}/items/{item_id}", {
        params: { path: { po_id, item_id } },
        body,
      })
      return unwrap(res)
    },
    async delete(po_id: string, item_id: string): Promise<void> {
      if (!isRustBackendEnabled()) {
        throw purchaseOrderFlagOffError("items.delete")
      }
      const res = await rfClient.DELETE("/api/v2/po/{po_id}/items/{item_id}", {
        params: { path: { po_id, item_id } },
      })
      if (!res.response.ok) unwrap(res)
    },
  },
}

// ---------------------------------------------------------------
// Reorder rules + suggestions
// ---------------------------------------------------------------

// `legacyReorderService` was retired alongside this surface — every
// flag-OFF branch below throws so operators are explicitly directed
// to flip `NEXT_PUBLIC_USE_RUST_PROCUREMENT=true`. See file-top
// docblock; matches the pre-existing `createPo` / `createIndividualPos`
// / `createBulkPo` pattern.
function reorderFlagOffError(operation: string): Error {
  return new Error(
    `reorder ${operation} flag-OFF path not wired (legacyReorderService retired); flip NEXT_PUBLIC_USE_RUST_PROCUREMENT=true for this surface`
  )
}

export const reorderRules = {
  async list(): Promise<ReorderRuleDto[]> {
    if (!isRustBackendEnabled()) {
      throw reorderFlagOffError("list")
    }
    const res = await rfClient.GET("/api/v2/reorder-rules")
    return unwrap(res)
  },
  async get(id: string): Promise<ReorderRuleDto | null> {
    if (!isRustBackendEnabled()) {
      throw reorderFlagOffError("get")
    }
    const res = await rfClient.GET("/api/v2/reorder-rules/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return unwrap(res)
  },
  async create(body: CreateReorderRuleBody): Promise<ReorderRuleDto> {
    if (!isRustBackendEnabled()) {
      throw reorderFlagOffError("create")
    }
    const res = await rfClient.POST("/api/v2/reorder-rules", { body })
    return unwrap(res)
  },
  async update(id: string, body: UpdateReorderRuleBody): Promise<ReorderRuleDto> {
    if (!isRustBackendEnabled()) {
      throw reorderFlagOffError("update")
    }
    const res = await rfClient.PUT("/api/v2/reorder-rules/{id}", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async delete(id: string): Promise<void> {
    if (!isRustBackendEnabled()) {
      throw reorderFlagOffError("delete")
    }
    const res = await rfClient.DELETE("/api/v2/reorder-rules/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },
  async suggestions(params?: { include_pending?: boolean }): Promise<ReorderSuggestionDto[]> {
    if (!isRustBackendEnabled()) {
      throw reorderFlagOffError("suggestions")
    }
    const res = await rfClient.GET("/api/v2/reorder-rules/suggestions", {
      params: { query: params },
    })
    return unwrap(res)
  },
  async createPo(id: string, body: CreateReorderPoRowBody): Promise<ReorderPoReceiptDto> {
    if (!isRustBackendEnabled()) {
      // Legacy `createAutomaticPurchaseOrder(suggestion)` expects a
      // shape with materialTypeId / suggestedQuantity / estimatedCost
      // / supplierId / reorderRuleId. The UI today reaches into
      // reorderService via a different entry; the SDK flag-OFF
      // path surfaces a clear error so Task 11b can either (a)
      // flip the flag for the row button, or (b) call the legacy
      // path directly. Matches the scope note above.
      throw new Error(
        "reorder createPo flag-OFF path not wired; flip NEXT_PUBLIC_USE_RUST_PROCUREMENT=true for this surface or call reorderService directly"
      )
    }
    const res = await rfClient.POST("/api/v2/reorder-rules/{id}/create-po", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async createIndividualPos(body: CreateReorderPoBatchBody): Promise<ReorderPoReceiptDto[]> {
    if (!isRustBackendEnabled()) {
      throw new Error(
        "reorder createIndividualPos flag-OFF path not wired; flip the flag or call the legacy handler"
      )
    }
    const res = await rfClient.POST("/api/v2/reorder-rules/create-pos", {
      body,
    })
    return unwrap(res)
  },
  async createBulkPo(body: CreateReorderPoBulkBody): Promise<ReorderPoReceiptDto> {
    if (!isRustBackendEnabled()) {
      throw new Error(
        "reorder createBulkPo flag-OFF path not wired; flip the flag or call the legacy handler"
      )
    }
    const res = await rfClient.POST("/api/v2/reorder-rules/create-bulk-po", {
      body,
    })
    return unwrap(res)
  },
}

// ---------------------------------------------------------------
// CSV / reviewed-rows inventory import
// ---------------------------------------------------------------

export const importRolls = {
  /** Commit reviewed rows from the dedicated import page. */
  async uploadJson(body: ImportRollsBody): Promise<ImportReceiptDto> {
    if (!isRustBackendEnabled()) {
      // Legacy uses `csvService.uploadRolls(rolls)` with the full
      // Roll shape, NOT the reviewed-row shape. The dedicated
      // review page converts rows to Partial<Roll> before calling.
      // For SDK parity we mirror that: pass the rows through as
      // Partial<Roll>s and let legacy handle the insert.
      const result = await legacyCsv.uploadRolls(
        body.rows as unknown as Parameters<typeof legacyCsv.uploadRolls>[0]
      )
      return {
        imported: result.count ?? 0,
        skipped: 0,
        errors: result.error ? [{ row_number: 0, message: result.error }] : [],
      }
    }
    const res = await rfClient.POST("/api/v2/import/rolls", { body })
    return unwrap(res)
  },
  /** Upload raw CSV bytes from the main inventory page quick-upload. */
  async uploadCsv(file: File): Promise<ImportReceiptDto> {
    if (!isRustBackendEnabled()) {
      const csvText = await file.text()
      const rows = legacyCsv.parseCSV(csvText)
      const rollPartials = legacyCsv.transformToRolls(rows)
      const result = await legacyCsv.uploadRolls(rollPartials)
      return {
        imported: result.count ?? 0,
        skipped: 0,
        errors: result.error ? [{ row_number: 0, message: result.error }] : [],
      }
    }
    const res = await fetch("/api/v2/import/rolls/csv", {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: file,
    })
    if (!res.ok) {
      // Match the `unwrap` contract the rest of the SDK uses:
      // populate `err.code` from the JSON body when the server
      // returned a structured conflict code, so UI code can
      // discriminate consistently (`err.code === "CHECK_VIOLATION"`
      // etc.) regardless of which SDK method threw.
      const text = await res.text()
      let code: string | undefined
      try {
        const parsed = JSON.parse(text) as { code?: string }
        if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
          code = parsed.code
        }
      } catch {
        // Non-JSON body — fall through without .code.
      }
      const message = code ?? `${res.status} ${res.statusText || "request failed"}`
      const err = new Error(message) as Error & {
        code?: string
        status: number
      }
      if (code) err.code = code
      err.status = res.status
      throw err
    }
    return (await res.json()) as ImportReceiptDto
  },
}

// ---------------------------------------------------------------
// Tax preview
// ---------------------------------------------------------------

export const tax = {
  async preview(supplierId: string, subtotal: number): Promise<TaxPreviewDto> {
    if (!isRustBackendEnabled()) {
      const calc = await legacyTax.calculatePurchaseOrderTax(supplierId, subtotal)
      return {
        tax_amount: calc.taxAmount,
        tax_rate: calc.taxRate,
        tax_level: calc.taxLevel,
        tax_name: calc.taxName,
      }
    }
    const res = await rfClient.GET("/api/v2/po/tax/preview", {
      params: { query: { supplier_id: supplierId, subtotal } },
    })
    return unwrap(res)
  },
}
