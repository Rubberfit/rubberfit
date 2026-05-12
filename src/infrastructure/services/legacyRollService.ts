/**
 * @deprecated Legacy raw-row CRUD over `rolls`. Pre-DDD code path
 * retained so the ~25 consumers (dashboard pages, action handlers,
 * api-client/rf wrappers, tests, sidebar nav, notifications) keep
 * type-checking against the stale `Roll` row interface.
 *
 * **The underlying schema (post-redesign) no longer has the columns
 * this surface references** (`material_type` text, `cost_per_sqft`,
 * `supplier` text, `is_offcut`, `min_stock_alert`, `part_number`).
 * Methods that read those columns will fail at runtime against the
 * live DB — they predate the redesign and stay broken until each
 * consumer page is rewritten against entity-typed reads.
 *
 * **Use `rollService` (entity-typed) for new code.** This shim exists
 * only to unblock the roll service migration without rewriting every
 * inventory / cutting / dashboard surface in the same PR. Follow-up
 * migrations retire it page by page.
 */
export { rollsRepository as legacyRollService } from "@/src/infrastructure/repositories/rolls.repository"
