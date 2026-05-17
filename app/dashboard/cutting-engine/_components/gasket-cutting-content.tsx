"use client"

import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"

interface GasketCuttingContentProps {
  parts: PartTemplate[]
  onPartsChange: (parts: PartTemplate[]) => void
  stock: StockConfig
  onStockChange: (stock: StockConfig) => void
  refreshKey: number
  onCutRecorded: () => void
}

/**
 * PR C Commit 4 stub. Kimi-authored three-column shell + add-gasket
 * Sheet + queue card + preview SVG land in Commit 5.
 */
export default function GasketCuttingContent(_props: GasketCuttingContentProps) {
  return (
    <div className="bg-card rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">Gasket cutting · Coming soon</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Parametric ring, full-face, and obround gasket primitives plus CAD import
        land in the next commit.
      </p>
    </div>
  )
}
