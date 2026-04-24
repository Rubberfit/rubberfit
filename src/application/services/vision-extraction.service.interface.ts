import type { VisionExtractionResponse } from "@/src/application/vision/types"

export interface IVisionExtractionService {
  extractFromImage(file: File): Promise<VisionExtractionResponse>
}
