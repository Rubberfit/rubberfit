"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Search, Download } from "lucide-react"

import { type Cut } from "@/lib/supabase"
import { cutService } from "@/services/cutService"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

import { DateRangePicker } from "./_components/date-range-picker"
import { CutHistoryStats } from "./_components/cut-history-stats"

interface CutWithRoll extends Cut {
  roll?: {
    material_type: string
    location: string
  }
}

export default function CutHistoryPage() {
  const [cuts, setCuts] = useState<CutWithRoll[]>([])
  const [filteredCuts, setFilteredCuts] = useState<CutWithRoll[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{
    from: Date
    to: Date
  }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  })

  useEffect(() => {
    const fetchCuts = async () => {
      setLoading(true)
      try {
        const data = await cutService.getCutsByDateRangeWithRolls(dateRange.from, dateRange.to)
        setCuts(data || [])
      } catch (error) {
        console.error("Error fetching cuts:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCuts()
  }, [dateRange])

  useEffect(() => {
    const filtered = cuts.filter((cut) => {
      const searchLower = searchTerm.toLowerCase()
      return (
        cut.job_reference?.toLowerCase().includes(searchLower) ||
        cut.cut_by?.toLowerCase().includes(searchLower) ||
        cut.roll?.material_type?.toLowerCase().includes(searchLower) ||
        cut.roll?.location?.toLowerCase().includes(searchLower) ||
        cut.notes?.toLowerCase().includes(searchLower)
      )
    })
    setFilteredCuts(filtered)
  }, [cuts, searchTerm])

  const formatDimensions = (width: number, length: number) => {
    return `${width}" × ${length}"`
  }

  const formatWastePercentage = (percentage?: number) => {
    if (!percentage) return "N/A"
    const rounded = Math.round(percentage * 100) / 100
    return `${rounded}%`
  }

  const getWasteBadgeColor = (percentage?: number) => {
    if (!percentage) return "secondary"
    if (percentage <= 5) return "default"
    if (percentage <= 15) return "secondary"
    return "destructive"
  }

  const exportToCsv = () => {
    const headers = [
      "Date",
      "Material Type",
      "Dimensions",
      "Quantity",
      "Waste %",
      "Total Sqft Used",
      "Job Reference",
      "Cut By",
      "Location",
    ]

    const csvData = filteredCuts.map((cut) => [
      format(new Date(cut.created_at), "yyyy-MM-dd HH:mm:ss"),
      cut.roll?.material_type || "N/A",
      formatDimensions(cut.cut_width, cut.cut_length),
      cut.quantity.toString(),
      formatWastePercentage(cut.waste_percentage),
      cut.total_sqft_used?.toFixed(2) || "N/A",
      cut.job_reference || "",
      cut.cut_by || "",
      cut.roll?.location || "N/A",
    ])

    const csv = [headers, ...csvData].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cut-history-${format(new Date(), "yyyy-MM-dd")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cut History</h1>
          <p className="text-muted-foreground">
            View and analyze all cutting operations with detailed waste tracking
          </p>
        </div>
        <Button onClick={exportToCsv} variant="outline" disabled={loading}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Statistics Cards */}
      <CutHistoryStats cuts={filteredCuts} />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by job reference, cut by, material, location, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </CardContent>
      </Card>

      {/* Cut History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cut History</CardTitle>
          <CardDescription>
            {filteredCuts.length} of {cuts.length} cuts shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Waste %</TableHead>
                  <TableHead>Total Sqft</TableHead>
                  <TableHead>Job Reference</TableHead>
                  <TableHead>Cut By</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Loading cut history...
                    </TableCell>
                  </TableRow>
                ) : filteredCuts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      No cuts found for the selected criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCuts.map((cut) => (
                    <TableRow key={cut.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(cut.created_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{cut.roll?.material_type || "Unknown"}</div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatDimensions(cut.cut_width, cut.cut_length)}
                      </TableCell>
                      <TableCell className="text-center">{cut.quantity}</TableCell>
                      <TableCell>
                        <Badge variant={getWasteBadgeColor(cut.waste_percentage)}>
                          {formatWastePercentage(cut.waste_percentage)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {cut.total_sqft_used?.toFixed(2) || "N/A"}
                      </TableCell>
                      <TableCell>{cut.job_reference || "—"}</TableCell>
                      <TableCell>{cut.cut_by || "—"}</TableCell>
                      <TableCell>{cut.roll?.location || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
