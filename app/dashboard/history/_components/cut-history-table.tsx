"use client"

import { format } from "date-fns"
import { ExternalLink, FileText, Star, Trash2 } from "lucide-react"

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

import { type CutHistoryRow } from "./use-cut-history"

function FabScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const variant = score >= 0.8 ? "default" : score >= 0.55 ? "secondary" : "destructive"
  return <Badge variant={variant}>{pct}%</Badge>
}

interface CutHistoryTableProps {
  cuts: CutHistoryRow[]
  loading: boolean
  totalColSpan: number
  canDelete: boolean
  onToggleFavorite: (id: string) => void
  onDeleteRequest: (cutId: string) => void
  onReopen: (cutId: string) => void
}

export function CutHistoryTable({
  cuts,
  loading,
  totalColSpan,
  canDelete,
  onToggleFavorite,
  onDeleteRequest,
  onReopen,
}: CutHistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="bg-slate-100 dark:bg-slate-800/50">
            <TableHead className="w-8 px-2" />
            <TableHead className="min-w-[110px] pl-2">Cut Date</TableHead>
            <TableHead className="min-w-[110px]">Stock</TableHead>
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

                <TableCell className="pl-2 whitespace-nowrap">
                  <div className="font-medium">{format(new Date(cut.cutDate), "MMM d, yyyy")}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(cut.cutDate), "HH:mm:ss")}
                  </div>
                </TableCell>

                <TableCell className="font-medium">{cut.stockLabel ?? "—"}</TableCell>

                <TableCell className="font-mono whitespace-nowrap">
                  {cut.cutWidth.toInches().toFixed(1)}" × {cut.cutLength.toInches().toFixed(1)}" ×{" "}
                  {cut.cutThickness ? `${cut.cutThickness.toInches().toFixed(3)}"` : "—"}
                </TableCell>

                <TableCell className="text-right tabular-nums">{cut.cutAmount}</TableCell>
                <TableCell className="text-right tabular-nums">{cut.partsCompleted}</TableCell>

                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.materialUsed.toSqft().toFixed(2)} ft²
                </TableCell>

                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  —
                </TableCell>

                <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                  {cut.scrap.toSqft().toFixed(2)} ft²
                </TableCell>

                <TableCell className="text-right">
                  <FabScoreBadge score={cut.fabScore?.toFraction() ?? 0} />
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1">
                    {cut.pdfUrl && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => window.open(cut.pdfUrl ?? "", "_blank")}
                            aria-label="View PDF"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View PDF</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => onReopen(cut.id)}
                          aria-label="Reopen in Cut Planner"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reopen in Cut Planner</TooltipContent>
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
