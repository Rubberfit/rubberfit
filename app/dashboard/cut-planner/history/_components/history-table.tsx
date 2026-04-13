"use client"

import { format } from "date-fns"
import { Star, Trash2 } from "lucide-react"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { Button } from "@/app/components/ui/button"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Skeleton } from "@/app/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/components/ui/tooltip"

// part_id is 1-based index into PART_OPTIONS
const PART_LABELS: Record<number, string> = {
  1: "Rectangle",
  2: "Cylinder Wrap",
  3: "Cone Spread",
  4: "Hopper Panel",
}

// Summary prefixes written into part_selected_label by the cut planner.
// Stripping them leaves just the dimensional portion for compact display.
const SIZE_LABEL_PREFIXES: Record<number, string> = {
  2: "Cylinder liner wrap ",   // → "Ø18\" × 24\""
  3: "Cone/frustum spread ",   // → "120° • R10\" to R28\""
  4: "Hopper side panel ",     // → "18\" / 24\" × 42\""
}

/** Returns the short (dimensional-only) version of a size label.
 *  The full label is still shown in the tooltip. */
function shortenSizeLabel(label: string, partId: number): string {
  const prefix = SIZE_LABEL_PREFIXES[partId]
  if (prefix && label.startsWith(prefix)) return label.slice(prefix.length)
  return label
}

interface CutHistoryRow extends CutHistory {
  isFavorite: boolean
}

interface HistoryTableProps {
  cuts: CutHistoryRow[]
  isLoading: boolean
  /** Admins / managers — can delete any row */
  canDeleteAll: boolean
  /** Cutter role — can only delete their own rows */
  cutterCanDelete: boolean
  currentUserId: string | null
  onToggleFavorite: (id: number) => void
  onDeleteClick: (id: number) => void
}

/** fab_score is stored as 0–1; display as a rounded percentage. */
function FabScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const variant = score >= 0.8 ? "default" : score >= 0.55 ? "secondary" : "destructive"
  return <Badge variant={variant}>{pct}%</Badge>
}

// ★ | Cut Date | Part | Sizes | Stock | Qty | Pieces | Parts Done | Mat Used | Reuse | Scrap | Fab | [delete]
const BASE_COLS = 12

export function HistoryTable({
  cuts,
  isLoading,
  canDeleteAll,
  cutterCanDelete,
  currentUserId,
  onToggleFavorite,
  onDeleteClick,
}: HistoryTableProps) {
  const showDeleteCol = canDeleteAll || cutterCanDelete
  const colSpan = showDeleteCol ? BASE_COLS + 1 : BASE_COLS

  function rowCanDelete(cut: CutHistoryRow): boolean {
    if (canDeleteAll) return true
    if (cutterCanDelete) return cut.user_id === currentUserId
    return false
  }

  return (
    <div className="overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            {/* star */}
            <TableHead className="w-8 px-2" />
            {/* date */}
            <TableHead className="min-w-[110px]">Cut Date</TableHead>
            {/* part */}
            <TableHead className="min-w-[110px]">Part</TableHead>
            {/* sizes */}
            <TableHead className="w-[190px]">Sizes</TableHead>
            {/* stock */}
            <TableHead className="min-w-[130px] whitespace-nowrap">Stock (W×L×T)</TableHead>
            {/* qty */}
            <TableHead className="text-right min-w-[40px]">Qty</TableHead>
            {/* cut pieces */}
            <TableHead className="text-right min-w-[54px]">Pieces</TableHead>
            {/* parts done */}
            <TableHead className="text-right min-w-[68px] whitespace-nowrap">Parts Done</TableHead>
            {/* material used */}
            <TableHead className="text-right min-w-[80px] whitespace-nowrap">Mat Used</TableHead>
            {/* reusable offset */}
            <TableHead className="text-right min-w-[64px]">Reuse</TableHead>
            {/* scrap */}
            <TableHead className="text-right min-w-[64px]">Scrap</TableHead>
            {/* fab score */}
            <TableHead className="text-right min-w-[72px] whitespace-nowrap">Fab Score</TableHead>
            {showDeleteCol && <TableHead className="w-9" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: colSpan }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : cuts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                No cut history found.
              </TableCell>
            </TableRow>
          ) : (
            cuts.map((cut) => (
              <TableRow
                key={cut.id}
                className={cut.isFavorite ? "bg-amber-50/40 dark:bg-amber-950/20" : undefined}
              >
                {/* Favorite star */}
                <TableCell className="px-2">
                  <button
                    type="button"
                    aria-label={cut.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => onToggleFavorite(cut.id)}
                    className="text-muted-foreground hover:text-amber-400 transition-colors"
                  >
                    <Star
                      className="h-4 w-4"
                      fill={cut.isFavorite ? "#f59e0b" : "none"}
                      stroke={cut.isFavorite ? "#f59e0b" : "currentColor"}
                      strokeWidth={1.5}
                    />
                  </button>
                </TableCell>

                {/* Date — date on top, time below */}
                <TableCell className="whitespace-nowrap">
                  <div className="font-medium">
                    {format(new Date(cut.cut_date), "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(cut.cut_date), "HH:mm:ss")}
                  </div>
                </TableCell>

                {/* Part type */}
                <TableCell className="font-medium">
                  {PART_LABELS[cut.part_id] ?? `Part ${cut.part_id}`}
                </TableCell>

                {/* Sizes — short label in badge, full label in tooltip */}
                <TableCell className="w-[190px]">
                  {cut.part_selected_label && cut.part_selected_label.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {cut.part_selected_label.map((label, i) => {
                        const short = shortenSizeLabel(label, cut.part_id)
                        return (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="max-w-[178px] justify-start truncate font-mono text-xs cursor-default"
                              >
                                {short}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs break-words font-mono">
                              {label}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>

                {/* Stock dimensions */}
                <TableCell className="font-mono whitespace-nowrap">
                  {cut.cut_width}" × {cut.cut_length}" × {cut.cut_thickness}"
                </TableCell>

                {/* Qty */}
                <TableCell className="text-right tabular-nums">{cut.cut_amount}</TableCell>

                {/* Cut pieces */}
                <TableCell className="text-right tabular-nums">{cut.cut_pieces}</TableCell>

                {/* Parts completed */}
                <TableCell className="text-right tabular-nums">{cut.parts_completed}</TableCell>

                {/* Material used */}
                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.material_used_sqft.toFixed(2)} ft²
                </TableCell>

                {/* Reusable offset */}
                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.reusable_offset_sqft.toFixed(2)} ft²
                </TableCell>

                {/* Scrap */}
                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.scrap_sqft.toFixed(2)} ft²
                </TableCell>

                {/* Fab score as percentage */}
                <TableCell className="text-right">
                  <FabScoreBadge score={cut.fab_score} />
                </TableCell>

                {/* Delete — shown for admins/managers on any row; cutters only on own rows */}
                {showDeleteCol && (
                  <TableCell>
                    {rowCanDelete(cut) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDeleteClick(cut.id)}
                            aria-label="Delete cut record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete cut record</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
