import type { Supplier } from "@/src/entities/supplier"

/**
 * Suppliers persistence boundary. Returns entity instances rather
 * than raw rows so callers operate on the domain model. Reads use
 * `rowToSupplier`; writes use `supplierToInsertRow` /
 * `supplierToUpdateRow` to flatten back to columns.
 *
 * The repository owns the suppliers table and nothing else. Joins
 * onto material_suppliers, supplier_contacts, or PO references go
 * through their own repositories.
 */
export interface ISuppliersRepository {
  /** All non-deleted suppliers ordered by name. */
  findAll(): Promise<Supplier[]>

  /** Non-deleted suppliers with `active = true`, ordered by preferred desc, name asc. */
  findActive(): Promise<Supplier[]>

  /** Non-deleted, active, preferred suppliers ordered by rating desc, name asc. */
  findPreferred(): Promise<Supplier[]>

  /**
   * Returns the supplier or throws if no row matches. Soft-deleted rows are
   * returned — callers decide whether to filter by `isDeleted` / `isActive`.
   */
  findById(id: string): Promise<Supplier>

  /** ILIKE search across name, email, and notes. */
  search(query: string): Promise<Supplier[]>

  /** Inserts a new supplier row from the entity snapshot. Returns the rehydrated entity. */
  insert(supplier: Supplier): Promise<Supplier>

  /** Updates an existing supplier row from the entity snapshot. Returns the rehydrated entity. */
  update(supplier: Supplier): Promise<Supplier>
}
