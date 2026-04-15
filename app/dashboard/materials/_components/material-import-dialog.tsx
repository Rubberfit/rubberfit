"use client"

import { useState, useCallback } from "react"
import { Download, Upload, FileSpreadsheet, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Badge } from "@/app/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

interface ParsedRow {
  name: string
  description: string
  defaultCost: number | undefined
  minStockAlert: number | undefined
  error: string | null
  isDuplicate: boolean
}

interface MaterialImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingNames: Set<string>
  onImportComplete: () => void
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "material", "material_type", "material type"],
  description: ["description", "desc"],
  defaultCost: ["default_cost", "default cost", "cost", "cost_per_sqft", "price"],
  minStockAlert: [
    "min_stock_alert",
    "min stock alert",
    "stock_alert",
    "stock alert",
    "low stock",
    "low_stock",
  ],
}

function matchHeader(header: string): string | null {
  const normalized = header.trim().toLowerCase()
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field
  }
  return null
}

function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function parseFile(
  rawText: string,
  existingNames: Set<string>
): { rows: ParsedRow[]; errors: string[] } {
  const text = rawText.replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const errors: string[] = []

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must have a header row and at least one data row"] }
  }

  const headerValues = parseCSVLine(lines[0])
  const columnMap: Record<string, number> = {}

  headerValues.forEach((header, index) => {
    const field = matchHeader(header)
    if (field && !(field in columnMap)) {
      columnMap[field] = index
    }
  })

  if (!("name" in columnMap)) {
    return { rows: [], errors: ["Missing required column: Name"] }
  }

  const normalizedExisting = new Set([...existingNames].map((n) => n.toLowerCase()))
  const seenInFile = new Set<string>()
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const name = (values[columnMap.name] ?? "").trim()

    if (!name) {
      errors.push(`Row ${i + 1}: Missing name`)
      continue
    }

    let defaultCost: number | undefined
    let validationError: string | null = null
    if ("defaultCost" in columnMap) {
      const raw = (values[columnMap.defaultCost] ?? "").trim()
      if (raw) {
        const parsed = parseFloat(raw.replace(/^\$/, ""))
        if (!Number.isFinite(parsed) || parsed < 0) {
          validationError = `Invalid cost "${raw}"`
        } else {
          defaultCost = parsed
        }
      }
    }

    let minStockAlert: number | undefined
    if ("minStockAlert" in columnMap) {
      const raw = (values[columnMap.minStockAlert] ?? "").trim()
      if (raw) {
        const parsed = parseFloat(raw)
        if (!Number.isFinite(parsed) || parsed < 0) {
          validationError = validationError
            ? `${validationError}; Invalid stock alert "${raw}"`
            : `Invalid stock alert "${raw}"`
        } else {
          minStockAlert = parsed
        }
      }
    }

    const description =
      "description" in columnMap ? (values[columnMap.description] ?? "").trim() : ""

    const normalizedName = name.toLowerCase()
    const isDuplicate = normalizedExisting.has(normalizedName) || seenInFile.has(normalizedName)
    seenInFile.add(normalizedName)

    rows.push({
      name,
      description,
      defaultCost,
      minStockAlert,
      error: validationError,
      isDuplicate,
    })
  }

  return { rows, errors }
}

function downloadTemplate() {
  const csv = "Name,Description,Default Cost,Min Stock Alert\n"
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", "material_types_template.csv")
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export function MaterialImportDialog({
  open,
  onOpenChange,
  existingNames,
  onImportComplete,
}: MaterialImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const reset = useCallback(() => {
    setFile(null)
    setParsedRows([])
    setParseErrors([])
    setImporting(false)
    setFileInputKey((k) => k + 1)
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) reset()
      onOpenChange(nextOpen)
    },
    [onOpenChange, reset]
  )

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (!selectedFile) return

      if (!selectedFile.name.endsWith(".csv")) {
        toast.error("Please select a CSV file")
        return
      }

      if (selectedFile.size > 1024 * 1024) {
        toast.error("File too large. Maximum size is 1MB.")
        return
      }

      setFile(selectedFile)

      const text = await selectedFile.text()
      const { rows, errors } = parseFile(text, existingNames)
      setParsedRows(rows)
      setParseErrors(errors)

      if (rows.length === 0 && errors.length === 0) {
        toast.error("No valid data rows found")
      }
    },
    [existingNames]
  )

  const importableRows = parsedRows.filter((r) => !r.error && !r.isDuplicate)
  const duplicateCount = parsedRows.filter((r) => r.isDuplicate).length
  const errorCount = parsedRows.filter((r) => r.error).length

  const handleImport = useCallback(async () => {
    if (importableRows.length === 0) return

    setImporting(true)
    let imported = 0

    try {
      for (const row of importableRows) {
        await materialTypeService.create({
          name: row.name,
          description: row.description || undefined,
          default_cost: row.defaultCost,
          min_stock_alert: row.minStockAlert,
        })
        imported++
      }

      const parts: string[] = [`Imported ${imported} material type${imported !== 1 ? "s" : ""}`]
      if (duplicateCount > 0) parts.push(`${duplicateCount} skipped (already exist)`)
      if (errorCount > 0) parts.push(`${errorCount} skipped (errors)`)

      toast.success(parts.join(". "))
      handleOpenChange(false)
      onImportComplete()
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      if (imported > 0) {
        toast.warning(`Imported ${imported} of ${importableRows.length} — failed: ${msg}`)
        onImportComplete()
      } else {
        toast.error(`Import failed: ${msg}`)
      }
    } finally {
      setImporting(false)
    }
  }, [importableRows, duplicateCount, errorCount, handleOpenChange, onImportComplete])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Material Types</DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk-import material types. Download the template for the expected
            format.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Template download + file input */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          <Input key={fileInputKey} type="file" accept=".csv" onChange={handleFileChange} />

          {/* File info */}
          {file && parsedRows.length === 0 && parseErrors.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{file.name}</span>
              <Badge variant="outline">{(file.size / 1024).toFixed(1)} KB</Badge>
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="p-3 border border-destructive/20 rounded-lg bg-destructive/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Errors</span>
              </div>
              <ul className="text-sm space-y-1">
                {parseErrors.map((error, i) => (
                  <li key={i} className="text-destructive">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview table */}
          {parsedRows.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span>
                  {importableRows.length} ready to import
                </span>
                {duplicateCount > 0 && (
                  <Badge variant="secondary">{duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""}</Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} error{errorCount !== 1 ? "s" : ""}</Badge>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Stock Alert</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 20).map((row, i) => (
                      <TableRow key={i} className={row.error || row.isDuplicate ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">
                          {row.description || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {row.defaultCost != null ? `$${row.defaultCost.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.minStockAlert != null ? `${row.minStockAlert} sq ft` : "—"}
                        </TableCell>
                        <TableCell>
                          {row.error ? (
                            <Badge variant="destructive" className="text-xs">
                              {row.error}
                            </Badge>
                          ) : row.isDuplicate ? (
                            <Badge variant="secondary" className="text-xs">
                              Exists
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Ready
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRows.length > 20 && (
                  <div className="p-2 text-center text-sm text-muted-foreground border-t">
                    ... and {parsedRows.length - 20} more rows
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || importableRows.length === 0}>
            <Upload className="h-4 w-4 mr-2" />
            {importing
              ? "Importing..."
              : `Import ${importableRows.length} Material${importableRows.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
