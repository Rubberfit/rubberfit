import type { PackRequest, PackResult } from "@/src/application/packing/types"

export interface IPackingService {
  pack(request: PackRequest): Promise<PackResult>
}

export const PACKING_TOKENS = {
  IPackingService: Symbol.for("IPackingService"),
} as const
