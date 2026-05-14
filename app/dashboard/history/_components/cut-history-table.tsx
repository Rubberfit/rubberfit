"use client"

import { ExternalLink, FileText, Loader2, Star, Trash2 } from "lucide-react"

import { useUserPreferences } from "@/app/dashboard/_components/user-preferences-provider"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/components/ui/tooltip"
import {
  formatInUserTimeZone,
  formatUserDate,
} from "@/src/application/preferences/user-date-format"

import { canViewPdf, type CutHistoryRow, PART_LABELS } from "./use-cut-history"

// FabScoreBadge

function FabScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const variant = score >= 0.8 ? "default" : score >= 0.55 ? "secondary" : "destructive"
  return <Badge variant={variant}>{pct}%</Badge>
}

// PdfActionButton — issue #127: always rendered. Three states:
//   - has pdf_url           → click opens it
//   - recoverable layout    → click hits the on-demand regen route
//   - neither               → disabled with explanatory tooltip
function PdfActionButton({
  cut,
  isPending,
  onViewPdf,
}: {
  cut: CutHistoryRow
  isPending: boolean
  onViewPdf: (id: string) => void
}) {
  const hasUrl = Boolean(cut.pdf_url)
  const recoverable = canViewPdf(cut)
  const tooltipLabel = hasUrl
    ? "View PDF"
    : recoverable
      ? isPending
        ? "Generating PDF…"
        : "Generate PDF"
      : "PDF unavailable — no layout snapshot was stored for this cut"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => onViewPdf(cut.id)}
            disabled={!recoverable || isPending}
            aria-label={tooltipLabel}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  )
}

// Props

interface CutHistoryTableProps {
  cuts: CutHistoryRow[]
  loading: boolean
  totalColSpan: number
  canDelete: boolean
  pendingPdfIds: Set<string>
  onToggleFavorite: (id: string) => void
  onDeleteRequest: (cutId: string) => void
  onReopen: (cutId: string) => void
  onViewPdf: (cutId: string) => void
}

// Component

export function CutHistoryTable({
  cuts,
  loading,
  totalColSpan,
  canDelete,
  pendingPdfIds,
  onToggleFavorite,
  onDeleteRequest,
  onReopen,
  onViewPdf,
}: CutHistoryTableProps) {
  const preferences = useUserPreferences()
  return (
    <div className="overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="bg-slate-100 dark:bg-slate-800/50">
            <TableHead className="w-8 px-2" />
            <TableHead className="min-w-[110px] pl-2">Cut Date</TableHead>
            <TableHead className="min-w-[110px]">Part</TableHead>
            <TableHead className="min-w-[140px] whitespace-nowrap">Stock (W×L×T)</TableHead>
            <TableHead className="text-right min-w-[40px]">Qty</TableHead>
            <TableHead className="text-right min-w-[68px] whitespace-nowrap">Parts Done</TableHead>
            <TableHead className="text-right min-w-[80px] whitespace-nowrap">Mat Used</TableHead>
            <TableHead className="text-right min-w-[64px]">Reuse</TableHead>
            <TableHead className="text-right min-w-[64px]">Scrap</TableHead>
            <TableHead className="text-right min-w-[72px] whitespace-nowrap">Fab Score</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={totalColSpan} className="py-10 text-center text-muted-foreground">
                Loading cut history…
              </TableCell>
            </TableRow>
          ) : cuts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={totalColSpan} className="py-10 text-center text-muted-foreground">
                No cut records found for the selected criteria.
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

                {/* Date */}
                <TableCell className="pl-2 whitespace-nowrap">
                  <div className="font-medium">{formatUserDate(cut.cut_date, preferences)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatInUserTimeZone(cut.cut_date, preferences, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                </TableCell>

                {/* Part */}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    <span>{PART_LABELS[cut.part_id] ?? `Part ${cut.part_id}`}</span>
                    {cut.source === "manual" && (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] font-medium border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-50/60 dark:bg-sky-950/30"
                      >
                        Manual
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* Stock dimensions */}
                <TableCell className="font-mono whitespace-nowrap">
                  {cut.cut_width}" × {cut.cut_length}" × {cut.cut_thickness}"
                </TableCell>

                <TableCell className="text-right tabular-nums">{cut.cut_amount}</TableCell>
                <TableCell className="text-right tabular-nums">{cut.parts_completed}</TableCell>

                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.material_used_sqft.toFixed(2)} ft²
                </TableCell>

                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.reusable_offset_sqft.toFixed(2)} ft²
                </TableCell>

                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.scrap_sqft.toFixed(2)} ft²
                </TableCell>

                <TableCell className="text-right">
                  <FabScoreBadge score={cut.fab_score} />
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <div className="flex items-center gap-1">
                    <PdfActionButton
                      cut={cut}
                      isPending={pendingPdfIds.has(cut.id)}
                      onViewPdf={onViewPdf}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => onReopen(cut.id)}
                          aria-label="Reopen in Cutting Engine"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reopen in Cutting Engine</TooltipContent>
                    </Tooltip>
                    {canDelete && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDeleteRequest(cut.id)}
                            aria-label="Delete cut record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete cut record</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
