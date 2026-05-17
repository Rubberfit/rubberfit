// app/dashboard/cutting-engine/_components/gasket-shape-card.tsx
"use client"

import { X } from "lucide-react"
import { GasketPreviewSvg } from "./gasket-preview-svg"
import type { PartTemplate } from "./preset-template-data"

interface GasketShapeCardProps {
  template: PartTemplate
  tagLetter: string
  placedCount: number
  onClick: () => void
  onRemove: () => void
}

export function GasketShapeCard({
  template,
  tagLetter,
  placedCount,
  onClick,
  onRemove,
}: GasketShapeCardProps) {
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove()
  }

  return (
    <div
      className="group relative border rounded-lg bg-card p-3 shadow-sm hover:ring-2 hover:ring-orange-500/50 cursor-pointer transition-all"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          {template.polygon ? (
            <GasketPreviewSvg
              polygon={template.polygon}
              variant="thumbnail"
              className="h-10 w-10"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-muted-foreground/20" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{template.label}</div>
          {template.partNumber && (
            <div className="text-xs text-muted-foreground">
              PN: {template.partNumber}
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-2 right-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
        {template.quantity}
      </div>

      <div className="absolute bottom-2 left-2 rounded-full bg-orange-500 text-white w-5 h-5 text-[10px] font-bold flex items-center justify-center">
        {tagLetter}
      </div>

      <button
        className="opacity-0 group-hover:opacity-100 absolute top-2 right-12 transition-opacity"
        onClick={handleRemove}
        aria-label="Remove gasket"
        type="button"
      >
        <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  )
}
