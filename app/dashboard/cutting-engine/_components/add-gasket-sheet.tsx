// app/dashboard/cutting-engine/_components/add-gasket-sheet.tsx
"use client"

import { useState, useCallback, useMemo } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Separator } from "@/app/components/ui/separator"
import { UploadCloud } from "lucide-react"
import { GasketPreviewSvg } from "./gasket-preview-svg"
import { gasketSpecToPartTemplate } from "./gasket-template"
import type { GasketSpec } from "./gasket-template"

interface AddGasketSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (spec: GasketSpec, quantity: number, partNumber?: string) => void
  onImportDxf: () => void
  onImportSvg: () => void
}

export function AddGasketSheet({
  open,
  onOpenChange,
  onAdd,
  onImportDxf,
  onImportSvg,
}: AddGasketSheetProps) {
  const [activeTab, setActiveTab] = useState("ring")
  const [quantity, setQuantity] = useState(1)
  const [partNumber, setPartNumber] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Ring form state
  const [ringOd, setRingOd] = useState<string>("")
  const [ringId, setRingId] = useState<string>("")

  // Full-face form state
  const [fullFaceOd, setFullFaceOd] = useState<string>("")
  const [fullFaceBoreId, setFullFaceBoreId] = useState<string>("")
  const [fullFaceBcd, setFullFaceBcd] = useState<string>("")
  const [fullFaceBoltCount, setFullFaceBoltCount] = useState<string>("")
  const [fullFaceBoltHoleDiameter, setFullFaceBoltHoleDiameter] = useState<string>("")

  // Obround form state
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
    } catch {
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

  const previewPolygon = useMemo(() => {
    if (!previewSpec) return null
    try {
      const template = gasketSpecToPartTemplate(previewSpec)
      return template.polygon ?? null
    } catch {
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
    } catch {
      return false
    }
  }, [previewSpec])

  const handleSubmit = useCallback(() => {
    const spec = buildSpec()
    if (!spec) {
      setError("Invalid gasket parameters")
      return
    }
    try {
      gasketSpecToPartTemplate(spec)
      onAdd(spec, quantity, partNumber || undefined)
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid gasket parameters")
    }
  }, [buildSpec, quantity, partNumber, onAdd, onOpenChange, resetForm])

  const handleImportDxf = useCallback(() => {
    onOpenChange(false)
    onImportDxf()
  }, [onOpenChange, onImportDxf])

  const handleImportSvg = useCallback(() => {
    onOpenChange(false)
    onImportSvg()
  }, [onOpenChange, onImportSvg])

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value)
      setError(null)
    },
    []
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-4xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Add gasket</SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="ring">Ring</TabsTrigger>
            <TabsTrigger value="full-face">Full-face</TabsTrigger>
            <TabsTrigger value="obround">Obround</TabsTrigger>
            <TabsTrigger value="import-cad">Import CAD</TabsTrigger>
          </TabsList>

          <TabsContent value="ring" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ring-od">Outer diameter (OD)</Label>
                  <div className="relative">
                    <Input
                      id="ring-od"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.000"
                      value={ringOd}
                      onChange={(e) => {
                        setRingOd(e.target.value)
                        setError(null)
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ″
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ring-id">Inner diameter (ID)</Label>
                  <div className="relative">
                    <Input
                      id="ring-id"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.000"
                      value={ringId}
                      onChange={(e) => {
                        setRingId(e.target.value)
                        setError(null)
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ″
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
                {previewPolygon ? (
                  <GasketPreviewSvg
                    polygon={previewPolygon}
                    variant="preview"
                    labels={previewLabels}
                    className="w-full h-48"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Enter dimensions to preview</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="full-face" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Outer dimensions</div>
                  <div className="space-y-2">
                    <Label htmlFor="full-face-od">Outer diameter (OD)</Label>
                    <div className="relative">
                      <Input
                        id="full-face-od"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.000"
                        value={fullFaceOd}
                        onChange={(e) => {
                          setFullFaceOd(e.target.value)
                          setError(null)
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ″
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full-face-bore">Bore ID</Label>
                    <div className="relative">
                      <Input
                        id="full-face-bore"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.000"
                        value={fullFaceBoreId}
                        onChange={(e) => {
                          setFullFaceBoreId(e.target.value)
                          setError(null)
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ″
                      </span>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="text-sm font-medium">Bolt pattern</div>
                  <div className="space-y-2">
                    <Label htmlFor="full-face-bcd">Bolt circle diameter (BCD)</Label>
                    <div className="relative">
                      <Input
                        id="full-face-bcd"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.000"
                        value={fullFaceBcd}
                        onChange={(e) => {
                          setFullFaceBcd(e.target.value)
                          setError(null)
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ″
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full-face-bolt-count">Bolt count</Label>
                    <Input
                      id="full-face-bolt-count"
                      type="number"
                      min="2"
                      max="32"
                      step="1"
                      placeholder="4"
                      value={fullFaceBoltCount}
                      onChange={(e) => {
                        setFullFaceBoltCount(e.target.value)
                        setError(null)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full-face-bolt-hole">Bolt-hole diameter</Label>
                    <div className="relative">
                      <Input
                        id="full-face-bolt-hole"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.000"
                        value={fullFaceBoltHoleDiameter}
                        onChange={(e) => {
                          setFullFaceBoltHoleDiameter(e.target.value)
                          setError(null)
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ″
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
                {previewPolygon ? (
                  <GasketPreviewSvg
                    polygon={previewPolygon}
                    variant="preview"
                    labels={previewLabels}
                    className="w-full h-48"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Enter dimensions to preview</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="obround" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="obround-length">Length</Label>
                  <div className="relative">
                    <Input
                      id="obround-length"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.000"
                      value={obroundLength}
                      onChange={(e) => {
                        setObroundLength(e.target.value)
                        setError(null)
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ″
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="obround-width">Width</Label>
                  <div className="relative">
                    <Input
                      id="obround-width"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.000"
                      value={obroundWidth}
                      onChange={(e) => {
                        setObroundWidth(e.target.value)
                        setError(null)
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ″
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
                {previewPolygon ? (
                  <GasketPreviewSvg
                    polygon={previewPolygon}
                    variant="preview"
                    labels={previewLabels}
                    className="w-full h-48"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Enter dimensions to preview</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="import-cad" className="mt-4">
            <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-muted-foreground/25 rounded-lg">
              <UploadCloud className="text-muted-foreground h-8 w-8 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground text-center mb-6">
                Import a DXF or SVG to review and queue.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleImportDxf}>
                  Select DXF
                </Button>
                <Button variant="outline" onClick={handleImportSvg}>
                  Select SVG
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="text-sm text-destructive mt-4">{error}</div>
        )}

        <div className="border-t pt-4 mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="space-y-1">
              <Label htmlFor="quantity" className="text-xs">
                Quantity
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="999"
                defaultValue="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))}
                className="w-24"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="part-number" className="text-xs">
                Part number (optional)
              </Label>
              <Input
                id="part-number"
                type="text"
                placeholder="PN-001"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Add to queue
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
