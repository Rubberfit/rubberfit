export type UploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "review"
  | "review-dxf"
  | "review-svg"
  | "error"

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])

const SPREADSHEET_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
])

const DXF_MIMES = new Set(["application/dxf", "image/vnd.dxf"])

const SVG_MIMES = new Set(["image/svg+xml"])

export function isImageFile(file: File): boolean {
  return IMAGE_MIMES.has(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name)
}

export function isSpreadsheetFile(file: File): boolean {
  return SPREADSHEET_MIMES.has(file.type) || /\.(xlsx?|csv)$/i.test(file.name)
}

// Matches BOTH `.dxf` (supported) and `.dwg` (recognized-but-rejected).
// The actual DWG rejection (with the helpful "Save As DXF" toast) lives
// in `processDxfFile` in `cut-list-upload.tsx`. Keeping CAD file
// recognition centralized here means a dropped `.dwg` reaches that
// branch instead of falling through to the generic "Unsupported file
// type" copy.
export function isCadFile(file: File): boolean {
  return DXF_MIMES.has(file.type) || /\.(dxf|dwg)$/i.test(file.name)
}

// SVG carries `image/svg+xml` which would otherwise fall through to
// `isImageFile`'s raster vision-extraction branch. Check this first.
export function isSvgFile(file: File): boolean {
  return SVG_MIMES.has(file.type) || /\.svg$/i.test(file.name)
}

export const ACCEPTED_FILE_TYPES = [
  ...IMAGE_MIMES,
  ...SPREADSHEET_MIMES,
  ...DXF_MIMES,
  ...SVG_MIMES,
  ".dxf",
  ".svg",
].join(",")

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
