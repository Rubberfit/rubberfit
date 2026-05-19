import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import type { IMaterialTypeRepository } from "@/src/application/repositories/material_types.repository.interface"
import type { IMaterialTypeService } from "@/src/application/services/material-type.service.interface"
import { type CreateMaterialTypeProps, MaterialType } from "@/src/entities/material-type"
import type { ProfileId } from "@/src/entities/value-objects/id"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"
import { TOKENS } from "@/di/tokens"

@injectable()
export class MaterialTypeService implements IMaterialTypeService {
  constructor(
    @inject(TOKENS.IMaterialTypesRepository)
    private readonly repo: IMaterialTypeRepository
  ) {}

  getAll(): Promise<MaterialType[]> {
    return this.repo.findAll()
  }

  getById(id: string): Promise<MaterialType> {
    return this.repo.findById(id)
  }

  getByIds(ids: string[]): Promise<MaterialType[]> {
    return this.repo.findByIds(ids)
  }

  createMaterialType(props: CreateMaterialTypeProps): Promise<MaterialType> {
    const entity = MaterialType.create(props)
    return this.repo.insert(entity)
  }

  async updateMaterialType(
    id: string,
    updates: {
      name: string
      description: string | null
      minStockSqm: number | null
    },
    actor: ProfileId
  ): Promise<MaterialType> {
    const entity = await this.repo.findById(id)
    entity.updateDetails(updates.name, updates.description, updates.minStockSqm, actor)
    return this.repo.updateEntity(entity)
  }

  async softDeleteMaterialType(id: string, actor: ProfileId): Promise<MaterialType> {
    const entity = await this.repo.findById(id)
    entity.softDelete(actor)
    return this.repo.updateEntity(entity)
  }
}

/**
 * Module-level singleton bound to the concrete `materialTypeRepository`.
 * DI-resolved consumers get a fresh instance via the container; both
 * share the same underlying repository.
 */
export const materialTypeService: IMaterialTypeService = new MaterialTypeService(
  materialTypeRepository
)
