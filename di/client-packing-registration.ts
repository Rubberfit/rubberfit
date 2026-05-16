import "reflect-metadata"
import { container } from "tsyringe"

import {
  PACKING_TOKENS,
  type IPackingService,
} from "@/src/application/services/packing.service.interface"
import { ApiPackingService } from "@/src/infrastructure/services/apiPackingService"

let registered = false

export function resolveClientPackingService(): IPackingService {
  if (!registered) {
    container.registerSingleton<IPackingService>(PACKING_TOKENS.IPackingService, ApiPackingService)
    registered = true
  }
  return container.resolve<IPackingService>(PACKING_TOKENS.IPackingService)
}
