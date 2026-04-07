"use client"

import { useState } from "react"
import { toast } from "sonner"
import { rollService } from "@/services/rollService"
import { materialTypeService } from "@/services/materialTypeService"
import { useRouter } from "next/navigation"

import { ImportReviewCard } from "./_components/import-review-card"
import { ImportUploadCard } from "./_components/import-upload-card"
import { ImportTemplateCard } from "./_components/import-template-card"

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

export default function CSVImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsedData, setParsedData] = useState<CSVRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const router = useRouter()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile)
      setParsedData([])
      setErrors([])
    } else {
      toast.error("Please select a valid CSV file")
    }
  }

  const parseCSV = async () => {
    if (!file) {
      toast.error("Please select a file first")
      return
    }

    setParsing(true)
    setErrors([])

    try {
      const text = await file.text()
      const lines = text.split("\n").filter((line) => line.trim())

      if (lines.length < 2) {
        toast.error("CSV file must have a header row and at least one data row")
        setParsing(false)
        return
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
      const requiredHeaders = ["material_type", "width", "length", "thickness"]
      const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h))

      if (missingHeaders.length > 0) {
        setErrors([`Missing required columns: ${missingHeaders.join(", ")}`])
        setParsing(false)
        return
      }

      const data: CSVRow[] = []
      const parseErrors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim())

        if (values.length !== headers.length) {
          parseErrors.push(`Row ${i + 1}: Column count mismatch`)
          continue
        }

        const row: Record<string, string | number | null> = {}
        headers.forEach((header, index) => {
          const value = values[index]

          if (
            ["width", "length", "thickness", "cost_per_sqft", "remaining_length"].includes(header)
          ) {
            row[header] = value ? parseFloat(value) : null
            if (value && isNaN(row[header] as number)) {
              parseErrors.push(`Row ${i + 1}: Invalid number for ${header}`)
            }
          } else {
            row[header] = value || null
          }
        })

        if (!row.material_type || !row.width || !row.length || !row.thickness) {
          parseErrors.push(`Row ${i + 1}: Missing required fields`)
          continue
        }

        if (!row.remaining_length) {
          row.remaining_length = row.length
        }

        data.push(row as unknown as CSVRow)
      }

      if (parseErrors.length > 0) {
        setErrors(parseErrors)
      }

      if (data.length === 0) {
        toast.error("No valid data rows found")
      } else {
        setParsedData(data)
        toast.success(`Parsed ${data.length} valid rows`)
      }
    } catch (error) {
      console.error("Error parsing CSV:", error)
      toast.error("Failed to parse CSV file")
    } finally {
      setParsing(false)
    }
  }

  const importData = async () => {
    if (parsedData.length === 0) {
      toast.error("No data to import")
      return
    }

    setImporting(true)

    try {
      const uniqueMaterialTypes = [
        ...new Set(parsedData.map((r) => r.material_type).filter(Boolean)),
      ]
      if (uniqueMaterialTypes.length > 0) {
        const existingTypes = await materialTypeService.getAll()
        const existingNames = new Set(existingTypes.map((t) => t.name))
        const newTypes = uniqueMaterialTypes.filter((name) => !existingNames.has(name))

        for (const name of newTypes) {
          await materialTypeService.create({
            name,
            description: "",
            default_cost: 0,
            min_stock_alert: 0,
          })
        }
        if (newTypes.length > 0) {
          toast.info(
            `Created ${newTypes.length} new material type${newTypes.length > 1 ? "s" : ""}`
          )
        }
      }

      const rollsToImport = parsedData.map((row) => ({
        ...row,
        remaining_length: row.remaining_length ?? row.length,
        status: "active" as const,
      }))

      const { imported, total } = await rollService.bulkAddRolls(rollsToImport)

      if (imported === total) {
        toast.success(`Successfully imported ${imported} rolls!`)
        setTimeout(() => {
          router.push("/dashboard/inventory")
        }, 2000)
      } else {
        toast.warning(`Imported ${imported} of ${total} rolls`)
      }
    } catch (error) {
      console.error("Error importing data:", error)
      toast.error(
        `Failed to import data: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Import Inventory from CSV</h1>
        <p className="text-muted-foreground">Upload a CSV file to bulk import inventory data</p>
      </div>

      <ImportTemplateCard />

      <ImportUploadCard
        file={file}
        parsing={parsing}
        onFileChange={handleFileChange}
        onParse={parseCSV}
      />

      <ImportReviewCard
        parsedData={parsedData}
        errors={errors}
        importing={importing}
        onImport={importData}
      />
    </div>
  )
}
