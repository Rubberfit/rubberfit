"use client"

import { useCallback, useMemo, useState } from "react"

import type { PolygonWithHoles } from "@/src/application/packing/types"

import { gasketSpecToPartTemplate, type GasketSpec } from "./gasket-template"

/**
 * Form state + spec-builder + preview-derivation for AddGasketSheet.
 *
 * Extracted from the TSX so the component file stays under the 500-line
 * cap (CLAUDE.md component patterns). The hook owns:
 *   - per-tab string field state (Ring / Full-face / Obround)
 *   - shared footer state (quantity, partNumber, top-level error)
 *   - buildSpec() — string fields → GasketSpec | null
 *   - previewSpec / previewPolygon / previewLabels / isValid memos
 *   - handleSubmit + handleTabChange + resetForm
 *
 * The TSX consumes this hook and only owns the JSX layout + the
 * inline field event handlers.
 */
export interface AddGasketFormState {
  activeTab: string
  setActiveTab: (tab: string) => void
  quantity: number
  setQuantity: (q: number) => void
  partNumber: string
  setPartNumber: (pn: string) => void
  error: string | null
  setError: (err: string | null) => void

  // Ring
  ringOd: string
  setRingOd: (v: string) => void
  ringId: string
  setRingId: (v: string) => void

  // Full-face
  fullFaceOd: string
  setFullFaceOd: (v: string) => void
  fullFaceBoreId: string
  setFullFaceBoreId: (v: string) => void
  fullFaceBcd: string
  setFullFaceBcd: (v: string) => void
  fullFaceBoltCount: string
  setFullFaceBoltCount: (v: string) => void
  fullFaceBoltHoleDiameter: string
  setFullFaceBoltHoleDiameter: (v: string) => void

  // Obround
  obroundLength: string
  setObroundLength: (v: string) => void
  obroundWidth: string
  setObroundWidth: (v: string) => void

  previewPolygon: PolygonWithHoles | null
  previewLabels: string[]
  isValid: boolean

  handleSubmit: (onAdd: AddGasketCallback, onClose: () => void) => void
  handleTabChange: (tab: string) => void
}

export type AddGasketCallback = (spec: GasketSpec, quantity: number, partNumber?: string) => void

