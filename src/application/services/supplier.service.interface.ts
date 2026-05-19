import type { CreateSupplierProps, Supplier, SupplierUpdateProps } from "@/src/entities/supplier"
import type { ProfileId } from "@/src/entities/value-objects/id"

/**
 * Supplier aggregate service. All methods return `Supplier` entity
 * instances (never raw rows), and writes accept either the entity's
 * `CreateSupplierProps` or its mutator inputs so callers operate on
 * domain types end-to-end.
 *
 * The material-supplier and supplier-contact aggregates have their
 * own services (or will get them in follow-up migrations). This
 * interface deliberately stays narrow.
 */
export interface ISupplierService {
  /** All non-deleted suppliers, ordered by name. */
  getAllSuppliers(): Promise<Supplier[]>

  /** Non-deleted, active suppliers ordered preferred-first then name. */
  getActiveSuppliers(): Promise<Supplier[]>

  /** Non-deleted, active, preferred suppliers ordered by rating desc, name asc. */
  getPreferredSuppliers(): Promise<Supplier[]>

  /** Loads a supplier by UUID. Throws if not found. */
  getSupplierById(id: string): Promise<Supplier>

  /** Inserts a new supplier. Constructs the entity, validates, persists. */
  createSupplier(props: CreateSupplierProps): Promise<Supplier>

  /** Aggregated bulk-edit. Loads the entity, calls `updateDetails`, persists. */
  updateSupplier(id: string, updates: SupplierUpdateProps, actor: ProfileId): Promise<Supplier>

  /**
   * User-facing "remove" action — flips `isActive` to false. Distinct
   * from `softDeleteSupplier` which is the admin-only terminal state.
   */
  deactivateSupplier(id: string, actor: ProfileId): Promise<Supplier>

  /** Bring a deactivated supplier back. */
  reactivateSupplier(id: string, actor: ProfileId): Promise<Supplier>

  /** Admin-only soft delete. Sets `deleted_at` and leaves FKs intact. */
  softDeleteSupplier(id: string, actor: ProfileId): Promise<Supplier>

  /** Updates the rating field via the entity mutator (1–5 inclusive). */
  updateSupplierRating(id: string, rating: number, actor: ProfileId): Promise<Supplier>

  /** ILIKE search across name / email / notes. */
  searchSuppliers(query: string): Promise<Supplier[]>
}
