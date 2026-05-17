// app/dashboard/cutting-engine/_components/add-gasket-sheet.tsx
"use client"

import { useCallback } from "react"
import { UploadCloud } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Separator } from "@/app/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"

import { GasketPreviewSvg } from "./gasket-preview-svg"
import type { GasketSpec } from "./gasket-template"
import { useAddGasketForm } from "./use-add-gasket-form"

interface AddGasketSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (spec: GasketSpec, quantity: number, partNumber?: string) => void
  onImportDxf: () => void
  onImportSvg: () => void
}

interface PreviewPaneProps {
  polygon: ReturnType<typeof useAddGasketForm>["previewPolygon"]
  labels: string[]
}

function PreviewPane({ polygon, labels }: PreviewPaneProps) {
  return (
    <div className="bg-muted/30 flex items-center justify-center rounded-lg p-4">
      {polygon ? (
        <GasketPreviewSvg
          polygon={polygon}
          variant="preview"
          labels={labels}
          className="h-48 w-full"
        />
      ) : (
        <div className="text-muted-foreground text-sm">Enter dimensions to preview</div>
      )}
    </div>
  )
}

interface DimInputProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  step?: string
  min?: string
  max?: string
  suffix?: string
  placeholder?: string
}

function DimInput({
  id,
  label,
  value,
  onChange,
  step = "0.001",
  min = "0",
  max,
  suffix = "″",
  placeholder = "0.000",
}: DimInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export function AddGasketSheet({
  open,
  onOpenChange,
  onAdd,
  onImportDxf,
  onImportSvg,
}: AddGasketSheetProps) {
  const form = useAddGasketForm()

  const handleImportDxf = useCallback(() => {
    onOpenChange(false)
    onImportDxf()
  }, [onOpenChange, onImportDxf])

  const handleImportSvg = useCallback(() => {
    onOpenChange(false)
    onImportSvg()
  }, [onOpenChange, onImportSvg])

  const submit = useCallback(
    () => form.handleSubmit(onAdd, () => onOpenChange(false)),
    [form, onAdd, onOpenChange]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Add gasket</SheetTitle>
        </SheetHeader>

        {/* Padded body — SheetContent has no internal padding by
            default in shadcn; mirror the invite-teammate-sheet pattern
            so the form sits at 24px from each edge instead of flush
            against the Sheet edge (founder feedback 2026-05-17). */}
        <div className="px-6 pb-6">
          <Tabs value={form.activeTab} onValueChange={form.handleTabChange} className="mt-2">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="ring">Ring</TabsTrigger>
              <TabsTrigger value="full-face">Full-face</TabsTrigger>
              <TabsTrigger value="obround">Obround</TabsTrigger>
              <TabsTrigger value="import-cad">Import CAD</TabsTrigger>
            </TabsList>

            <TabsContent value="ring" className="mt-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <DimInput
                    id="ring-od"
                    label="Outer diameter (OD)"
                    value={form.ringOd}
                    onChange={form.setRingOd}
                  />
                  <DimInput
                    id="ring-id"
                    label="Inner diameter (ID)"
                    value={form.ringId}
                    onChange={form.setRingId}
                  />
                </div>
                <PreviewPane polygon={form.previewPolygon} labels={form.previewLabels} />
              </div>
            </TabsContent>

            <TabsContent value="full-face" className="mt-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Outer dimensions</div>
                    <DimInput
                      id="full-face-od"
                      label="Outer diameter (OD)"
                      value={form.fullFaceOd}
                      onChange={form.setFullFaceOd}
                    />
                    <DimInput
                      id="full-face-bore"
                      label="Bore ID"
                      value={form.fullFaceBoreId}
                      onChange={form.setFullFaceBoreId}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Bolt pattern</div>
                    <DimInput
                      id="full-face-bcd"
                      label="Bolt circle diameter (BCD)"
                      value={form.fullFaceBcd}
                      onChange={form.setFullFaceBcd}
                    />
                    <DimInput
                      id="full-face-bolt-count"
                      label="Bolt count"
                      value={form.fullFaceBoltCount}
                      onChange={form.setFullFaceBoltCount}
                      step="1"
                      min="2"
                      max="32"
                      suffix=""
                      placeholder="4"
                    />
                    <DimInput
                      id="full-face-bolt-hole"
                      label="Bolt-hole diameter"
                      value={form.fullFaceBoltHoleDiameter}
                      onChange={form.setFullFaceBoltHoleDiameter}
                    />
                  </div>
                </div>
                <PreviewPane polygon={form.previewPolygon} labels={form.previewLabels} />
              </div>
            </TabsContent>

            <TabsContent value="obround" className="mt-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <DimInput
                    id="obround-length"
                    label="Length"
                    value={form.obroundLength}
                    onChange={form.setObroundLength}
                  />
                  <DimInput
                    id="obround-width"
                    label="Width"
                    value={form.obroundWidth}
                    onChange={form.setObroundWidth}
                  />
                </div>
                <PreviewPane polygon={form.previewPolygon} labels={form.previewLabels} />
              </div>
            </TabsContent>

            <TabsContent value="import-cad" className="mt-4">
              <div className="border-muted-foreground/25 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-12">
                <UploadCloud className="text-muted-foreground mx-auto mb-4 h-8 w-8" />
                <p className="text-muted-foreground mb-6 text-center text-sm">
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

          {form.error && <div className="text-destructive mt-4 text-sm">{form.error}</div>}

          <div className="mt-6 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="space-y-1">
                <Label htmlFor="quantity" className="text-xs">
                  Quantity
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max="999"
                  value={form.quantity}
                  onChange={(e) =>
                    form.setQuantity(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))
                  }
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
                  value={form.partNumber}
                  onChange={(e) => form.setPartNumber(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={!form.isValid}
                className="bg-orange-500 text-white hover:bg-orange-600"
              >
                Add to queue
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
