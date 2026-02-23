import { format } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface ExportData {
  headers: string[];
  rows: any[][];
  filename?: string;
}

export const exportService = {
  // Export data to CSV
  exportToCSV(data: ExportData) {
    try {
      const { headers, rows, filename = 'export' } = data;

      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map(row =>
          row.map(cell => {
            // Handle values that might contain commas or quotes
            const cellStr = String(cell ?? '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          }).join(',')
        )
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    }
  },

  // Export inventory data
  exportInventory(rolls: any[]) {
    const headers = [
      'Material Type',
      'Width (in)',
      'Length (in)',
      'Thickness (in)',
      'Remaining Length (in)',
      'Color',
      'Location',
      'Status',
      'Supplier',
      'Cost per sqft',
      'Date Received',
      'Value',
    ];

    const rows = rolls.map(roll => [
      roll.material_type,
      roll.width,
      roll.length,
      roll.thickness,
      roll.remaining_length,
      roll.color || '',
      roll.location || '',
      roll.status,
      roll.supplier || '',
      roll.cost_per_sqft || 0,
      roll.date_received ? format(new Date(roll.date_received), 'yyyy-MM-dd') : '',
      ((roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144).toFixed(2),
    ]);

    this.exportToCSV({
      headers,
      rows,
      filename: 'inventory_export',
    });
  },

  // Export cut history
  exportCutHistory(cuts: any[]) {
    const headers = [
      'Date',
      'Material Type',
      'Cut Width (in)',
      'Cut Length (in)',
      'Quantity',
      'Total sqft Used',
      'Waste sqft',
      'Waste %',
      'Job Reference',
      'Cut By',
      'Notes',
    ];

    const rows = cuts.map(cut => [
      format(new Date(cut.created_at), 'yyyy-MM-dd HH:mm'),
      cut.rolls?.material_type || '',
      cut.cut_width,
      cut.cut_length,
      cut.quantity,
      cut.total_sqft_used?.toFixed(2) || 0,
      cut.waste_sqft?.toFixed(2) || 0,
      cut.waste_percentage?.toFixed(1) || 0,
      cut.job_reference || '',
      cut.cut_by || '',
      cut.notes || '',
    ]);

    this.exportToCSV({
      headers,
      rows,
      filename: 'cut_history_export',
    });
  },

  // Export waste analysis
  exportWasteAnalysis(data: any[]) {
    const headers = [
      'Period',
      'Total Cuts',
      'Avg Waste %',
      'Total Waste (sqft)',
      'Total Material Used (sqft)',
      'Efficiency %',
    ];

    const rows = data.map(item => [
      item.period,
      item.totalCuts,
      item.avgWaste?.toFixed(1) || 0,
      item.totalWaste?.toFixed(2) || 0,
      item.totalUsed?.toFixed(2) || 0,
      ((100 - (item.avgWaste || 0)).toFixed(1)),
    ]);

    this.exportToCSV({
      headers,
      rows,
      filename: 'waste_analysis_export',
    });
  },

  // Export material usage
  exportMaterialUsage(data: any[]) {
    const headers = [
      'Material Type',
      'Total Rolls',
      'Active Rolls',
      'Total sqft Available',
      'Total Value',
      'Avg Cost per sqft',
      'Low Stock Alert',
    ];

    const rows = data.map(item => [
      item.materialType,
      item.totalRolls,
      item.activeRolls,
      item.totalSqft?.toFixed(2) || 0,
      item.totalValue?.toFixed(2) || 0,
      item.avgCost?.toFixed(2) || 0,
      item.lowStock ? 'Yes' : 'No',
    ]);

    this.exportToCSV({
      headers,
      rows,
      filename: 'material_usage_export',
    });
  },

  // Generate PDF report with jsPDF for cross-platform compatibility
  async generatePDFReport(title: string, content: string) {
    try {
      // Create new PDF document
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Parse HTML content to extract data
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(content, 'text/html');

      // Set document properties
      doc.setProperties({
        title: title,
        subject: 'RubberFit Pro Report',
        author: 'RubberFit Pro',
        keywords: 'inventory, materials, rubber, optimization',
        creator: 'RubberFit Pro'
      });

      let yPosition = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);

      // Add header
      doc.setFontSize(18);
      doc.setTextColor(31, 41, 55); // #1f2937
      doc.text(title, margin, yPosition);
      yPosition += 10;

      // Add generation date
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // #6b7280
      doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy HH:mm')}`, margin, yPosition);
      yPosition += 15;

      // Process content sections
      const headings = htmlDoc.querySelectorAll('h1, h2, h3');
      const paragraphs = htmlDoc.querySelectorAll('p, li');
      const tables = htmlDoc.querySelectorAll('table');
      const metrics = htmlDoc.querySelectorAll('.metric-card');

      // Helper function to check if we need a new page
      const checkNewPage = (requiredSpace: number) => {
        if (yPosition + requiredSpace > pageHeight - 20) {
          doc.addPage();
          yPosition = 20;
          return true;
        }
        return false;
      };

      // Process all elements in order
      const allElements = htmlDoc.body.querySelectorAll('*');

      allElements.forEach((element) => {
        // Skip nested elements that we'll process with their parent
        if (element.closest('.metric-card') && element !== element.closest('.metric-card')) {
          return;
        }

        // Headings
        if (element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3') {
          checkNewPage(15);
          const fontSize = element.tagName === 'H1' ? 16 : element.tagName === 'H2' ? 14 : 12;
          doc.setFontSize(fontSize);
          doc.setTextColor(55, 65, 81); // #374151
          doc.text(element.textContent || '', margin, yPosition);
          yPosition += fontSize === 16 ? 12 : fontSize === 14 ? 10 : 8;
        }

        // Paragraphs
        else if (element.tagName === 'P' && !element.closest('.metric-card')) {
          checkNewPage(10);
          doc.setFontSize(10);
          doc.setTextColor(75, 85, 99); // #4b5563
          const lines = doc.splitTextToSize(element.textContent || '', contentWidth);
          lines.forEach((line: string) => {
            checkNewPage(5);
            doc.text(line, margin, yPosition);
            yPosition += 5;
          });
          yPosition += 3;
        }

        // Lists
        else if (element.tagName === 'UL' || element.tagName === 'OL') {
          const items = element.querySelectorAll('li');
          items.forEach((item) => {
            checkNewPage(8);
            doc.setFontSize(10);
            doc.setTextColor(75, 85, 99);
            const bullet = element.tagName === 'UL' ? '• ' : '- ';
            const text = bullet + (item.textContent || '');
            const lines = doc.splitTextToSize(text, contentWidth - 5);
            lines.forEach((line: string, index: number) => {
              checkNewPage(5);
              doc.text(index === 0 ? line : '  ' + line, margin, yPosition);
              yPosition += 5;
            });
          });
          yPosition += 3;
        }

        // Metric cards (summary values)
        else if (element.classList.contains('metric-card')) {
          checkNewPage(15);
          const valueEl = element.querySelector('.metric-value');
          const labelEl = element.querySelector('.metric-label');

          if (valueEl && labelEl) {
            // Draw background rectangle
            doc.setFillColor(249, 250, 251); // #f9fafb
            doc.rect(margin, yPosition - 5, 60, 12, 'F');

            // Add value
            doc.setFontSize(12);
            doc.setTextColor(31, 41, 55);
            doc.text(valueEl.textContent || '', margin + 2, yPosition);

            // Add label
            doc.setFontSize(9);
            doc.setTextColor(107, 114, 128);
            doc.text(labelEl.textContent || '', margin + 2, yPosition + 4);

            yPosition += 15;
          }
        }

        // Tables
        else if (element.tagName === 'TABLE') {
          checkNewPage(20);

          const headers: string[] = [];
          const rows: any[][] = [];

          // Extract headers
          element.querySelectorAll('thead th').forEach((th) => {
            headers.push(th.textContent || '');
          });

          // Extract rows
          element.querySelectorAll('tbody tr').forEach((tr) => {
            const row: string[] = [];
            tr.querySelectorAll('td').forEach((td) => {
              row.push(td.textContent || '');
            });
            if (row.length > 0) {
              rows.push(row);
            }
          });

          if (headers.length > 0 && rows.length > 0) {
            // Calculate column widths
            const colWidth = contentWidth / headers.length;

            // Draw header row
            doc.setFillColor(243, 244, 246); // #f3f4f6
            doc.rect(margin, yPosition - 5, contentWidth, 8, 'F');
            doc.setFontSize(9);
            doc.setTextColor(31, 41, 55);
            headers.forEach((header, index) => {
              doc.text(header, margin + (index * colWidth) + 2, yPosition);
            });
            yPosition += 8;

            // Draw data rows
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            rows.forEach((row) => {
              checkNewPage(7);
              row.forEach((cell, index) => {
                // Truncate text if too long
                const maxWidth = colWidth - 4;
                const text = doc.splitTextToSize(cell, maxWidth)[0];
                doc.text(text, margin + (index * colWidth) + 2, yPosition);
              });
              yPosition += 6;
            });

            yPosition += 5;
          }
        }
      });

      // Add footer on last page
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text('RubberFit Pro - Material Optimization System', margin, pageHeight - 10);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - margin - 10, pageHeight - 10);

      // Generate filename
      const filename = `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`;

      // Check if we're in Electron environment
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        // Check if the new savePDF method exists
        if ((window as any).electronAPI.savePDF) {
          // Use the new dedicated PDF save method
          const pdfBlob = doc.output('blob');
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64data = reader.result as string;

            try {
              const result = await (window as any).electronAPI.savePDF(base64data, filename);
              if (result.success) {
                toast.success('PDF report saved successfully');
              } else if (result.cancelled) {
                toast.info('Save cancelled');
              } else {
                throw new Error(result.error || 'Failed to save PDF');
              }
            } catch (error) {
              // Fallback to browser download
              doc.save(filename);
              toast.success('PDF report downloaded successfully');
            }
          };
          reader.readAsDataURL(pdfBlob);
        } else {
          // Try the older saveFile method
          const pdfBlob = doc.output('blob');
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64data = reader.result as string;
            const pdfContent = base64data.split(',')[1];

            try {
              const saved = await (window as any).electronAPI.saveFile(pdfContent, filename);
              if (saved) {
                toast.success('PDF report saved successfully');
              } else {
                toast.info('Save cancelled');
              }
            } catch (error) {
              // Fallback to browser download
              doc.save(filename);
              toast.success('PDF report downloaded successfully');
            }
          };
          reader.readAsDataURL(pdfBlob);
        }
      } else {
        // Browser environment - use jsPDF's built-in save
        doc.save(filename);
        toast.success('PDF report downloaded successfully');
      }

    } catch (error) {
      console.error('Error generating PDF report:', error);
      toast.error('Failed to generate PDF report');

      // Fallback to blob download if jsPDF fails
      this.fallbackPDFDownload(title, content);
    }
  },

  // Fallback method using blob download
  fallbackPDFDownload(title: string, htmlContent: string) {
    try {
      // Create a simplified text version for fallback
      const textContent = `${title}\n${'='.repeat(50)}\n\nGenerated: ${format(new Date(), 'MMMM dd, yyyy HH:mm')}\n\n${htmlContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}\n\n---\nRubberFit Pro - Material Optimization System`;

      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.info('Report downloaded as text file (PDF generation failed)');
    } catch (fallbackError) {
      console.error('Fallback download also failed:', fallbackError);
      toast.error('Unable to download report');
    }
  },

  // Generate inventory report
  async generateInventoryReport(rolls: any[], summary: any) {
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
            <div class="metric-value">$${(summary.totalValue || 0).toFixed(2)}</div>
            <div class="metric-label">Total Value</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${(summary.totalSqft || 0).toFixed(0)} sqft</div>
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
          ${rolls.map(roll => `
            <tr>
              <td>${roll.material_type}</td>
              <td>${roll.width}" × ${roll.length}" × ${roll.thickness}"</td>
              <td>${roll.remaining_length}"</td>
              <td>${roll.location || '-'}</td>
              <td>${roll.status}</td>
              <td>$${((roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    await this.generatePDFReport('Inventory Report', content);
  },

  // Generate waste analysis report
  async generateWasteReport(data: any, charts?: string) {
    const content = `
      <h1>Waste Analysis Report</h1>

      <div>
        <h2>Key Metrics</h2>
        <div>
          <div class="metric-card">
            <div class="metric-value">${data.avgWaste?.toFixed(1) || 0}%</div>
            <div class="metric-label">Average Waste</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.totalCuts || 0}</div>
            <div class="metric-label">Total Cuts</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.totalWaste?.toFixed(0) || 0} sqft</div>
            <div class="metric-label">Total Waste</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.improvement?.toFixed(1) || 0}%</div>
            <div class="metric-label">Improvement</div>
          </div>
        </div>
      </div>

      <h2>Analysis Period</h2>
      <p>From: ${data.startDate} To: ${data.endDate}</p>

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
          ${(data.materials || []).map((material: any) => `
            <tr>
              <td>${material.name}</td>
              <td>${material.cuts}</td>
              <td>${material.avgWaste?.toFixed(1)}%</td>
              <td>${material.totalWaste?.toFixed(2)}</td>
              <td>${(100 - material.avgWaste).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${charts ? `<div>${charts}</div>` : ''}
    `;

    await this.generatePDFReport('Waste Analysis Report', content);
  },
};