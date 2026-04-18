export interface ExtractedPart {
  width: number
  length: number
  quantity: number
  partNumber?: string
  confidence: number
  stockWidth?: number
}

export interface VisionExtractionResponse {
  parts: ExtractedPart[]
  warnings: string[]
  stockWidth?: number
}
