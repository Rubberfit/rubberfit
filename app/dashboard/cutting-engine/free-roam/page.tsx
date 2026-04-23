"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { toast } from "sonner"

import { PageHeader, PageShell } from "@/app/components/patterns"
import type { PartTemplate } from "../_components/PresetDimensionSelector"
import type { StockConfig } from "../_components/stock-preview-configurator"
import type { SimpleCutMetrics } from "../_components/nesting-visualizer-types"
import type { SimpleCutDirection } from "../_components/NestingVisualizer"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Free-roam nester — CAD-style manual part placement. Lives on its
 * own route so the pre-selection chrome (stock preview, preset
 * dimension selector, cut-list upload) that Auto nest requires is
 * absent — Free roam builds its own UI inside the three-column
 * workspace (parts added via the queue panel, stock sits in the
 * strategy/results panel, canvas is the CAD surface).
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

export default function FreeRoamPage() {
  // Free-roam owns its own state — no sharing with the Auto-nest
  // surface. Parts are added via the queue panel inside the
  // workspace (CSV upload + manual entry in future commits).
  const [parts] = useState<PartTemplate[]>([])
  const [stock] = useState<StockConfig>(DEFAULT_STOCK)
  const [cutDirection, setCutDirection] = useState<SimpleCutDirection>("vertical_split")
  const [customCutRatioInput, setCustomCutRatioInput] = useState("")
  const [cutMetrics] = useState<SimpleCutMetrics | null>(null)
  const [isRecordingCut] = useState(false)
  const [cutListRefreshKey, setCutListRefreshKey] = useState(0)

  const handleRecordCut = () => {
    // Wired in C12 alongside the DB migration that tags manual
    // placements. For now the Cut button is only shown once parts
    // are placed, which will follow when the canvas lands in C11.
    toast.message("Manual cut recording lands in C12.")
    setCutListRefreshKey((k) => k + 1)
  }

  const handleLoadCut = (_cut: CutHistory) => {
    // Loading a previously-recorded cut into the Free-roam canvas
    // needs manual-placement reconstruction; wired alongside C12.
    toast.message("Loading cuts into Free roam lands in C12.")
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
        stock={stock}
        materialTypes={[]}
        activeStockPreset={null}
        selectedTemplate={null}
        selectedTemplates={parts}
        safeQuantity={0}
        cutDirection={cutDirection}
        setCutDirection={setCutDirection}
        customCutRatioInput={customCutRatioInput}
        setCustomCutRatioInput={setCustomCutRatioInput}
        customCutRatios={undefined}
        requestedSqFt={0}
        cutMetrics={cutMetrics}
        onRecordCut={handleRecordCut}
        isRecordingCut={isRecordingCut}
        refreshKey={cutListRefreshKey}
        onLoadCut={handleLoadCut}
      />
    </PageShell>
  )
}
