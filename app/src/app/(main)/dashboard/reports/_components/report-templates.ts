export interface ReportTemplate {
  id: string
  name: string
  description: string
  type: string // Now accepts any string to support dynamic types from CSV
  frequency: "daily" | "weekly" | "monthly" | "on-demand"
  lastGenerated?: string
}

// Define standard report types with their assigned colors
export const STANDARD_REPORT_COLORS: Record<string, string> = {
  operational: "info", // Blue - primary operations
  financial: "success", // Green - money/success
  efficiency: "warning", // Orange/Amber - performance metrics
  inventory: "secondary", // Neutral grey - stock management
}

// Fallback colors for dynamic report types (not used by standard types)
export const DYNAMIC_COLOR_PALETTE = [
  "destructive", // Red variant
  "default", // Default variant
  "outline", // Outline variant
  "muted", // Muted variant
]

// Simple hash function to consistently map strings to numbers
export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
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

// In production, this array would be populated from:
// 1. Predefined templates (as shown below)
// 2. CSV imports that add new report types dynamically
// 3. Database-stored custom report templates
// When CSV data is imported with new report types, they would be added here
// and the color system will automatically assign consistent colors
export const DEFAULT_REPORT_TEMPLATES: ReportTemplate[] = [
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
]
