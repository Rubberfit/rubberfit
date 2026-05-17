"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import { PageHeader, PageShell } from "@/app/components/patterns"
import type { PartTemplate } from "../_components/PresetDimensionSelector"
import {
  DEFAULT_KERF_IN,
  type StockConfig,
} from "../_components/stock-preview-configurator"

/**
 * Gasket cutting workspace — parametric Ring / Full-face / Obround
 * primitives plus a CAD-import passthrough. Shares the three-column
 * shell, Konva renderer, and manual-layout collision/regions machinery
 * with Free roam (extracted in PR C Commit 1 into _components/
 * manual-layout/), so the visual + interaction language stays
 * continuous between the two manual surfaces.
 */
const GasketCuttingContent = dynamic(
  () => import("../_components/gasket-cutting-content"),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-96 items-center justify-center text-sm">
        Loading gasket-cutting workspace…
      </div>
    ),
  }
)

const DEFAULT_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "",
  thickness: 0.5,
  kerf: DEFAULT_KERF_IN,
}

export default function GasketCuttingPage() {
  const [parts, setParts] = useState<PartTemplate[]>([])
  const [stock, setStock] = useState<StockConfig>(DEFAULT_STOCK)
  const [cutListRefreshKey, setCutListRefreshKey] = useState(0)

  const handleCutRecorded = () => setCutListRefreshKey((k) => k + 1)

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Cutting Engine", href: "/dashboard/cutting-engine" },
          { label: "Gasket cutting" },
        ]}
        title="Gasket cutting · Beta"
        subtitle="Add ring, full-face, and obround gaskets parametrically — or import a CAD file — then drag onto the sheet, snap to grid, save as a cut."
      />

      <GasketCuttingContent
        parts={parts}
        onPartsChange={setParts}
        stock={stock}
        onStockChange={setStock}
        refreshKey={cutListRefreshKey}
        onCutRecorded={handleCutRecorded}
      />
    </PageShell>
  )
}
