// Dev-only checkbox group rendered alongside the Graph card's title.
// The page mounts two graph variants (rendered vs idle), and both need
// the same toggles — this component is the single source so they can't
// drift. The state itself lives on the page so the toggles persist
// across graph-variant swaps; this component is purely presentational.

import { Checkbox } from "@/app/components/ui/checkbox"

export interface DebugOverlays {
  showAabb: boolean
  showScrapRects: boolean
}

interface DebugOverlayTogglesProps {
  debugOverlays: DebugOverlays
  setDebugOverlays: (updater: (prev: DebugOverlays) => DebugOverlays) => void
}

export function DebugOverlayToggles({
  debugOverlays,
  setDebugOverlays,
}: DebugOverlayTogglesProps) {
  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={debugOverlays.showAabb}
          onCheckedChange={(v) =>
            setDebugOverlays((o) => ({ ...o, showAabb: v === true }))
          }
        />
        Show AABB
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={debugOverlays.showScrapRects}
          onCheckedChange={(v) =>
            setDebugOverlays((o) => ({ ...o, showScrapRects: v === true }))
          }
        />
        Show inscribed scrap rects
      </label>
    </>
  )
}
