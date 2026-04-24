"use client"

import { memo, useCallback, useEffect, useState } from "react"
import { Star } from "lucide-react"
import { format } from "date-fns"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"

interface CutHistoryRow extends CutHistory {
  isFavorite: boolean
}

interface RecordedCutSelectProps {
  onLoad: (cut: CutHistory) => void
  refreshKey?: number
  /**
   * When set, only cuts with a matching `source` appear in the
   * dropdown. Free-roam passes `"manual"` so the Saved-layouts list
   * only surfaces manually-authored layouts; Auto-nest omits the prop
   * to show both (matches pre-C13b behavior).
   */
  sourceFilter?: "manual" | "auto"
  /** Placeholder override — defaults to "Load previous cut…". */
  placeholder?: string
}

const PART_LABELS: Record<number, string> = {
  1: "Rectangle",
  2: "Cylinder Wrap",
  3: "Cone Spread",
  4: "Hopper Panel",
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

function buildOptionLabel(cut: CutHistory): string {
  const part = PART_LABELS[cut.part_id] ?? `Part ${cut.part_id}`
  const stock = `${cut.cut_width}″×${cut.cut_length}″×${cut.cut_thickness}″`
  const date = format(new Date(cut.cut_date), "MMM d, yyyy")
  // Prefix manual cuts so operators can distinguish them from
  // auto-nest rows at a glance when the dropdown mixes both surfaces.
  // Free-roam already filters to source='manual' via the sourceFilter
  // prop — this prefix is the visible tag there too, making the
  // label read as "⚙ Manual — ..." instead of just the part/stock.
  const prefix = cut.source === "manual" ? "⚙ Manual — " : ""
  return `${prefix}${part} — ${stock} ×${cut.cut_amount} — ${date}`
}

function RecordedCutSelectImpl({
  onLoad,
  refreshKey = 0,
  sourceFilter,
  placeholder,
}: RecordedCutSelectProps) {
  const [cuts, setCuts] = useState<CutHistoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [histResult, favResult] = await Promise.allSettled([
          fetchJson<{ data: CutHistory[] }>("/api/cuts/history?limit=50"),
          fetchJson<{ data: number[] }>("/api/cuts/favorites"),
        ])

        const history = histResult.status === "fulfilled" ? (histResult.value.data ?? []) : []
        const favIds = new Set<number>(favResult.status === "fulfilled" ? favResult.value.data : [])

        // Client-side `source` filter — the legacy API doesn't accept
        // a query param for it, so filter here. Cheap relative to the
        // network cost; list is capped at 50 rows anyway.
        const filtered = sourceFilter ? history.filter((c) => c.source === sourceFilter) : history

        const merged = filtered
          .map((c) => ({ ...c, isFavorite: favIds.has(c.id) }))
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
            return new Date(b.cut_date).getTime() - new Date(a.cut_date).getTime()
          })

        setCuts(merged)
      } catch (err) {
        console.error("[RecordedCutSelect] fetch error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [refreshKey, sourceFilter])

  const favorites = cuts.filter((c) => c.isFavorite)
  const recent = cuts.filter((c) => !c.isFavorite)
  const isEmpty = !isLoading && cuts.length === 0

  // Memoize so Radix Select doesn't see a new `onValueChange`
  // identity on every parent re-render — helps avoid internal
  // re-subscribes that can feed a re-render loop when the parent
  // rapidly updates state in response to a selection.
  const handleValueChange = useCallback(
    (value: string) => {
      const cut = cuts.find((c) => c.id === Number(value))
      if (cut) onLoad(cut)
    },
    [cuts, onLoad]
  )

  return (
    <Select onValueChange={handleValueChange} disabled={isLoading || isEmpty}>
      <SelectTrigger className="w-72">
        <SelectValue
          placeholder={
            isLoading
              ? "Loading cuts…"
              : isEmpty
                ? "No recorded cuts yet"
                : (placeholder ?? "Load previous cut…")
          }
        />
      </SelectTrigger>
      <SelectContent>
        {favorites.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-amber-500">
              <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
              Favorites
            </SelectLabel>
            {favorites.map((cut) => (
              <SelectItem key={cut.id} value={String(cut.id)}>
                <span className="flex items-center gap-1.5">
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 stroke-amber-400" />
                  {buildOptionLabel(cut)}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {recent.length > 0 && (
          <SelectGroup>
            <SelectLabel>Recent</SelectLabel>
            {recent.map((cut) => (
              <SelectItem key={cut.id} value={String(cut.id)}>
                {buildOptionLabel(cut)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

// Memoized so a parent re-render storm (Auto-nest's `handleLoadCut`
// cascade) doesn't thrash Radix Select's internal state tracking.
// Props are shallow-compared — all three scalar props (`refreshKey`,
// `sourceFilter`, `placeholder`) are stable, and callers are
// responsible for wrapping `onLoad` in `useCallback`. Without the
// memo, even stable props can't prevent the parent's render-per-setState
// cascade from bubbling a re-render into this subtree, where the
// Radix Trigger ends up as React's "hottest" component and trips
// the 50-render sentinel.
export const RecordedCutSelect = memo(RecordedCutSelectImpl)
