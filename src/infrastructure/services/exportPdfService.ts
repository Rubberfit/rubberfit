import { format } from "date-fns"
import { toast } from "sonner"
import jsPDF from "jspdf"
import type { IExportPdfService } from "@/src/application/services/export-pdf.service.interface"
import {
  formatUserDate,
  formatUserDateTime,
  type UserDatePreferencesInput,
} from "@/src/application/preferences/user-date-format"
import "reflect-metadata"
import { injectable } from "tsyringe"

@injectable()
export class ExportPdfService implements IExportPdfService {
  private renderHeading(doc: jsPDF, element: Element, margin: number, yPosition: number): number {
    const fontSize = element.tagName === "H1" ? 16 : element.tagName === "H2" ? 14 : 12
    doc.setFontSize(fontSize)
    doc.setTextColor(55, 65, 81)
    doc.text(element.textContent || "", margin, yPosition)
    return fontSize === 16 ? 12 : fontSize === 14 ? 10 : 8
  }

  private renderParagraph(
    doc: jsPDF,
    element: Element,
    margin: number,
    contentWidth: number,
    yPosition: number,
    checkNewPage: (space: number) => boolean
  ): number {
    doc.setFontSize(10)
    doc.setTextColor(75, 85, 99)
    const lines = doc.splitTextToSize(element.textContent || "", contentWidth)
    let offset = 0
    lines.forEach((line: string) => {
      checkNewPage(5)
      doc.text(line, margin, yPosition + offset)
      offset += 5
    })
    return offset + 3
  }

  private renderList(
    doc: jsPDF,
    element: Element,
    margin: number,
    contentWidth: number,
    yPosition: number,
    checkNewPage: (space: number) => boolean
  ): number {
    const items = element.querySelectorAll("li")
    let offset = 0
    items.forEach((item) => {
      checkNewPage(8)
      doc.setFontSize(10)
      doc.setTextColor(75, 85, 99)
      const bullet = element.tagName === "UL" ? "• " : "- "
      const text = bullet + (item.textContent || "")
      const lines = doc.splitTextToSize(text, contentWidth - 5)
      lines.forEach((line: string, index: number) => {
        checkNewPage(5)
        doc.text(index === 0 ? line : "  " + line, margin, yPosition + offset)
        offset += 5
      })
    })
    return offset + 3
  }

  private renderMetricCard(
    doc: jsPDF,
    element: Element,
    margin: number,
    yPosition: number
  ): number {
    const valueEl = element.querySelector(".metric-value")
    const labelEl = element.querySelector(".metric-label")

    if (valueEl && labelEl) {
      doc.setFillColor(249, 250, 251)
      doc.rect(margin, yPosition - 5, 60, 12, "F")

      doc.setFontSize(12)
      doc.setTextColor(31, 41, 55)
      doc.text(valueEl.textContent || "", margin + 2, yPosition)

      doc.setFontSize(9)
      doc.setTextColor(107, 114, 128)
      doc.text(labelEl.textContent || "", margin + 2, yPosition + 4)

      return 15
    }
    return 0
  }

  private renderTable(
    doc: jsPDF,
    element: Element,
    margin: number,
    contentWidth: number,
    yPosition: number,
    checkNewPage: (space: number) => boolean
  ): number {
    const headers: string[] = []
    const rows: string[][] = []

    element.querySelectorAll("thead th").forEach((th) => {
      headers.push(th.textContent || "")
    })

    element.querySelectorAll("tbody tr").forEach((tr) => {
      const row: string[] = []
      tr.querySelectorAll("td").forEach((td) => {
        row.push(td.textContent || "")
      })
      if (row.length > 0) {
        rows.push(row)
      }
    })

    if (headers.length === 0 || rows.length === 0) return 0

    const colWidth = contentWidth / headers.length
    let offset = 0

    doc.setFillColor(243, 244, 246)
    doc.rect(margin, yPosition - 5, contentWidth, 8, "F")
    doc.setFontSize(9)
    doc.setTextColor(31, 41, 55)
    headers.forEach((header, index) => {
      doc.text(header, margin + index * colWidth + 2, yPosition)
    })
    offset += 8

    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    rows.forEach((row) => {
      checkNewPage(7)
      row.forEach((cell, index) => {
        const maxWidth = colWidth - 4
        const text = doc.splitTextToSize(cell, maxWidth)[0]
        doc.text(text, margin + index * colWidth + 2, yPosition + offset)
      })
      offset += 6
    })

    return offset + 5
  }

