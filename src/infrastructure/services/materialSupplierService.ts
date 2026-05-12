import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import type { IMaterialSuppliersRepository } from "@/src/application/repositories/material_suppliers.repository.interface"
import type { IMaterialSupplierService } from "@/src/application/services/material-supplier.service.interface"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  type CreateMaterialSupplierProps,
  MaterialSupplier,
} from "@/src/entities/material-supplier"
import type { Money } from "@/src/entities/value-objects/money"
import type { ProfileId } from "@/src/entities/value-objects/id"
import { materialSuppliersRepository } from "@/src/infrastructure/repositories/material-suppliers.repository"
import { TOKENS } from "@/di/tokens"

@injectable()
export class MaterialSupplierService implements IMaterialSupplierService {
  constructor(
    @inject(TOKENS.IMaterialSuppliersRepository)
    private readonly repo: IMaterialSuppliersRepository
  ) {}

  getById(id: string): Promise<MaterialSupplier> {
    return this.repo.findById(id)
  }

  getActiveLinks(): Promise<MaterialSupplier[]> {
    return this.repo.findActive()
  }

  getByMaterialType(materialTypeId: string): Promise<MaterialSupplier[]> {
    return this.repo.findByMaterialType(materialTypeId)
  }

  getBySupplier(supplierId: string): Promise<MaterialSupplier[]> {
    return this.repo.findBySupplier(supplierId)
  }

  getPreferredForMaterialType(materialTypeId: string): Promise<MaterialSupplier | null> {
    return this.repo.findPreferredForMaterialType(materialTypeId)
  }

  createLink(props: CreateMaterialSupplierProps): Promise<MaterialSupplier> {
    const link = MaterialSupplier.create(props)
    return this.repo.insert(link)
  }

  async updateDetails(
    id: string,
    updates: {
      supplierMaterialCode: string | null
      minimumOrderSqm: number
      leadTimeDays: number
      preferredSupplier: boolean
      notes: string | null
    },
    actor: ProfileId
  ): Promise<MaterialSupplier> {
    const link = await this.repo.findById(id)
    link.updateDetails(
      updates.supplierMaterialCode,
      updates.minimumOrderSqm,
      updates.leadTimeDays,
      updates.preferredSupplier,
      updates.notes,
      actor
    )
    return this.repo.update(link)
  }

  async updatePricing(
    id: string,
    newCost: Money,
    newEffectiveDate: Date,
    newExpirationDate: Date | null,
    actor: ProfileId
  ): Promise<MaterialSupplier> {
    const link = await this.repo.findById(id)
    link.updatePricing(newCost, newEffectiveDate, newExpirationDate, actor)
    return this.repo.update(link)
  }

  async updatePricingWindow(
    id: string,
    newEffectiveDate: Date,
    newExpirationDate: Date | null,
    actor: ProfileId
  ): Promise<MaterialSupplier> {
    const link = await this.repo.findById(id)
    link.updatePricingWindow(newEffectiveDate, newExpirationDate, actor)
    return this.repo.update(link)
  }

  async deactivate(id: string, actor: ProfileId): Promise<MaterialSupplier> {
    const link = await this.repo.findById(id)
    link.deactivate(actor)
    return this.repo.update(link)
  }

  async reactivate(id: string, actor: ProfileId): Promise<MaterialSupplier> {
    const link = await this.repo.findById(id)
    link.reactivate(actor)
    return this.repo.update(link)
  }

  async softDelete(id: string, actor: ProfileId): Promise<MaterialSupplier> {
    const link = await this.repo.findById(id)
    link.softDelete(actor)
    return this.repo.update(link)
  }

  async setPreferredForMaterial(
    materialTypeId: string,
    supplierId: string,
    actor: ProfileId
  ): Promise<MaterialSupplier> {
    const links = await this.repo.findByMaterialType(materialTypeId)
    const target = links.find((l) => l.supplierId.value === supplierId)
    if (!target) {
      throw new InvalidEntityError(
        "MaterialSupplier",
        `no material-supplier link exists for material ${materialTypeId} and supplier ${supplierId}`
      )
    }

    // Flip any other preferred(s) off first. Non-atomic — same semantics
    // as the legacy method; a single-transaction wrap is a follow-up.
    for (const link of links) {
      if (link.preferredSupplier && link.id.value !== target.id.value) {
        link.updateDetails(
          link.supplierMaterialCode,
          link.minimumOrderSqm,
          link.leadTimeDays,
          false,
          link.notes,
          actor
        )
        await this.repo.update(link)
      }
    }

    if (!target.preferredSupplier) {
      target.updateDetails(
        target.supplierMaterialCode,
        target.minimumOrderSqm,
        target.leadTimeDays,
        true,
        target.notes,
        actor
      )
      return this.repo.update(target)
    }
    return target
  }
}

/**
 * Module-level singleton bound to the concrete `materialSuppliersRepository`.
 * Browser-side consumers (none today, but the api-client/rf wrappers
 * may swap onto this) get a direct instance; DI-resolved consumers
 * (use-cases, server actions) get a fresh instance via the container.
 */
export const materialSupplierService: IMaterialSupplierService = new MaterialSupplierService(
  materialSuppliersRepository
)