export function useAddGasketForm(): AddGasketFormState {
  const [activeTab, setActiveTabState] = useState("ring")
  const [quantity, setQuantity] = useState(1)
  const [partNumber, setPartNumber] = useState("")
  const [error, setError] = useState<string | null>(null)

  const [ringOd, setRingOd] = useState<string>("")
  const [ringId, setRingId] = useState<string>("")

  const [fullFaceOd, setFullFaceOd] = useState<string>("")
  const [fullFaceBoreId, setFullFaceBoreId] = useState<string>("")
  const [fullFaceBcd, setFullFaceBcd] = useState<string>("")
  const [fullFaceBoltCount, setFullFaceBoltCount] = useState<string>("")
  const [fullFaceBoltHoleDiameter, setFullFaceBoltHoleDiameter] = useState<string>("")

  const [obroundLength, setObroundLength] = useState<string>("")
  const [obroundWidth, setObroundWidth] = useState<string>("")

  const resetForm = useCallback(() => {
    setRingOd("")
    setRingId("")
    setFullFaceOd("")
    setFullFaceBoreId("")
    setFullFaceBcd("")
    setFullFaceBoltCount("")
    setFullFaceBoltHoleDiameter("")
    setObroundLength("")
    setObroundWidth("")
    setQuantity(1)
    setPartNumber("")
    setError(null)
  }, [])

  const buildSpec = useCallback((): GasketSpec | null => {
    try {
      switch (activeTab) {
        case "ring": {
          const od = parseFloat(ringOd)
          const id = parseFloat(ringId)
          if (isNaN(od) || isNaN(id) || od <= 0 || id <= 0 || id >= od) return null
          return { kind: "ring", outerDiameter: od, innerDiameter: id }
        }
        case "full-face": {
          const od = parseFloat(fullFaceOd)
          const boreId = parseFloat(fullFaceBoreId)
          const bcd = parseFloat(fullFaceBcd)
          const boltCount = parseInt(fullFaceBoltCount, 10)
          const boltHoleDiameter = parseFloat(fullFaceBoltHoleDiameter)
          if (
            isNaN(od) ||
            isNaN(boreId) ||
            isNaN(bcd) ||
            isNaN(boltCount) ||
            isNaN(boltHoleDiameter) ||
            od <= 0 ||
            boreId <= 0 ||
            boreId >= od ||
            bcd <= 0 ||
            bcd >= od ||
            boltCount < 2 ||
            boltCount > 32 ||
            boltHoleDiameter <= 0
          ) {
            return null
          }
          return {
            kind: "full-face",
            outerDiameter: od,
            boreInnerDiameter: boreId,
            boltCircleDiameter: bcd,
            boltCount,
            boltHoleDiameter,
          }
        }
        case "obround": {
          const length = parseFloat(obroundLength)
          const width = parseFloat(obroundWidth)
          if (isNaN(length) || isNaN(width) || length <= 0 || width <= 0) return null
          return { kind: "obround", length, width }
        }
        default:
          return null
      }
    } catch (_error) {
      // Form validation already gates via isValid; if buildSpec
      // produces invalid inputs the downstream gasketSpecToPartTemplate
      // throw is caught by the isValid useMemo and disables submit.
      return null
    }
  }, [
    activeTab,
    ringOd,
    ringId,
    fullFaceOd,
    fullFaceBoreId,
    fullFaceBcd,
    fullFaceBoltCount,
    fullFaceBoltHoleDiameter,
    obroundLength,
    obroundWidth,
  ])

  const previewSpec = useMemo(() => buildSpec(), [buildSpec])

  const previewPolygon = useMemo<PolygonWithHoles | null>(() => {
    if (!previewSpec) return null
    try {
      const template = gasketSpecToPartTemplate(previewSpec)
      return template.polygon ?? null
    } catch (_error) {
      // Primitive validation throws on geometry inversions — disable
      // the preview rather than crashing the dialog.
      return null
    }
  }, [previewSpec])

  const previewLabels = useMemo(() => {
    if (!previewSpec) return []
    switch (previewSpec.kind) {
      case "ring":
        return [
          `OD = ${previewSpec.outerDiameter.toFixed(3)}″`,
          `ID = ${previewSpec.innerDiameter.toFixed(3)}″`,
        ]
      case "full-face":
        return [
          `OD = ${previewSpec.outerDiameter.toFixed(3)}″`,
          `Bore = ${previewSpec.boreInnerDiameter.toFixed(3)}″`,
          `BCD = ${previewSpec.boltCircleDiameter.toFixed(3)}″`,
          `${previewSpec.boltCount} bolts × ${previewSpec.boltHoleDiameter.toFixed(3)}″`,
        ]
      case "obround":
        return [`L = ${previewSpec.length.toFixed(3)}″`, `W = ${previewSpec.width.toFixed(3)}″`]
      default:
        return []
    }
  }, [previewSpec])

  const isValid = useMemo(() => {
    if (!previewSpec) return false
    try {
      gasketSpecToPartTemplate(previewSpec)
      return true
    } catch (_error) {
      // Same geometry-inversion path as previewPolygon — invalid spec
      // disables submit instead of letting the throw propagate.
      return false
    }
  }, [previewSpec])

  const handleSubmit = useCallback(
    (onAdd: AddGasketCallback, onClose: () => void) => {
      const spec = buildSpec()
      if (!spec) {
        setError("Invalid gasket parameters")
        return
      }
      try {
        gasketSpecToPartTemplate(spec)
        onAdd(spec, quantity, partNumber || undefined)
        resetForm()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid gasket parameters")
      }
    },
    [buildSpec, quantity, partNumber, resetForm]
  )

  const handleTabChange = useCallback((value: string) => {
    setActiveTabState(value)
    setError(null)
  }, [])

  const setActiveTab = useCallback((value: string) => setActiveTabState(value), [])

  return {
    activeTab,
    setActiveTab,
    quantity,
    setQuantity,
    partNumber,
    setPartNumber,
    error,
    setError,
    ringOd,
    setRingOd,
    ringId,
    setRingId,
    fullFaceOd,
    setFullFaceOd,
    fullFaceBoreId,
    setFullFaceBoreId,
    fullFaceBcd,
    setFullFaceBcd,
    fullFaceBoltCount,
    setFullFaceBoltCount,
    fullFaceBoltHoleDiameter,
    setFullFaceBoltHoleDiameter,
    obroundLength,
    setObroundLength,
    obroundWidth,
    setObroundWidth,
    previewPolygon,
    previewLabels,
    isValid,
    handleSubmit,
    handleTabChange,
  }
}
