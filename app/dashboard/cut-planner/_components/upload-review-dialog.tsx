"use client"

import React, { useState, useEffect, useMemo } from "react"
import { AlertTriangle, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import {
  describeExtractedPart,
  type ExtractedPart,
  type ExtractedPartType,
} from "./upload-types"

interface UploadReviewDialogProps {
  open: boolean
  parts: ExtractedPart[]
  warnings: string[]
  stockWidth?: number
  onConfirm: (parts: ExtractedPart[]) => void
  onCancel: () => void
}

const TYPE_LABEL: Record<ExtractedPartType, string> = {
  rectangle: "Rectangle",
  cylinder: "Cylinder",
  cone: "Cone",
  trapezoid: "Trapezoid",
}

export default function UploadReviewDialog({
  open,
  parts: initialParts,
  warnings,
  stockWidth,
  onConfirm,
  onCancel,
}: UploadReviewDialogProps) {
  const [parts, setParts] = useState<ExtractedPart[]>(initialParts)

  useEffect(() => {
    setParts(initialParts)
  }, [initialParts])

  const counts = useMemo(() => {
    const map = new Map<ExtractedPartType, number>()
    for (const p of parts) map.set(p.partType, (map.get(p.partType) ?? 0) + 1)
    return map
  }, [parts])

  const updatePartNumber = (index: number, value: string) => {
    setParts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, partNumber: value || undefined } : p))
    )
  }

  const updateQuantity = (index: number, value: string) => {
    const num = Number(value)
    if (!Number.isFinite(num) || num < 1) return
    setParts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, quantity: Math.max(1, Math.round(num)) } : p))
    )
  }

  const removeRow = (index: number) => {
    setParts((prev) => prev.filter((_, i) => i !== index))
  }

  const shapeSummary = [...counts.entries()]
    .map(([type, count]) => `${count} ${TYPE_LABEL[type].toLowerCase()}${count !== 1 ? "s" : ""}`)
    .join(", ")

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Extracted Dimensions</DialogTitle>
          <DialogDescription>
            {parts.length} part{parts.length !== 1 ? "s" : ""} extracted
            {shapeSummary ? ` (${shapeSummary})` : ""}
            {stockWidth ? ` · Stock width: ${stockWidth}"` : ""}
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-right">#</TableHead>
                <TableHead className="w-[120px]">Part #</TableHead>
                <TableHead className="w-[100px]">Shape</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead className="w-[80px]">Qty</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((part, index) => (
                <TableRow key={index}>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <input
                      className="w-full rounded border border-border bg-transparent px-1.5 py-1 text-sm"
                      value={part.partNumber ?? ""}
                      onChange={(e) => updatePartNumber(index, e.target.value)}
                      placeholder="\u2014"
                    />
                  </TableCell>
                  <TableCell className="text-xs font-medium text-muted-foreground">
                    {TYPE_LABEL[part.partType]}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {describeExtractedPart(part)}
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      className="w-full rounded border border-border bg-transparent px-1.5 py-1 text-sm"
                      value={part.quantity}
                      onChange={(e) => updateQuantity(index, e.target.value)}
                      min="1"
                      step="1"
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(parts)} disabled={parts.length === 0}>
            Add {parts.length} Part{parts.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
