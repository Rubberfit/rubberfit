"use client";

import { useEffect, useState } from "react";
import { FileText, Download, Calendar, Filter, BarChart3 } from "lucide-react";
import { format, subDays, subWeeks, subMonths } from "date-fns";
import { toast } from "sonner";

import { cutService } from "@/services/cutService";
import { rollService } from "@/services/rollService";
import { materialTypeService } from "@/services/materialTypeService";
import { exportService } from "@/services/exportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: string; // Now accepts any string to support dynamic types from CSV
  frequency: "daily" | "weekly" | "monthly" | "on-demand";
  lastGenerated?: string;
}

// Define standard report types with their assigned colors
const STANDARD_REPORT_COLORS: Record<string, string> = {
  operational: "info",         // Blue - primary operations
  financial: "success",        // Green - money/success
  efficiency: "warning",        // Orange/Amber - performance metrics
  inventory: "secondary",       // Neutral grey - stock management
};

// Fallback colors for dynamic report types (not used by standard types)
const DYNAMIC_COLOR_PALETTE = [
  "destructive",  // Red variant
  "default",      // Default variant
  "outline",      // Outline variant
  "muted",        // Muted variant
];

// Simple hash function to consistently map strings to numbers
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * CSV Import Integration:
 * When users import CSV files, the system should:
 * 1. Parse the CSV and extract report types from a "type" or "category" column
 * 2. For each unique type found:
 *    - If it matches a standard type (operational, financial, etc.), use that
 *    - If it's a new type, it will automatically get a consistent color via getTypeColor()
 * 3. Add the imported data to reportTemplates array
 * 4. The color assignment will persist for the session
 *
 * Example CSV structure:
 * name,description,type,frequency
 * "Quality Report","Monthly quality metrics","quality","monthly"
 * "Supplier Report","Vendor performance","supplier","weekly"
 *
 * The "quality" and "supplier" types would automatically get distinct colors
 */