  /**
   * Resolves an unknown waste-report period value (`startDate` /
   * `endDate`) into a display string. Routes string / Date / number
   * values through `formatUserDate` for org-pref-aware rendering;
   * falls back to a literal string for any other shape so the
   * generated period sentence never reads `undefined` /
   * `[object Object]`. Avoids `as` casts at the field-access boundary
   * by narrowing on `typeof` first.
   */
  private formatPeriodValue(
    value: unknown,
    organizationPreferences?: UserDatePreferencesInput
  ): string {
    if (value === null || value === undefined) return "—"
    if (value instanceof Date || typeof value === "string" || typeof value === "number") {
      return formatUserDate(value, organizationPreferences) || String(value)
    }
    return String(value)
  }

  private savePDFDocument(doc: jsPDF, filename: string): void {
    doc.save(filename)
    toast.success("PDF report downloaded successfully")
  }

  async generatePDFReport(
    title: string,
    content: string,
    organizationPreferences?: UserDatePreferencesInput
  ): Promise<void> {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const parser = new DOMParser()
      const htmlDoc = parser.parseFromString(content, "text/html")

      doc.setProperties({
        title: title,
        subject: "RubberFit Report",
        author: "RubberFit",
        keywords: "inventory, materials, rubber, optimization",
        creator: "RubberFit",
      })

      let yPosition = 20
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const contentWidth = pageWidth - margin * 2

      doc.setFontSize(18)
      doc.setTextColor(31, 41, 55)
      doc.text(title, margin, yPosition)
      yPosition += 10

      doc.setFontSize(10)
      doc.setTextColor(107, 114, 128)
      // Visible "Generated:" stamp follows org dateFormat / timeZone
      // per the operator-seeds-prints ruling. Filename ISO timestamp
      // below stays as date-fns `format()` for spreadsheet stability.
      const generatedAt = formatUserDateTime(new Date(), organizationPreferences) || "—"
      doc.text(`Generated: ${generatedAt}`, margin, yPosition)
      yPosition += 15

      const checkNewPage = (requiredSpace: number): boolean => {
        if (yPosition + requiredSpace > pageHeight - 20) {
          doc.addPage()
          yPosition = 20
          return true
        }
        return false
      }

      const allElements = htmlDoc.body.querySelectorAll("*")

      allElements.forEach((element) => {
        if (element.closest(".metric-card") && element !== element.closest(".metric-card")) {
          return
        }

        if (element.tagName === "H1" || element.tagName === "H2" || element.tagName === "H3") {
          checkNewPage(15)
          yPosition += this.renderHeading(doc, element, margin, yPosition)
        } else if (element.tagName === "P" && !element.closest(".metric-card")) {
          checkNewPage(10)
          yPosition += this.renderParagraph(
            doc,
            element,
            margin,
            contentWidth,
            yPosition,
            checkNewPage
          )
        } else if (element.tagName === "UL" || element.tagName === "OL") {
          yPosition += this.renderList(doc, element, margin, contentWidth, yPosition, checkNewPage)
        } else if (element.classList.contains("metric-card")) {
          checkNewPage(15)
          yPosition += this.renderMetricCard(doc, element, margin, yPosition)
        } else if (element.tagName === "TABLE") {
          checkNewPage(20)
          yPosition += this.renderTable(doc, element, margin, contentWidth, yPosition, checkNewPage)
        }
      })

      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      doc.text("RubberFit - Material Optimization System", margin, pageHeight - 10)
      const totalPages = Math.max(doc.internal.pages.length - 1, 1)
      doc.text(`Page ${totalPages}`, pageWidth - margin - 10, pageHeight - 10)

      const filename = `${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`

      this.savePDFDocument(doc, filename)
    } catch (error) {
      console.error("Error generating PDF report:", error)
      toast.error("Failed to generate PDF report")
      this.fallbackPDFDownload(title, content)
    }
  }

  fallbackPDFDownload(
    title: string,
    htmlContent: string,
    organizationPreferences?: UserDatePreferencesInput
  ): void {
    try {
      const generatedAt = formatUserDateTime(new Date(), organizationPreferences) || "—"
      const textContent = `${title}\n${"=".repeat(50)}\n\nGenerated: ${generatedAt}\n\n${htmlContent
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()}\n\n---\nRubberFit - Material Optimization System`

      const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd_HHmm")}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.info("Report downloaded as text file (PDF generation failed)")
    } catch (fallbackError) {
      console.error("Fallback download also failed:", fallbackError)
      toast.error("Unable to download report")
    }
  }

  async generateInventoryReport(
    rolls: Record<string, unknown>[],
    summary: Record<string, unknown>,
    organizationPreferences?: UserDatePreferencesInput
  ): Promise<void> {
    const content = `
      <h1>Inventory Report</h1>

      <div>
        <h2>Summary</h2>
        <div>
          <div class="metric-card">
            <div class="metric-value">${summary.totalRolls || 0}</div>
            <div class="metric-label">Total Rolls</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${summary.activeRolls || 0}</div>
            <div class="metric-label">Active Rolls</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">$${(Number(summary.totalValue) || 0).toFixed(2)}</div>
            <div class="metric-label">Total Value</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${(Number(summary.totalSqft) || 0).toFixed(0)} sqft</div>
            <div class="metric-label">Total Material</div>
          </div>
        </div>
      </div>

      <h2>Inventory Details</h2>
      <table>
        <thead>
          <tr>
            <th>Material Type</th>
            <th>Dimensions</th>
            <th>Remaining</th>
            <th>Location</th>
            <th>Status</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${rolls
            .map(
              (roll) => `
            <tr>
              <td>${roll.material_type}</td>
              <td>${roll.width}" × ${roll.length}" × ${roll.thickness}"</td>
              <td>${roll.remaining_length}"</td>
              <td>${roll.location || "-"}</td>
              <td>${roll.status}</td>
              <td>$${(((roll.remaining_length as number) * (roll.width as number) * ((roll.cost_per_sqft as number) || 0)) / 144).toFixed(2)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `

    await this.generatePDFReport("Inventory Report", content, organizationPreferences)
  }

  async generateWasteReport(
    data: Record<string, unknown>,
    charts?: string,
    organizationPreferences?: UserDatePreferencesInput
  ): Promise<void> {
    const content = `
      <h1>Waste Analysis Report</h1>

      <div>
        <h2>Key Metrics</h2>
        <div>
          <div class="metric-card">
            <div class="metric-value">${(data.avgWaste as number)?.toFixed(1) || 0}%</div>
            <div class="metric-label">Average Waste</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.totalCuts || 0}</div>
            <div class="metric-label">Total Cuts</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${(data.totalWaste as number)?.toFixed(0) || 0} sqft</div>
            <div class="metric-label">Total Waste</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${(data.improvement as number)?.toFixed(1) || 0}%</div>
            <div class="metric-label">Improvement</div>
          </div>
        </div>
      </div>

      <h2>Analysis Period</h2>
      <p>From: ${this.formatPeriodValue(data.startDate, organizationPreferences)} To: ${this.formatPeriodValue(data.endDate, organizationPreferences)}</p>

      <h2>Material Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Material Type</th>
            <th>Cuts</th>
            <th>Avg Waste %</th>
            <th>Total Waste (sqft)</th>
            <th>Efficiency</th>
          </tr>
        </thead>
        <tbody>
          ${(
            (data.materials as Array<{
              name: string
              cuts: number
              avgWaste: number
              totalWaste: number
            }>) || []
          )
            .map(
              (material) => `
            <tr>
              <td>${material.name}</td>
              <td>${material.cuts}</td>
              <td>${material.avgWaste?.toFixed(1)}%</td>
              <td>${material.totalWaste?.toFixed(2)}</td>
              <td>${(100 - material.avgWaste).toFixed(1)}%</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      ${charts ? `<div>${charts}</div>` : ""}
    `

    await this.generatePDFReport("Waste Analysis Report", content, organizationPreferences)
  }
}

export const exportPdfService = new ExportPdfService()
