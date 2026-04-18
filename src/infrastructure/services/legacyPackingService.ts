import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type {
  PackRequest,
  PackResult,
  PackProgress,
} from "@/src/application/packing/types"

@injectable()
export class LegacyPackingService implements IPackingService {
  async pack(
    _request: PackRequest,
    _onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    throw new Error("LegacyPackingService.pack: not implemented (Phase 3 wiring pending)")
  }

  async cancel(_jobId: string): Promise<void> {
    throw new Error("LegacyPackingService.cancel: not implemented (Phase 3 wiring pending)")
  }
}
