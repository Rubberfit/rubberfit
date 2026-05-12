/**
 * @deprecated Legacy raw-row CRUD over `material_types`. Pre-DDD code
 * path retained so the ~30 consumers (action handlers, dashboard pages,
 * api-client/rf wrappers, tests) keep type-checking. The underlying
 * schema (post-redesign) no longer has the stale columns this surface
 * references (`user_id`, `default_cost`, `min_stock_alert`), so most
 * write paths here will fail at runtime against the live DB.
 *
 * **Use `materialTypeService` (entity-typed) for new code.** This shim
 * exists only to unblock the material-type service migration without
 * rewriting every UI surface in the same PR. Follow-up migrations
 * retire it page by page.
 */
export { materialTypeRepository as legacyMaterialTypeService } from "@/src/infrastructure/repositories/material-types.repository"
