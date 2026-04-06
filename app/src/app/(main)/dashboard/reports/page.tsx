"use client"

import { useState } from "react"
import { Filter, Calendar } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { STANDARD_REPORT_COLORS, DEFAULT_REPORT_TEMPLATES } from "./_components/report-templates"
import { generateReport } from "./_components/report-generator"
import { getPeriodDateRange, getPeriodLabel } from "./_components/report-helpers"
import { ReportList } from "./_components/report-list"

export default function ReportsPage() {
  const [reportPeriod, setReportPeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly">(
    "monthly"
  )
  const [reportType, setReportType] = useState<string>("all")
  const [generating, setGenerating] = useState<string | null>(null)
  const [dynamicTypeColorMap] = useState<Map<string, string>>(new Map())

  const reportTemplates = DEFAULT_REPORT_TEMPLATES

  const handleGenerateReport = async (reportId: string) => {
    setGenerating(reportId)
    try {
      await generateReport(reportId, reportTemplates, reportPeriod)
    } catch (error) {
      console.error("Error generating report:", error)
      toast.error(
        `Failed to generate report: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    } finally {
      setGenerating(null)
    }
  }

  const uniqueReportTypes = Array.from(new Set(reportTemplates.map((r) => r.type)))

  const filteredReports =
    reportType === "all"
      ? reportTemplates
      : reportTemplates.filter((report) => report.type === reportType)

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            Generate comprehensive reports for operations, costs, and efficiency analysis
          </p>
        </div>
      </div>

      {/* Report Filters */}
      <Card
        className={reportType !== "all" || reportPeriod !== "monthly" ? "border-primary/50" : ""}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Configuration
            {(reportType !== "all" || reportPeriod !== "monthly") && (
              <Badge variant="secondary" className="ml-auto">
                Filters Active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Report Period</label>
              <Select
                value={reportPeriod}
                onValueChange={(value) =>
                  setReportPeriod(value as "daily" | "weekly" | "monthly" | "quarterly")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This period will be used for all generated reports
              </p>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.keys(STANDARD_REPORT_COLORS).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                  {uniqueReportTypes
                    .filter((type) => !STANDARD_REPORT_COLORS[type.toLowerCase()])
                    .map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)} (Custom)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Filter which report templates are displayed
                {uniqueReportTypes.some((type) => !STANDARD_REPORT_COLORS[type.toLowerCase()]) &&
                  " \u2022 Custom types from CSV imports are marked"}
              </p>
            </div>
          </div>

          {/* Show the current period range */}
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{getPeriodLabel(reportPeriod)} Period Selected:</span>
              <span className="text-muted-foreground">{getPeriodDateRange(reportPeriod)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Templates */}
      <ReportList
        filteredReports={filteredReports}
        totalReports={reportTemplates.length}
        reportType={reportType}
        reportPeriod={reportPeriod}
        generating={generating}
        dynamicTypeColorMap={dynamicTypeColorMap}
        onGenerate={handleGenerateReport}
      />

      {/* Report Features */}
      <Card>
        <CardHeader>
          <CardTitle>Report Features</CardTitle>
          <CardDescription>Current and planned reporting capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportFeaturesList />
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReportUsageSteps />
        </CardContent>
      </Card>
    </div>
  )
}

function ReportFeaturesList() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <h4 className="font-medium text-green-700 dark:text-green-300">Available Now</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>JSON data export for all reports</li>
          <li>Configurable date ranges</li>
          <li>Real-time data from Supabase</li>
          <li>Multiple report categories</li>
          <li>On-demand generation</li>
        </ul>
      </div>
      <div className="space-y-2">
        <h4 className="font-medium text-blue-700 dark:text-blue-300">Coming in Phase 2</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>PDF report generation</li>
          <li>Automated report scheduling</li>
          <li>Email report delivery</li>
          <li>Custom report builder</li>
          <li>Report templates and branding</li>
        </ul>
      </div>
    </div>
  )
}

function ReportUsageSteps() {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center text-sm font-medium">
          1
        </div>
        <div>
          <h4 className="font-medium">Configure Report Settings</h4>
          <p className="text-sm text-muted-foreground">
            Set the <span className="font-medium">Report Period</span> to define the date range for
            ALL generated reports. Use <span className="font-medium">Report Type</span> to filter
            which templates are displayed.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center text-sm font-medium">
          2
        </div>
        <div>
          <h4 className="font-medium">Generate Report</h4>
          <p className="text-sm text-muted-foreground">
            Click "Generate Report" on any template to create a report with current data.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center text-sm font-medium">
          3
        </div>
        <div>
          <h4 className="font-medium">Download and Analyze</h4>
          <p className="text-sm text-muted-foreground">
            Reports are downloaded as JSON files containing all relevant data and metrics.
          </p>
        </div>
      </div>
    </>
  )
}
