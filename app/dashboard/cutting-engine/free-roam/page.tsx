"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { toast } from "sonner"

import { PageHeader, PageShell } from "@/app/components/patterns"
import type { PartTemplate } from "../_components/PresetDimensionSelector"
import type { StockConfig } from "../_components/stock-preview-configurator"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Free-roam nester — CAD-style manual part placement. Lives on its
 * own route so the pre-selection chrome (stock preview, preset
 * dimension selector, cut-list upload) that Auto nest requires is
 * absent — Free roam builds its own UI inside the three-column
 * workspace (parts added via the queue panel, stock editor lives in
 * the Saved-layouts rail, canvas is the CAD surface).
 */

// Lazy-load the CAD shell — Konva + react-konva are heavy and the
// dashboard shouldn't pull them in until the operator actually
// lands on this page.
const FreeRoamContent = dynamic(() => import("../_components/free-roam-content"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
      Loading free-roam workspace…
    </div>
  ),
})

const DEFAULT_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "",
  thickness: 0.5,
}

// Sample parts seeded so the operator has something to click-place
// on a fresh visit. Replaced by real part entry (CSV upload + manual
// dialog) in a later commit.
const SEED_PARTS: PartTemplate[] = [
  {
    id: "seed-rect-24x12",
    label: '24" × 12"',
    summary: "Rectangle",
    partType: "rectangle",
    width: 24,
    length: 12,
    quantity: 4,
  } as PartTemplate,
  {
    id: "seed-rect-18x18",
    label: '18" × 18"',
    summary: "Rectangle",
    partType: "rectangle",
    width: 18,
    length: 18,
    quantity: 2,
  } as PartTemplate,
  {
    id: "seed-disc-10",
    label: '⌀ 10"',
    summary: "Disc",
    partType: "cylinder",
    diameter: 10,
    quantity: 3,
  } as PartTemplate,
]

export default function FreeRoamPage() {
  const [parts, setParts] = useState<PartTemplate[]>(SEED_PARTS)
  const [stock, setStock] = useState<StockConfig>(DEFAULT_STOCK)
  const [cutListRefreshKey, setCutListRefreshKey] = useState(0)

  const handleCutRecorded = () => setCutListRefreshKey((k) => k + 1)

  const handleLoadCut = (_cut: CutHistory) => {
    // Loading a previously-recorded cut into the Free-roam canvas
    // needs manual-placement reconstruction; wired alongside C14.
    toast.message("Loading cuts into Free roam lands in C14.")
  }

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Cutting Engine", href: "/dashboard/cutting-engine" },
          { label: "Free roam" },
        ]}
        title="Free roam · Beta"
        subtitle="Manually author a layout — drag parts onto the sheet, snap to grid, rotate, commit as a cut. Same reusable-offcut (amber) and waste (red) semantics as Auto nest."
      />

      <FreeRoamContent
        parts={parts}
        onPartsChange={setParts}
        stock={stock}
        onStockChange={setStock}
        refreshKey={cutListRefreshKey}
        onLoadCut={handleLoadCut}
        onCutRecorded={handleCutRecorded}
      />
    </PageShell>
  )
}
