import type {
  PackRequest,
  PackResult,
  PackProgress,
} from "@/src/application/packing/types"

export interface IPackingService {
  pack(
    request: PackRequest,
    onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult>

  cancel(jobId: string): Promise<void>
}

export const PACKING_TOKENS = {
  IPackingService: Symbol.for("IPackingService"),
} as const
