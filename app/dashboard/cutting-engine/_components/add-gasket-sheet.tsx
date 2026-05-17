// app/dashboard/cutting-engine/_components/add-gasket-sheet.tsx
"use client"

import { useCallback, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { UploadCloud } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Separator } from "@/app/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import type { PolygonWithHoles } from "@/src/application/packing/types"

import { GASKET_EXAMPLES, type GasketExample } from "./gasket-examples"
import { GasketPreviewSvg } from "./gasket-preview-svg"
import { gasketSpecToPartTemplate, type GasketSpec } from "./gasket-template"
import { useAddGasketForm } from "./use-add-gasket-form"

// Lazy-load the 3D preview so three.js + R3F + drei ship in their own
// chunk and only load when the operator opens the Sheet. The 2D SVG
// preview doubles as the loading fallback (covers chunk-load + any
// WebGL initialization failure). Codex finding #3 + #6 on the 3D
// review at .claude/handoff/pr-c-3d-preview-codex-result.md.
const GasketPreview3D = dynamic(
  () => import("./gasket-preview-3d").then((m) => m.GasketPreview3D),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted/30 flex h-72 w-full items-center justify-center rounded-lg p-4">
        <div className="text-muted-foreground text-sm">Loading 3D preview…</div>
      </div>
    ),
  }
)

interface AddGasketSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (spec: GasketSpec, quantity: number, partNumber?: string) => void
  onImportDxf: () => void
  onImportSvg: () => void
  /** Stock thickness in inches — drives the 3D extrusion depth. */
  stockThicknessIn: number
  /**
   * Which tab should be focused when the sheet opens. Resets to this
   * tab on every `open` → true transition so the "Import CAD" button
   * lands on the right tab instead of whichever was last viewed.
   * Defaults to "ring".
   */
  initialTab?: "ring" | "full-face" | "obround" | "import-cad" | "examples"
}

interface PreviewPaneProps {
  polygon: PolygonWithHoles | null
  labels: string[]
  thicknessIn: number
}

function PreviewPane({ polygon, labels, thicknessIn }: PreviewPaneProps) {
  // Empty state — render the 3D component anyway so it shows its own
  // ghost-cylinder placeholder per the Kimi spec, and so the chunk
  // pre-loads on first open instead of waiting for the operator to
  // type valid dimensions.
  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <GasketPreview3D
        polygon={polygon}
        thicknessIn={thicknessIn}
        labels={labels}
        className="aspect-[4/3] h-56 w-full md:h-72"
      />
    </div>
  )
}

// Kept exported so the queue card thumbnail (in gasket-shape-card.tsx)
// continues to use the 2D SVG renderer — 3D at 48px adds no value.
// Also acts as the test-friendly fallback for snapshot tests that
// can't paint WebGL in jsdom.
export { GasketPreviewSvg }

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

interface FullFaceTabContentProps {
  form: ReturnType<typeof useAddGasketForm>
  stockThicknessIn: number
}

function FullFaceTabContent({ form, stockThicknessIn }: FullFaceTabContentProps) {
  return (
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
      <PreviewPane
        polygon={form.previewPolygon}
        labels={form.previewLabels}
        thicknessIn={stockThicknessIn}
      />
    </div>
  )
}

interface ExampleCardProps {
  example: GasketExample
  onAdd: (spec: GasketSpec, quantity: number, partNumber?: string) => void
  onClose: () => void
}

function ExampleCard({ example, onAdd, onClose }: ExampleCardProps) {
  // `polygon` is technically optional on PartTemplate, but
  // `gasketSpecToPartTemplate` always returns one for ring/full-face/obround
  // kinds. Memo + null-guard keeps TS happy and avoids re-tessellating on
  // every render.
  const polygon = useMemo(() => {
    return gasketSpecToPartTemplate(example.spec).polygon ?? null
  }, [example.spec])

  const handleClick = useCallback(() => {
    onAdd(example.spec, 1)
    onClose()
  }, [onAdd, onClose, example.spec])

  if (!polygon) return null

  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <div className="bg-background/80 flex items-center justify-center rounded-md p-3">
        <GasketPreviewSvg polygon={polygon} variant="thumbnail" className="h-24 w-auto" />
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-semibold">{example.name}</h3>
        <p className="text-muted-foreground text-xs">{example.standard}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{example.description}</p>
      </div>
      <Button
        onClick={handleClick}
        className="mt-3 w-full bg-orange-500 text-white hover:bg-orange-600"
        size="sm"
      >
        Add to queue
      </Button>
    </div>
  )
}

export function AddGasketSheet({
  open,
  onOpenChange,
  onAdd,
  onImportDxf,
  onImportSvg,
  stockThicknessIn,
  initialTab = "ring",
}: AddGasketSheetProps) {
  const form = useAddGasketForm()

  // Reset to the requested tab on each open. The "Import CAD" button
  // in the parts queue passes `initialTab="import-cad"` so the
  // operator lands on the import flow directly instead of whichever
  // tab was last viewed (CodeRabbit finding #1+#2).
  useEffect(() => {
    if (open) form.setActiveTab(initialTab)
    // form.setActiveTab is stable (useCallback in the hook); only
    // `open` + `initialTab` should drive the reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab])

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

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

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
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="ring">Ring</TabsTrigger>
              <TabsTrigger value="full-face">Full-face</TabsTrigger>
              <TabsTrigger value="obround">Obround</TabsTrigger>
              <TabsTrigger value="import-cad">Import CAD</TabsTrigger>
              <TabsTrigger value="examples">Examples</TabsTrigger>
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
                <PreviewPane
                  polygon={form.previewPolygon}
                  labels={form.previewLabels}
                  thicknessIn={stockThicknessIn}
                />
              </div>
            </TabsContent>

            <TabsContent value="full-face" className="mt-4">
              <FullFaceTabContent form={form} stockThicknessIn={stockThicknessIn} />
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
                <PreviewPane
                  polygon={form.previewPolygon}
                  labels={form.previewLabels}
                  thicknessIn={stockThicknessIn}
                />
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

            <TabsContent value="examples" className="mt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {GASKET_EXAMPLES.map((example) => (
                  <ExampleCard
                    key={example.id}
                    example={example}
                    onAdd={onAdd}
                    onClose={handleClose}
                  />
                ))}
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
