"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Upload, AlertCircle } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Step 3: Review & Import</CardTitle>
            <CardDescription>Review the parsed data before importing</CardDescription>
          </div>
          {parsedData.length > 0 && (
            <Button onClick={onImport} disabled={importing}>
              <Upload className="mr-2 h-4 w-4" />
              {importing ? "Importing..." : `Import ${parsedData.length} Rolls`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-4 p-3 border border-destructive/20 rounded-lg bg-destructive/10">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium">Parse Errors</span>
            </div>
            <ul className="text-sm space-y-1">
              {errors.slice(0, 10).map((error, index) => (
                <li key={index} className="text-destructive">
                  • {error}
                </li>
              ))}
              {errors.length > 10 && (
                <li className="text-destructive">... and {errors.length - 10} more errors</li>
              )}
            </ul>
          </div>
        )}

        {/* Preview Table */}
        {parsedData.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
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
                    <TableCell>
                      {row.width}" × {row.length}" × {row.thickness}"
                    </TableCell>
                    <TableCell>{row.location || "-"}</TableCell>
                    <TableCell>{row.supplier || "-"}</TableCell>
                    <TableCell>${row.cost_per_sqft || "0.00"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsedData.length > 10 && (
              <div className="p-3 text-center text-sm text-muted-foreground border-t">
                ... and {parsedData.length - 10} more rows
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
