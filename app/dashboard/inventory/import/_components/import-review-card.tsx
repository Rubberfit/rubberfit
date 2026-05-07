"use client"

import { Upload } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { InlineNotice } from "@/app/components/patterns"

import { StepBadge } from "./step-badge"

interface CSVRow {
  material_type: string
  width: number
  length: number
  thickness: number
  color?: string
  location?: string
  date_received?: string
  supplier?: string
  cost_per_sqft?: number
  remaining_length?: number
  notes?: string
}

interface ImportReviewCardProps {
  parsedData: CSVRow[]
  errors: string[]
  importing: boolean
  onImport: () => void
}

export function ImportReviewCard({
  parsedData,
  errors,
  importing,
  onImport,
}: ImportReviewCardProps) {
  if (parsedData.length === 0 && errors.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <StepBadge step={3} />
            <div className="space-y-1">
              <CardTitle>Review & import</CardTitle>
              <CardDescription>Review the parsed data before importing.</CardDescription>
            </div>
          </div>
          {parsedData.length > 0 && (
            <Button onClick={onImport} disabled={importing}>
              <Upload className="size-3.5" aria-hidden="true" />
              {importing
                ? "Importing…"
                : `Import ${parsedData.length} roll${parsedData.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errors.length > 0 && (
          <InlineNotice intent="danger" title="Parse errors">
            <ul className="space-y-1 text-sm">
              {errors.slice(0, 10).map((error, index) => (
                <li key={index}>· {error}</li>
              ))}
              {errors.length > 10 && <li>… and {errors.length - 10} more errors</li>}
            </ul>
          </InlineNotice>
        )}

        {parsedData.length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Cost/sqft</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.slice(0, 10).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.material_type}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {row.width}&quot; × {row.length}&quot; × {row.thickness}&quot;
                    </TableCell>
                    <TableCell>{row.location ?? "—"}</TableCell>
                    <TableCell>{row.supplier ?? "—"}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {row.cost_per_sqft != null ? `$${row.cost_per_sqft.toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsedData.length > 10 && (
              <div className="border-t p-3 text-center text-sm text-muted-foreground">
                … and {parsedData.length - 10} more rows
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
