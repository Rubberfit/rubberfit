"use client"

import { useEffect, useState } from "react"
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
  return `${part} — ${stock} ×${cut.cut_amount} — ${date}`
}

export function RecordedCutSelect({ onLoad }: RecordedCutSelectProps) {
  const [cuts, setCuts] = useState<CutHistoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [histResult, favResult] = await Promise.allSettled([
          fetchJson<{ data: CutHistory[] }>("/api/cuts/history?limit=50"),
          fetchJson<{ data: number[] }>("/api/cuts/favorites"),
        ])

        const history =
          histResult.status === "fulfilled" ? (histResult.value.data ?? []) : []
        const favIds = new Set<number>(
          favResult.status === "fulfilled" ? favResult.value.data : []
        )

        const merged = history
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
  }, [])

  const favorites = cuts.filter((c) => c.isFavorite)
  const recent = cuts.filter((c) => !c.isFavorite)
  const isEmpty = !isLoading && cuts.length === 0

  function handleValueChange(value: string) {
    const cut = cuts.find((c) => c.id === Number(value))
    if (cut) onLoad(cut)
  }

  return (
    <Select onValueChange={handleValueChange} disabled={isLoading || isEmpty}>
      <SelectTrigger className="w-72">
        <SelectValue
          placeholder={
            isLoading
              ? "Loading cuts…"
              : isEmpty
                ? "No recorded cuts yet"
                : "Load previous cut…"
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
