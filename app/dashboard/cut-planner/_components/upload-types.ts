export type ExtractedPartType = "rectangle" | "cylinder" | "cone" | "trapezoid"

export interface ExtractedPart {
  partType: ExtractedPartType
  quantity: number
  partNumber?: string
  confidence: number
  // Rectangle
  width?: number
  length?: number
  // Cylinder + Trapezoid share `height`
  diameter?: number
  height?: number
  // Cone
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
  // Trapezoid
  topWidth?: number
  bottomWidth?: number
  // Carried by the rectangle parser when a "Stock Width" hint is found on the sheet.
  stockWidth?: number
}

export interface VisionExtractionResponse {
  parts: ExtractedPart[]
  warnings: string[]
  stockWidth?: number
}

export type UploadStatus = "idle" | "uploading" | "processing" | "review" | "error"

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])

const SPREADSHEET_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
])

export function isImageFile(file: File): boolean {
  return IMAGE_MIMES.has(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name)
}

export function isSpreadsheetFile(file: File): boolean {
  return SPREADSHEET_MIMES.has(file.type) || /\.(xlsx?|csv)$/i.test(file.name)
}

export const ACCEPTED_FILE_TYPES = [...IMAGE_MIMES, ...SPREADSHEET_MIMES].join(",")

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/** Human-readable dimension label for a given extracted part — used in the review dialog. */
export function describeExtractedPart(part: ExtractedPart): string {
  switch (part.partType) {
    case "rectangle":
      return `${part.width ?? 0}" × ${part.length ?? 0}"`
    case "cylinder":
      return `Ø${part.diameter ?? 0}" × ${part.height ?? 0}"`
    case "cone":
      return `${part.innerRadius ?? 0}" → ${part.outerRadius ?? 0}" @ ${part.arcDegrees ?? 0}°`
    case "trapezoid":
      return `${part.topWidth ?? 0}"/${part.bottomWidth ?? 0}" × ${part.height ?? 0}"`
  }
}
