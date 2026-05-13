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
import { purchaseOrderService as legacyPos } from "@/src/infrastructure/services/purchaseOrderService"
import { legacyReorderService as legacyReorder } from "@/src/infrastructure/services/legacyReorderService"
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
      // Legacy returns PurchaseOrderWithDetails; structure differs
      // enough that call sites branch on flag state. Return the
      // legacy shape via a cast — the UI already consumes it, and
      // the cutover in Task 11 will swap to DTO reads one file at
      // a time.
      const rows = params?.status
        ? await legacyPos.getPurchaseOrdersByStatus(
            params.status as "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled"
          )
        : await legacyPos.getAllPurchaseOrders()
      return rows as unknown as PurchaseOrderDto[]
    }
    const res = await rfClient.GET("/api/v2/po", {
      params: { query: params },
    })
    return unwrap(res)
  },
  async get(id: string): Promise<PurchaseOrderDto | null> {
    if (!isRustBackendEnabled()) {
      const row = await legacyPos.getPurchaseOrderById(id)
      return row as unknown as PurchaseOrderDto
    }
    const res = await rfClient.GET("/api/v2/po/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return unwrap(res)
  },
  async create(body: CreatePurchaseOrderBody): Promise<PurchaseOrderDto> {
    if (!isRustBackendEnabled()) {
      const row = await legacyPos.createPurchaseOrder(
        body as unknown as Parameters<typeof legacyPos.createPurchaseOrder>[0]
      )
      return row as unknown as PurchaseOrderDto
    }
    const res = await rfClient.POST("/api/v2/po", { body })
    return unwrap(res)
  },
  async update(id: string, body: UpdatePurchaseOrderBody): Promise<PurchaseOrderDto> {
    if (!isRustBackendEnabled()) {
      const row = await legacyPos.updatePurchaseOrder(
        id,
        body as unknown as Parameters<typeof legacyPos.updatePurchaseOrder>[1]
      )
      return row as unknown as PurchaseOrderDto
    }
    const res = await rfClient.PUT("/api/v2/po/{id}", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async updateStatus(id: string, body: UpdatePurchaseOrderStatusBody): Promise<PurchaseOrderDto> {
    if (!isRustBackendEnabled()) {
      // Legacy `updatePurchaseOrderStatus(id, status, approvedBy?, notes?)`
      // enforces its own isValidStatusTransition ladder, allowing
      // `ordered → received` but rejecting other → received. That
      // mismatches the Rust-side terminal-via-receive-only
      // invariant (rejects EVERY → received through this path),
      // so flag-OFF can succeed where flag-ON throws
      // RECEIVED_REQUIRES_RECEIVE_FLOW. Acceptable trade-off for
      // the cutover window — flag-ON is the new truth.
      const row = await legacyPos.updatePurchaseOrderStatus(
        id,
        // Legacy takes a narrow union type; cast at the boundary
        // so flag-OFF preserves the existing behavior verbatim.
        body.status as "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled"
      )
      return row as unknown as PurchaseOrderDto
    }
    const res = await rfClient.PUT("/api/v2/po/{id}/status", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async delete(id: string): Promise<void> {
    if (!isRustBackendEnabled()) {
      await legacyPos.deletePurchaseOrder(id)
      return
    }
    const res = await rfClient.DELETE("/api/v2/po/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },
  async receive(id: string, body: ReceivePurchaseOrderBody): Promise<ReceiveReceiptDto> {
    if (!isRustBackendEnabled()) {
      // Legacy `receivePurchaseOrder(id, items, receivedBy?)` has a
      // different item shape (itemId / quantityReceived / rollData
      // camelCase). Convert at the boundary.
      const legacyItems = body.items.map((i) => ({
        itemId: i.item_id,
        quantityReceived: i.quantity_received,
        rollData: i.roll_data
          ? {
              width: i.roll_data.width,
              length: i.roll_data.length,
              thickness: i.roll_data.thickness,
              color: i.roll_data.color,
              location: i.roll_data.location,
            }
          : undefined,
      }))
      const receipt = await legacyPos.receivePurchaseOrder(
        id,
        legacyItems as unknown as Parameters<typeof legacyPos.receivePurchaseOrder>[1]
      )
      return receipt as unknown as ReceiveReceiptDto
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
        // Legacy doesn't expose a standalone items-list call; the
        // detail route embeds items. Pull the PO + extract.
        const row = (await legacyPos.getPurchaseOrderById(po_id)) as unknown as {
          items?: unknown[]
        }
        return (row.items ?? []) as unknown as PurchaseOrderItemDto[]
      }
      const res = await rfClient.GET("/api/v2/po/{po_id}/items", {
        params: { path: { po_id } },
      })
      return unwrap(res)
    },
    async add(po_id: string, body: CreatePurchaseOrderItemBody): Promise<PurchaseOrderItemDto> {
      if (!isRustBackendEnabled()) {
        // Legacy takes a single object that carries
        // purchase_order_id — merge the path segment + body.
        const row = await legacyPos.addItemToPurchaseOrder({
          ...body,
          purchase_order_id: po_id,
        } as unknown as Parameters<typeof legacyPos.addItemToPurchaseOrder>[0])
        return row as unknown as PurchaseOrderItemDto
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
        const row = await legacyPos.updatePurchaseOrderItem(
          item_id,
          body as unknown as Parameters<typeof legacyPos.updatePurchaseOrderItem>[1]
        )
        return row as unknown as PurchaseOrderItemDto
      }
      const res = await rfClient.PUT("/api/v2/po/{po_id}/items/{item_id}", {
        params: { path: { po_id, item_id } },
        body,
      })
      return unwrap(res)
    },
    async delete(po_id: string, item_id: string): Promise<void> {
      if (!isRustBackendEnabled()) {
        await legacyPos.deletePurchaseOrderItem(item_id)
        return
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

export const reorderRules = {
  async list(): Promise<ReorderRuleDto[]> {
    if (!isRustBackendEnabled()) {
      const rows = await legacyReorder.getAllReorderRules()
      return rows as unknown as ReorderRuleDto[]
    }
    const res = await rfClient.GET("/api/v2/reorder-rules")
    return unwrap(res)
  },
  async get(id: string): Promise<ReorderRuleDto | null> {
    if (!isRustBackendEnabled()) {
      try {
        const row = await legacyReorder.getReorderRuleById(id)
        return row as unknown as ReorderRuleDto
      } catch {
        return null
      }
    }
    const res = await rfClient.GET("/api/v2/reorder-rules/{id}", {
      params: { path: { id } },
    })
    if (res.response.status === 404) return null
    return unwrap(res)
  },
  async create(body: CreateReorderRuleBody): Promise<ReorderRuleDto> {
    if (!isRustBackendEnabled()) {
      const row = await legacyReorder.createReorderRule(
        body as unknown as Parameters<typeof legacyReorder.createReorderRule>[0]
      )
      return row as unknown as ReorderRuleDto
    }
    const res = await rfClient.POST("/api/v2/reorder-rules", { body })
    return unwrap(res)
  },
  async update(id: string, body: UpdateReorderRuleBody): Promise<ReorderRuleDto> {
    if (!isRustBackendEnabled()) {
      const row = await legacyReorder.updateReorderRule(
        id,
        body as unknown as Parameters<typeof legacyReorder.updateReorderRule>[1]
      )
      return row as unknown as ReorderRuleDto
    }
    const res = await rfClient.PUT("/api/v2/reorder-rules/{id}", {
      params: { path: { id } },
      body,
    })
    return unwrap(res)
  },
  async delete(id: string): Promise<void> {
    if (!isRustBackendEnabled()) {
      await legacyReorder.deleteReorderRule(id)
      return
    }
    const res = await rfClient.DELETE("/api/v2/reorder-rules/{id}", {
      params: { path: { id } },
    })
    if (!res.response.ok) unwrap(res)
  },
  async suggestions(params?: { include_pending?: boolean }): Promise<ReorderSuggestionDto[]> {
    if (!isRustBackendEnabled()) {
      // Do NOT forward `include_pending` to legacy —
      // `generateReorderSuggestions(includeInactive)` takes a
      // parameter with a completely different meaning ("include
      // inactive MATERIALS", not "include rules already covered
      // by a non-draft PO"). Legacy's pending-suppression happens
      // internally inside `IReorderService.generateReorderSuggestions`.
      // Passing true here would silently widen the result set to
      // disabled materials, breaking parity.
      const rows = await legacyReorder.generateReorderSuggestions()
      return rows as unknown as ReorderSuggestionDto[]
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
