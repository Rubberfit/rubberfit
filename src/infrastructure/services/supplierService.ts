import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { ISuppliersRepository } from "@/src/application/repositories/suppliers.repository.interface"
import {
  type CreateSupplierProps,
  Supplier,
  type SupplierUpdateProps,
} from "@/src/entities/supplier"
import type { ProfileId } from "@/src/entities/value-objects/id"
import { suppliersRepository } from "@/src/infrastructure/repositories/suppliers.repository"
import { TOKENS } from "@/di/tokens"

/**
 * Thin orchestrator over `ISuppliersRepository`. Each write path loads
 * the entity, invokes its mutator (which enforces invariants and stamps
 * audit fields), then persists via `repo.update`. New rows are
 * constructed via `Supplier.create(...)` and inserted.
 *
 * Domain errors (`InvalidEntityError`, `InvalidValueObjectError`)
 * propagate unwrapped — the action layer's catch wrappers handle them.
 */
@injectable()
export class SupplierService implements ISupplierService {
  constructor(
    @inject(TOKENS.ISuppliersRepository)
    private readonly repo: ISuppliersRepository
  ) {}

  getAllSuppliers(): Promise<Supplier[]> {
    return this.repo.findAll()
  }

  getActiveSuppliers(): Promise<Supplier[]> {
    return this.repo.findActive()
  }

  getPreferredSuppliers(): Promise<Supplier[]> {
    return this.repo.findPreferred()
  }

  getSupplierById(id: string): Promise<Supplier> {
    return this.repo.findById(id)
  }

  searchSuppliers(query: string): Promise<Supplier[]> {
    return this.repo.search(query)
  }

  createSupplier(props: CreateSupplierProps): Promise<Supplier> {
    const supplier = Supplier.create(props)
    return this.repo.insert(supplier)
  }

  async updateSupplier(
    id: string,
    updates: SupplierUpdateProps,
    actor: ProfileId
  ): Promise<Supplier> {
    const supplier = await this.repo.findById(id)
    supplier.updateDetails(updates, actor)
    return this.repo.update(supplier)
  }

  async deactivateSupplier(id: string, actor: ProfileId): Promise<Supplier> {
    const supplier = await this.repo.findById(id)
    supplier.deactivate(actor)
    return this.repo.update(supplier)
  }

  async reactivateSupplier(id: string, actor: ProfileId): Promise<Supplier> {
    const supplier = await this.repo.findById(id)
    supplier.reactivate(actor)
    return this.repo.update(supplier)
  }

  async softDeleteSupplier(id: string, actor: ProfileId): Promise<Supplier> {
    const supplier = await this.repo.findById(id)
    supplier.softDelete(actor)
    return this.repo.update(supplier)
  }

  /**
   * Rating-only edit. The entity's `updateDetails` mutator covers this
   * field, but always-update-everything would require the caller to
   * pass the entire current snapshot. Instead, build a single-field
   * update from the current supplier state.
   */
  async updateSupplierRating(id: string, rating: number, actor: ProfileId): Promise<Supplier> {
    const supplier = await this.repo.findById(id)
    supplier.updateDetails(
      {
        name: supplier.name,
        addressId: supplier.addressId,
        email: supplier.email,
        generalPhone: supplier.generalPhone,
        website: supplier.website,
        taxId: supplier.taxId,
        taxRate: supplier.taxRate,
        taxExempt: supplier.taxExempt,
        paymentTerms: supplier.paymentTerms,
        shippingCost: supplier.shippingCost,
        rating,
        preferred: supplier.preferred,
        notes: supplier.notes,
      },
      actor
    )
    return this.repo.update(supplier)
  }
}

/**
 * Module-level singleton bound to the concrete `suppliersRepository`.
 * Used by browser-side pages that still call `supplierService.foo()`
 * directly. DI-resolved consumers (server actions, use-cases) get a
 * fresh instance constructed by the container; both share the same
 * underlying repository.
 */
export const supplierService: ISupplierService = new SupplierService(suppliersRepository)
