"use client"

import { useState, useRef } from "react"
import { Upload, Download, FileSpreadsheet, AlertCircle } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Alert, AlertDescription } from "@/app/components/ui/alert"
import { toast } from "sonner"
import { csvService } from "@/src/infrastructure/services/csvService"
import { importRolls as importRollsSdk } from "@/src/infrastructure/api-client/rf/procurement"

/**
 * Quick CSV upload card mounted on the inventory landing page.
 * A fuller three-step wizard lives at `/dashboard/inventory/import/`
 * for larger ingests; this card is the one-click path for the common
 * "drop a CSV" flow.
 */
export function CSVUpload({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Invalid file type", {
        description: "Please select a CSV file",
      })
      return
    }

    setIsUploading(true)
    try {
      // SDK flag-ON → Rust CSV endpoint (server-side parser +
      // per-row receipt). Flag-OFF → legacy parse + insert.
      // Either way the receipt has `{imported, skipped, errors}`.
      const receipt = await importRollsSdk.uploadCsv(file)
      if (receipt.errors.length === 0 && receipt.imported > 0) {
        toast.success("CSV imported successfully", {
          description: `${receipt.imported} rolls added to inventory`,
        })
        if (onUploadComplete) {
          onUploadComplete()
        }
      } else if (receipt.imported > 0) {
        // Partial success — some rows landed, others were
        // skipped with per-row errors. Show both counts so the
        // operator can scan the CSV and fix the offenders.
        toast.warning(
          `Imported ${receipt.imported}; skipped ${receipt.skipped}`,
          {
            description:
              receipt.errors[0]?.message ?? "Review errors in the report",
          }
        )
        if (onUploadComplete) {
          onUploadComplete()
        }
      } else {
        toast.error("Import failed", {
          description: receipt.errors[0]?.message ?? "No rows imported",
        })
      }
    } catch (error) {
      toast.error("Import failed", {
        description: error instanceof Error ? error.message : "An error occurred",
      })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDownloadTemplate = () => {
    try {
      csvService.downloadTemplate()
      setTimeout(() => {
        toast.success("Template downloaded", {
          description: "Check your downloads folder for rubber_rolls_template.csv",
        })
      }, 100)
    } catch (error) {
      console.error("Download error:", error)
      toast.error("Download failed", {
        description: "Could not download template. Please try again.",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Import Inventory
        </CardTitle>
        <CardDescription>
          Upload a CSV file to bulk import rubber rolls into inventory
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-muted"
          } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Drag and drop your CSV file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">Only CSV files are supported</p>
          </div>

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="mt-4"
          >
            {isUploading ? "Uploading..." : "Select CSV File"}
          </Button>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Need a template? Download our CSV template with the correct format.
          </AlertDescription>
        </Alert>

        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
            <Download className="h-4 w-4" />
            Download Template
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium">Required columns:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Material Type - Type of rubber material</li>
            <li>Width - Width in inches</li>
            <li>Length - Length in inches</li>
            <li>Thickness - Thickness in inches</li>
          </ul>
          <p className="font-medium mt-2">Optional columns:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Color, Location, Supplier, Cost per Sqft, Date Received, Notes</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
