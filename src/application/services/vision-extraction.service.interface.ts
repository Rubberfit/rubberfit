import type { VisionExtractionResponse } from "@/app/dashboard/cut-planner/_components/upload-types"

export interface IVisionExtractionService {
  extractFromImage(file: File): Promise<VisionExtractionResponse>
}
