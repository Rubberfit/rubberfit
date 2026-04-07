"use client"

import { FileText, Download, Calendar, BarChart3 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  getTypeColor,
  getFrequencyColor,
  getPeriodDateRange,
  getPeriodLabel,
} from "./report-helpers"

interface ReportTemplate {
  id: string
  name: string
  description: string
  type: string
  frequency: string
  lastGenerated?: string
}

interface ReportListProps {
  filteredReports: ReportTemplate[]
  totalReports: number
  reportType: string
  reportPeriod: "daily" | "weekly" | "monthly" | "quarterly"
  generating: string | null
  dynamicTypeColorMap: Map<string, string>
  onGenerate: (reportId: string) => void
}

export function ReportList({
  filteredReports,
  totalReports,
  reportType,
  reportPeriod,
  generating,
  dynamicTypeColorMap,
  onGenerate,
}: ReportListProps) {
  if (filteredReports.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No reports found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              No reports match the selected type "{reportType}". Try selecting a different report
              type.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="text-sm text-muted-foreground mb-2">
        Showing {filteredReports.length} of {totalReports} available reports
        {reportType !== "all" && ` (filtered by ${reportType})`}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredReports.map((report) => (
          <Card key={report.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{report.name}</CardTitle>
                  <CardDescription className="mt-1">{report.description}</CardDescription>
                </div>
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Period Badge - Shows what period will be used */}
              <div className="rounded-md bg-primary/10 border border-primary/20 p-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="font-medium">Will generate:</span>
                  <span className="text-primary font-semibold">
                    {getPeriodLabel(reportPeriod)} report
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {getPeriodDateRange(reportPeriod)}
                </div>
              </div>

              <div className="flex gap-2">
                <Badge
                  variant={
                    getTypeColor(report.type, dynamicTypeColorMap) as
                      | "default"
                      | "secondary"
                      | "destructive"
                      | "outline"
                      | "info"
                      | "success"
                      | "warning"
                  }
                >
                  {report.type}
                </Badge>
                <Badge
                  variant={getFrequencyColor(
                    report.frequency as "daily" | "weekly" | "monthly" | "on-demand"
                  )}
                >
                  Typically {report.frequency}
                </Badge>
              </div>

              {report.lastGenerated && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Last: {report.lastGenerated}</span>
                </div>
              )}

              <Button
                onClick={() => onGenerate(report.id)}
                disabled={generating === report.id}
                className="w-full"
              >
                {generating === report.id ? (
                  <>
                    <BarChart3 className="mr-2 h-4 w-4 animate-spin" />
                    Generating {getPeriodLabel(reportPeriod)} Report...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Generate {getPeriodLabel(reportPeriod)} Report
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
