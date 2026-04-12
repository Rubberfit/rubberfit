import { format } from "date-fns"

import { type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

// eslint-disable-next-line complexity
export function handleDownloadPDF(po: PurchaseOrderWithDetails) {
  // Create a PDF version of the PO
  const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order #${po.po_number}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .section { margin-bottom: 20px; }
          .label { font-weight: bold; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .totals { margin-top: 20px; text-align: right; }
          .total-row { display: flex; justify-content: flex-end; margin: 5px 0; }
          .total-label { width: 150px; text-align: right; margin-right: 20px; }
          .total-value { width: 100px; text-align: right; font-weight: bold; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Purchase Order #${po.po_number}</h1>

        <div class="header">
          <div class="section">
            <div class="label">Date:</div>
            <div>${format(new Date(), "MMM dd, yyyy")}</div>
            <div class="label" style="margin-top: 10px;">Status:</div>
            <div>${po.status?.toUpperCase() || "PENDING"}</div>
          </div>
          <div class="section">
            <div class="label">Supplier:</div>
            <div>${po.supplier?.name || "N/A"}</div>
            <div>${po.supplier?.email || ""}</div>
            <div>${po.supplier?.phone || ""}</div>
          </div>
        </div>

        <div class="header">
          <div class="section">
            <div class="label">Requested Delivery:</div>
            <div>${po.requested_delivery_date ? format(new Date(po.requested_delivery_date), "MMM dd, yyyy") : "N/A"}</div>
          </div>
          <div class="section">
            <div class="label">Payment Terms:</div>
            <div>${po.supplier?.payment_terms || "Net 30"}</div>
          </div>
        </div>

        <div class="section">
          <div class="label">Shipping Address:</div>
          <div>${po.shipping_address || "Default warehouse address"}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              po.items
                ?.map(
                  (item, index) => `
              <tr>
                <td>#${index + 1}</td>
                <td>
                  ${item.description || "N/A"}
                  ${item.width ? `<br>Width: ${item.width}"` : ""}
                  ${item.thickness ? `<br>Thickness: ${item.thickness}"` : ""}
                  ${item.color ? `<br>Color: ${item.color}` : ""}
                </td>
                <td>${item.quantity_sqft?.toFixed(2) || 0} sq ft</td>
                <td>$${item.unit_cost?.toFixed(2) || 0}</td>
                <td>$${((item.quantity_sqft || 0) * (item.unit_cost || 0)).toFixed(2)}</td>
              </tr>
            `
                )
                .join("") || '<tr><td colspan="5">No items</td></tr>'
            }
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span class="total-label">Subtotal:</span>
            <span class="total-value">$${po.subtotal?.toFixed(2) || "0.00"}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Tax${po.tax_amount && po.subtotal ? ` (${((po.tax_amount / po.subtotal) * 100).toFixed(1)}%)` : ""}:</span>
            <span class="total-value">$${po.tax_amount?.toFixed(2) || "0.00"}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Shipping:</span>
            <span class="total-value">$${po.shipping_cost?.toFixed(2) || "0.00"}</span>
          </div>
          <div class="total-row" style="font-size: 1.2em; margin-top: 10px; padding-top: 10px; border-top: 2px solid #333;">
            <span class="total-label">Total:</span>
            <span class="total-value">$${po.total_amount?.toFixed(2) || "0.00"}</span>
          </div>
        </div>

        ${
          po.notes
            ? `
          <div class="section" style="margin-top: 30px;">
            <div class="label">Notes:</div>
            <div>${po.notes}</div>
          </div>
        `
            : ""
        }

        <div class="footer">
          <p>Generated on ${format(new Date(), "MMM dd, yyyy HH:mm")} | Rema Portal</p>
        </div>
      </body>
      </html>
    `

  // Print via hidden iframe
  const printFrame = document.createElement("iframe")
  printFrame.style.position = "absolute"
  printFrame.style.top = "-9999px"
  printFrame.style.left = "-9999px"
  printFrame.style.width = "0"
  printFrame.style.height = "0"
  document.body.appendChild(printFrame)

  if (printFrame.contentWindow) {
    printFrame.contentWindow.document.write(printContent)
    printFrame.contentWindow.document.close()
    printFrame.contentWindow.focus()
    printFrame.contentWindow.print()
  }

  // Clean up after a delay
  setTimeout(() => {
    document.body.removeChild(printFrame)
  }, 1000)
}