export default function ReportsPage() {
  const [reportPeriod, setReportPeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");
  const [reportType, setReportType] = useState<string>("all"); // Changed to string to support dynamic types
  const [generating, setGenerating] = useState<string | null>(null);
  const [dynamicTypeColorMap] = useState<Map<string, string>>(new Map()); // Store color assignments for dynamic types

  // In production, this array would be populated from:
  // 1. Predefined templates (as shown below)
  // 2. CSV imports that add new report types dynamically
  // 3. Database-stored custom report templates
  // When CSV data is imported with new report types, they would be added here
  // and the color system will automatically assign consistent colors
  const reportTemplates: ReportTemplate[] = [
    {
      id: "operational-summary",
      name: "Operational Summary",
      description: "Overview of cutting operations, waste levels, and efficiency metrics",
      type: "operational",
      frequency: "weekly",
    },
    {
      id: "material-usage",
      name: "Material Usage Report",
      description: "Detailed breakdown of material consumption by type and period",
      type: "inventory",
      frequency: "monthly",
    },
    {
      id: "cost-analysis",
      name: "Cost Analysis Report",
      description: "Financial analysis of material costs, waste expenses, and savings",
      type: "financial",
      frequency: "monthly",
    },
    {
      id: "efficiency-trends",
      name: "Efficiency Trends",
      description: "Long-term analysis of cutting efficiency and waste reduction",
      type: "efficiency",
      frequency: "monthly",
    },
    {
      id: "inventory-status",
      name: "Inventory Status Report",
      description: "Current inventory levels, low stock alerts, and reorder recommendations",
      type: "inventory",
      frequency: "weekly",
    },
    {
      id: "waste-analysis",
      name: "Waste Analysis Report",
      description: "Comprehensive analysis of waste patterns and reduction opportunities",
      type: "efficiency",
      frequency: "monthly",
    },
    // Example: These could be dynamically added from CSV imports
    // Uncomment to test dynamic color assignment:
    // {
    //   id: "quality-metrics",
    //   name: "Quality Metrics Report",
    //   description: "Quality control and defect tracking metrics",
    //   type: "quality",  // Custom type - will get dynamic color
    //   frequency: "weekly",
    // },
    // {
    //   id: "maintenance-schedule",
    //   name: "Maintenance Schedule Report",
    //   description: "Equipment maintenance and downtime analysis",
    //   type: "maintenance",  // Custom type - will get dynamic color
    //   frequency: "monthly",
    // },
    // {
    //   id: "supplier-performance",
    //   name: "Supplier Performance Report",
    //   description: "Vendor quality and delivery performance metrics",
    //   type: "supplier",  // Custom type - will get dynamic color
    //   frequency: "quarterly",
    // },
  ];

  const generateReport = async (reportId: string) => {
    setGenerating(reportId);

    // Simulate report generation delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      let reportData: any = {};
      const endDate = new Date();
      let startDate: Date;

      // Determine date range based on current reportPeriod state
      switch (reportPeriod) {
        case "daily":
          startDate = subDays(endDate, 1);
          break;
        case "weekly":
          startDate = subWeeks(endDate, 1);
          break;
        case "monthly":
          startDate = subMonths(endDate, 1);
          break;
        case "quarterly":
          startDate = subMonths(endDate, 3);
          break;
        default:
          startDate = subMonths(endDate, 1);
      }

      // Fetch data via service layer
      const cuts = await cutService.getCutsByDateRangeWithRolls(startDate, endDate);
      const rolls = await rollService.getAllRolls();
      const materialTypes = await materialTypeService.getAll();

      // Generate report content based on type
      const report = reportTemplates.find(r => r.id === reportId);
      if (!report) throw new Error("Report template not found");

      // Calculate material breakdown
      const materialBreakdown: Record<string, {
        activeRolls: number;
        totalSqft: number;
        totalValue: number;
      }> = {};

      // Group rolls by material type
      (rolls || []).forEach(roll => {
        if (roll.status === 'active') {
          if (!materialBreakdown[roll.material_type]) {
            materialBreakdown[roll.material_type] = {
              activeRolls: 0,
              totalSqft: 0,
              totalValue: 0
            };
          }
          materialBreakdown[roll.material_type].activeRolls += 1;
          materialBreakdown[roll.material_type].totalSqft += (roll.remaining_length * roll.width) / 144;
          materialBreakdown[roll.material_type].totalValue += (roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144;
        }
      });

      reportData = {
        reportName: report.name,
        period: reportPeriod,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        generatedAt: new Date().toISOString(),
        data: {
          cuts: cuts || [],
          rolls: rolls || [],
          materialTypes: materialTypes || [],
        },
        summary: {
          totalCuts: (cuts || []).length,
          totalMaterialUsed: (cuts || []).reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0),
          averageWaste: (cuts || []).length > 0
            ? (cuts || []).reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / (cuts || []).length
            : 0,
          totalInventoryValue: (rolls || []).reduce((sum, roll) =>
            sum + ((roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144), 0
          ),
        },
        materialBreakdown
      };

      // Generate PDF report
      const periodLabel = reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1);
      const htmlContent = `
        <p>Report Period: ${periodLabel}</p>
        <p>Date Range: ${format(startDate, "MMM dd, yyyy")} - ${format(endDate, "MMM dd, yyyy")}</p>

        <h2>Summary</h2>
        <ul>
          <li>Total Cuts: ${reportData.summary.totalCuts}</li>
          <li>Total Material Used: ${reportData.summary.totalMaterialUsed.toFixed(2)} sqft</li>
          <li>Average Waste: ${reportData.summary.averageWaste.toFixed(1)}%</li>
          <li>Total Inventory Value: $${reportData.summary.totalInventoryValue.toFixed(2)}</li>
        </ul>

        <h2>Material Breakdown</h2>
        ${Object.keys(reportData.materialBreakdown).length > 0 ? `
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Material Type</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Active Rolls</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total sqft</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(reportData.materialBreakdown).map(([material, data]: [string, any]) => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${material}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${data.activeRolls || 0}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(data.totalSqft || 0).toFixed(2)}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${(data.totalValue || 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : '<p>No material breakdown data available for this period.</p>'}

        <h2>Recent Cuts</h2>
        ${(reportData.data.cuts || []).length > 0 ? `
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Date</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Material</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Dimensions</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Qty</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Waste %</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Job Ref</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.data.cuts.slice(0, 20).map((cut: any) => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${format(new Date(cut.created_at), "MM/dd/yyyy")}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${cut.roll?.material_type || 'Unknown'}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${cut.cut_width}" × ${cut.cut_length}"</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${cut.quantity}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(cut.waste_percentage || 0).toFixed(1)}%</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${cut.job_reference || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : '<p>No cuts recorded for this period.</p>'}
      `;

      await exportService.generatePDFReport(report.name, htmlContent);

      toast.success(`${periodLabel} ${report.name} generated successfully`);

    } catch (error) {
      console.error("Error generating report:", error);
      toast.error(`Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGenerating(null);
    }
  };

  const getTypeColor = (type: string): any => {
    // First check if it's a standard type with a predefined color
    if (STANDARD_REPORT_COLORS[type.toLowerCase()]) {
      return STANDARD_REPORT_COLORS[type.toLowerCase()];
    }

    // For dynamic types, check if we've already assigned a color
    if (dynamicTypeColorMap.has(type)) {
      return dynamicTypeColorMap.get(type)!;
    }

    // Assign a new color for this dynamic type
    const typeHash = hashString(type);
    const colorIndex = typeHash % DYNAMIC_COLOR_PALETTE.length;
    const assignedColor = DYNAMIC_COLOR_PALETTE[colorIndex];

    // Store the assignment for consistency during this session
    dynamicTypeColorMap.set(type, assignedColor);

    return assignedColor;
  };

  const getFrequencyColor = (frequency: ReportTemplate['frequency']): "outline" => {
    // Using consistent outline variant for all frequencies - less prominent than type badges
    return "outline";
  };

  const getPeriodDateRange = () => {
    const endDate = new Date();
    let startDate: Date;

    switch (reportPeriod) {
      case "daily":
        startDate = subDays(endDate, 1);
        return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`;
      case "weekly":
        startDate = subWeeks(endDate, 1);
        return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`;
      case "monthly":
        startDate = subMonths(endDate, 1);
        return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`;
      case "quarterly":
        startDate = subMonths(endDate, 3);
        return `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd, yyyy")}`;
      default:
        return "";
    }
  };

  const getPeriodLabel = () => {
    return reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1);
  };

  // Get unique report types from the templates (including dynamic ones)
  const uniqueReportTypes = Array.from(new Set(reportTemplates.map(r => r.type)));

  const filteredReports = reportType === "all"
    ? reportTemplates
    : reportTemplates.filter(report => report.type === reportType);

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
      <Card className={reportType !== "all" || reportPeriod !== "monthly" ? "border-primary/50" : ""}>
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
              <Select value={reportPeriod} onValueChange={(value) => setReportPeriod(value as "daily" | "weekly" | "monthly" | "quarterly")}>
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
                  {/* Always show standard types first */}
                  {Object.keys(STANDARD_REPORT_COLORS).map(type => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                  {/* Show dynamic types that are not in the standard list */}
                  {uniqueReportTypes
                    .filter(type => !STANDARD_REPORT_COLORS[type.toLowerCase()])
                    .map(type => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)} (Custom)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Filter which report templates are displayed
                {uniqueReportTypes.some(type => !STANDARD_REPORT_COLORS[type.toLowerCase()]) &&
                  " • Custom types from CSV imports are marked"}
              </p>
            </div>
          </div>

          {/* Show the current period range */}
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {getPeriodLabel()} Period Selected:
              </span>
              <span className="text-muted-foreground">
                {getPeriodDateRange()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Templates */}
      {filteredReports.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No reports found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No reports match the selected type "{reportType}". Try selecting a different report type.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground mb-2">
            Showing {filteredReports.length} of {reportTemplates.length} available reports
            {reportType !== "all" && ` (filtered by ${reportType})`}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredReports.map((report) => (
          <Card key={report.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{report.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {report.description}
                  </CardDescription>
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
                    {getPeriodLabel()} report
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {getPeriodDateRange()}
                </div>
              </div>

              <div className="flex gap-2">
                <Badge variant={getTypeColor(report.type)}>
                  {report.type}
                </Badge>
                <Badge variant={getFrequencyColor(report.frequency)}>
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
                onClick={() => generateReport(report.id)}
                disabled={generating === report.id}
                className="w-full"
              >
                {generating === report.id ? (
                  <>
                    <BarChart3 className="mr-2 h-4 w-4 animate-spin" />
                    Generating {getPeriodLabel()} Report...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Generate {getPeriodLabel()} Report
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
          </div>
        </>
      )}

      {/* Report Features */}
      <Card>
        <CardHeader>
          <CardTitle>Report Features</CardTitle>
          <CardDescription>
            Current and planned reporting capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium text-green-700 dark:text-green-300">
                ✓ Available Now
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• JSON data export for all reports</li>
                <li>• Configurable date ranges</li>
                <li>• Real-time data from Supabase</li>
                <li>• Multiple report categories</li>
                <li>• On-demand generation</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-blue-700 dark:text-blue-300">
                📋 Coming in Phase 2
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• PDF report generation</li>
                <li>• Automated report scheduling</li>
                <li>• Email report delivery</li>
                <li>• Custom report builder</li>
                <li>• Report templates and branding</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center text-sm font-medium">1</div>
            <div>
              <h4 className="font-medium">Configure Report Settings</h4>
              <p className="text-sm text-muted-foreground">
                Set the <span className="font-medium">Report Period</span> to define the date range for ALL generated reports.
                Use <span className="font-medium">Report Type</span> to filter which templates are displayed.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center text-sm font-medium">2</div>
            <div>
              <h4 className="font-medium">Generate Report</h4>
              <p className="text-sm text-muted-foreground">
                Click "Generate Report" on any template to create a report with current data.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center text-sm font-medium">3</div>
            <div>
              <h4 className="font-medium">Download and Analyze</h4>
              <p className="text-sm text-muted-foreground">
                Reports are downloaded as JSON files containing all relevant data and metrics.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}