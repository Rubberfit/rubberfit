"use client"

import { useState } from "react"
import { Calendar } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"

import { generateReport } from "./_components/report-generator"
import { getPeriodDateRange, getPeriodLabel } from "./_components/report-helpers"
import { ReportList } from "./_components/report-list"
import { DEFAULT_REPORT_TEMPLATES, STANDARD_REPORT_COLORS } from "./_components/report-templates"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"

type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly"

const REPORT_PERIODS: ReadonlyArray<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
]

// Typed as `ReadonlySet<string>` (not `ReadonlySet<ReportPeriod>`)
// so `.has(value)` accepts any string without a cast — the type
// guard's `value is ReportPeriod` return narrows correctly anyway.
const REPORT_PERIOD_VALUES: ReadonlySet<string> = new Set(REPORT_PERIODS.map((p) => p.value))

function isReportPeriod(value: string): value is ReportPeriod {
  return REPORT_PERIOD_VALUES.has(value)
}

export default function ReportsPage() {
  const organizationPreferences = useOrganizationPreferences()
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("monthly")
  const [reportType, setReportType] = useState<string>("all")
  const [generating, setGenerating] = useState<string | null>(null)
  const [dynamicTypeColorMap] = useState<Map<string, string>>(new Map())

  const reportTemplates = DEFAULT_REPORT_TEMPLATES

  const handleGenerateReport = async (reportId: string) => {
    setGenerating(reportId)
    try {
      await generateReport(reportId, reportTemplates, reportPeriod, organizationPreferences)
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
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Analytics", href: "/dashboard/analytics" },
          { label: "Reports" },
        ]}
        title="Reports"
        subtitle="Build, schedule, and download automated analytics reports."
      />

      <ViewToolbar
        hideSearch
        filters={
          <>
            <Select
              value={reportPeriod}
              onValueChange={(value) => {
                if (isReportPeriod(value)) setReportPeriod(value)
              }}
            >
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_PERIODS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="h-9 w-[200px] text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.keys(STANDARD_REPORT_COLORS).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
                {uniqueReportTypes
                  .filter((type) => !STANDARD_REPORT_COLORS[type.toLowerCase()])
                  .map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)} (custom)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="size-3.5" aria-hidden="true" />
        <span className="font-medium text-foreground">{getPeriodLabel(reportPeriod)} period:</span>
        <span className="font-mono tabular-nums">{getPeriodDateRange(reportPeriod)}</span>
      </div>

      <ReportList
        filteredReports={filteredReports}
        totalReports={reportTemplates.length}
        reportType={reportType}
        reportPeriod={reportPeriod}
        generating={generating}
        dynamicTypeColorMap={dynamicTypeColorMap}
        onGenerate={handleGenerateReport}
      />

      <Card>
        <CardHeader>
          <CardTitle>Report features</CardTitle>
          <CardDescription>Current and planned reporting capabilities.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportFeaturesList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to use reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReportUsageSteps />
        </CardContent>
      </Card>
    </PageShell>
  )
}

function ReportFeaturesList() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <h4 className="font-medium text-[color:var(--success)]">Available now</h4>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>JSON data export for all reports</li>
          <li>Configurable date ranges</li>
          <li>Real-time data from Supabase</li>
          <li>Multiple report categories</li>
          <li>On-demand generation</li>
        </ul>
      </div>
      <div className="space-y-2">
        <h4 className="font-medium text-[color:var(--accent)]">Coming in Phase 2</h4>
        <ul className="space-y-1 text-sm text-muted-foreground">
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

function ReportStepBadge({ step }: { step: number }) {
  return (
    <>
      <span className="sr-only">{`Step ${step}`}</span>
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-accent-foreground tabular-nums"
      >
        {step}
      </span>
    </>
  )
}

function ReportUsageSteps() {
  return (
    <>
      <div className="flex items-start gap-3">
        <ReportStepBadge step={1} />
        <div>
          <h4 className="font-medium">Configure report settings</h4>
          <p className="text-sm text-muted-foreground">
            Set the <span className="font-medium text-foreground">period</span> to define the date
            range for all generated reports. Use{" "}
            <span className="font-medium text-foreground">type</span> to filter which templates are
            displayed.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <ReportStepBadge step={2} />
        <div>
          <h4 className="font-medium">Generate report</h4>
          <p className="text-sm text-muted-foreground">
            Click &quot;Generate report&quot; on any template to create a report with current data.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <ReportStepBadge step={3} />
        <div>
          <h4 className="font-medium">Download and analyze</h4>
          <p className="text-sm text-muted-foreground">
            Reports are downloaded as JSON files containing all relevant data and metrics.
          </p>
        </div>
      </div>
    </>
  )
}
