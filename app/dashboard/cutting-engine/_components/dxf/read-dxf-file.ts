// Browser adapter: convert a DOM `File` into our domain `DxfDocument`.
// Keeps `File` (DOM-only) at the framework boundary so the underlying
// `parseDxf` module stays Node/test-runnable.

import { parseDxf } from "@/src/application/cad/parse-dxf"
import type { DxfDocument } from "@/src/application/cad/dxf-types"

export async function readDxfFile(file: File): Promise<DxfDocument> {
  const text = await file.text()
  return parseDxf(text)
}
