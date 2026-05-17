"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import type { DxfImportedPart } from "@/src/application/cad/dxf-types"
import { DxfParseError } from "@/src/application/cad/parse-dxf"
import type { SvgImportedPart } from "@/src/application/cad/svg-types"
import { SvgParseError } from "@/src/application/cad/parse-svg"

import {
  type DxfReviewState,
  type SvgReviewState,
  processDxfFile,
  processSvgFile,
} from "./cut-list-upload"
import type { PartTemplate } from "./preset-template-data"

const DXF_ACCEPT = ".dxf,.dwg"
const SVG_ACCEPT = ".svg"

export type CadSourceType = "dxf" | "svg"

interface UseCadImportOptions {
  /**
   * Called when the operator confirms a CAD part in the review dialog.
   * The caller appends the produced PartTemplate to its parts list.
   */
  onAdd: (template: PartTemplate) => void
}

export interface UseCadImportResult {
  /** Live DXF review state — when non-null the host should render a `<DxfReviewDialog>`. */
  dxfReview: DxfReviewState | null
  /** Live SVG review state — when non-null the host should render a `<SvgReviewDialog>`. */
  svgReview: SvgReviewState | null
  /** Open the OS file picker for `.dxf`/`.dwg` files. */
  pickDxf: () => void
  /** Open the OS file picker for `.svg` files. */
  pickSvg: () => void
  /** Confirm a parsed DXF part — appends it to the host's parts list. */
  confirmDxf: (part: DxfImportedPart) => void
  /** Confirm a parsed SVG part — appends it to the host's parts list. */
  confirmSvg: (part: SvgImportedPart) => void
  /** Dismiss the DXF dialog without confirming. */
  cancelDxf: () => void
  /** Dismiss the SVG dialog without confirming. */
  cancelSvg: () => void
}

/**
 * Shared CAD-import flow: file picker → existing
 * `processDxfFile` / `processSvgFile` parser → review dialog state →
 * confirmed `PartTemplate`. Used by gasket-cutting today; the
 * cutting-engine auto-nest page (`app/dashboard/cutting-engine/page.tsx`)
 * still has its own inline copy of the same flow — that extraction is
 * deferred to a polish PR per the PR B follow-up list.
 *
 * Units are converted mm → inches at confirm-time so downstream math
 * (preset-utils area, bin estimator, packing) operates in inches —
 * mirrors the inline transform at `cutting-engine/page.tsx:387-423`.
 */
export function useCadImport(options: UseCadImportOptions): UseCadImportResult {
  const { onAdd } = options
  const [dxfReview, setDxfReview] = useState<DxfReviewState | null>(null)
  const [svgReview, setSvgReview] = useState<SvgReviewState | null>(null)
  // Held in a ref so two rapid clicks don't open two pickers.
  const pickingRef = useRef(false)

  const openPicker = useCallback(async (accept: string): Promise<File | null> => {
    if (pickingRef.current) return null
    pickingRef.current = true
    return new Promise<File | null>((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = accept
      input.onchange = () => {
        pickingRef.current = false
        const file = input.files?.[0] ?? null
        resolve(file)
      }
      // If the dialog is dismissed without picking, the change event
      // never fires. Reset the ref a beat later so the user can
      // re-open. (`focus` on the window after the picker closes is
      // the standard heuristic.)
      const reset = () => {
        pickingRef.current = false
        window.removeEventListener("focus", reset)
      }
      setTimeout(() => window.addEventListener("focus", reset), 100)
      input.click()
    })
  }, [])

  const pickDxf = useCallback(async () => {
    const file = await openPicker(DXF_ACCEPT)
    if (!file) return
    try {
      const review = await processDxfFile(file)
      if (review) setDxfReview(review)
    } catch (err) {
      const message =
        err instanceof DxfParseError
          ? "Could not read this DXF — export as ASCII (not binary) and try again."
          : err instanceof Error
            ? err.message
            : "Failed to process DXF"
      toast.error(message)
    }
  }, [openPicker])

  const pickSvg = useCallback(async () => {
    const file = await openPicker(SVG_ACCEPT)
    if (!file) return
    try {
      const review = await processSvgFile(file)
      if (review) setSvgReview(review)
    } catch (err) {
      const message =
        err instanceof SvgParseError
          ? "Could not read this SVG — check that the file is valid XML."
          : err instanceof Error
            ? err.message
            : "Failed to process SVG"
      toast.error(message)
    }
  }, [openPicker])

  const partToTemplate = useCallback(
    (
      part: DxfImportedPart | SvgImportedPart,
      sourceType: CadSourceType
    ): PartTemplate => {
      // mm → inch at confirm-time. Mirrors cutting-engine/page.tsx
      // handleCadPartConfirmed so downstream packing math sees inches.
      const scale = part.units === "mm" ? 1 / 25.4 : 1
      const inchPolygon: PartTemplate["polygon"] = {
        outer: part.polygon.outer.map((p) => ({ x: p.x * scale, y: p.y * scale })),
        holes: part.polygon.holes.map((hole) =>
          hole.map((p) => ({ x: p.x * scale, y: p.y * scale }))
        ),
      }
      return {
        id: `${sourceType}-${crypto.randomUUID()}`,
        partType: "polygon",
        label: part.partNumber,
        summary: `${sourceType.toUpperCase()}: ${part.sourceFile}`,
        quantity: part.quantity,
        category: "custom",
        polygon: inchPolygon,
        renderShape: "polygon",
        partNumber: part.partNumber,
        sourceFile: part.sourceFile,
        isCustom: true,
      }
    },
    []
  )

  const confirmDxf = useCallback(
    (part: DxfImportedPart) => {
      const template = partToTemplate(part, "dxf")
      onAdd(template)
      setDxfReview(null)
      toast.success(`Added ${part.partNumber} to cut planner.`)
    },
    [onAdd, partToTemplate]
  )

  const confirmSvg = useCallback(
    (part: SvgImportedPart) => {
      const template = partToTemplate(part, "svg")
      onAdd(template)
      setSvgReview(null)
      toast.success(`Added ${part.partNumber} to cut planner.`)
    },
    [onAdd, partToTemplate]
  )

  const cancelDxf = useCallback(() => setDxfReview(null), [])
  const cancelSvg = useCallback(() => setSvgReview(null), [])

  return {
    dxfReview,
    svgReview,
    pickDxf,
    pickSvg,
    confirmDxf,
    confirmSvg,
    cancelDxf,
    cancelSvg,
  }
}
