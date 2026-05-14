"use client"

import { memo, useMemo } from "react"
import {
  Building2,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Download,
  Edit2,
  Eye,
  Mail,
  MoreVertical,
  Send,
  Truck,
  XCircle,
} from "lucide-react"

import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import { useUserPreferences } from "@/app/dashboard/_components/user-preferences-provider"
import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import type { ColumnDef } from "@/app/components/patterns/data-table"
import { formatUserDate } from "@/src/application/preferences/user-date-format"

import { handleDownloadPDF } from "./po-pdf-export"
import { getStatusBadge } from "./po-status-badge"

interface UsePoColumnsArgs {
  onView: (po: PurchaseOrderWithDetails) => void
  onEdit: (po: PurchaseOrderWithDetails) => void
  /** Resolves to `true` on success / `false` on rejection. Row
   * dropdown ignores the return; the drawer Submit gates close. */
  onUpdateStatus: (poId: string, next: PurchaseOrder["status"]) => Promise<boolean>
  onCancel: (po: PurchaseOrderWithDetails) => void
}

/**
 * Column registry for the PO `<DataTable>`. Lifted out of the
 * table component so the table function body stays under the
 * `max-lines-per-function` budget. Mirrors the inventory-table
 * pattern from PR 3a.
 */
export function usePoColumns({
  onView,
  onEdit,
  onUpdateStatus,
  onCancel,
}: UsePoColumnsArgs): ColumnDef<PurchaseOrderWithDetails>[] {
  // Two-source read (per the 2026-05-14 operator-seeds-prints
  // ruling): the viewer's per-user prefs drive on-screen cell dates,
  // and the workspace's org-level prefs drive the row PDF action
  // (Download PDF in the dropdown). Symmetric naming so a future
  // maintainer can't conflate the two.
  const userPreferences = useUserPreferences()
  const organizationPreferences = useOrganizationPreferences()
  return useMemo<ColumnDef<PurchaseOrderWithDetails>[]>(
    () => [
      {
        id: "po_number",
        header: "PO Number",
        cell: (po) => <span className="font-medium text-foreground">{po.po_number}</span>,
        sortFn: (po) => po.po_number ?? "",
        className: "w-[140px]",
      },
      {
        id: "supplier",
        header: "Supplier",
        cell: (po) => (
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-foreground">{po.supplier?.name ?? "Unknown"}</span>
          </div>
        ),
        sortFn: (po) => po.supplier?.name ?? "",
      },
      {
        id: "status",
        header: "Status",
        cell: (po) => getStatusBadge(po.status),
        sortFn: (po) => po.status,
        className: "w-[140px]",
      },
      {
        id: "order_date",
        header: "Order Date",
        cell: (po) => (
          <span className="text-sm text-muted-foreground">
            {formatUserDate(po.order_date, userPreferences) || "—"}
          </span>
        ),
        // Sort uses getTime() against the raw value — keep the
        // numeric comparison; display swap above does not change
        // ordering semantics.
        sortFn: (po) =>
          po.order_date ? new Date(po.order_date).getTime() : Number.MIN_SAFE_INTEGER,
        defaultSort: "desc",
      },
      {
        id: "delivery_date",
        header: "Delivery",
        cell: (po) => {
          // Use the formatted output to gate the icon — a shape-valid
          // invalid date (e.g. "2026-02-30") returns "" from the helper
          // and should fall through to the "—" placeholder, not render
          // an empty cell with a stray calendar glyph.
          const formatted = formatUserDate(po.requested_delivery_date, userPreferences)
          return formatted ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-3.5" aria-hidden="true" />
              {formatted}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )
        },
        sortFn: (po) =>
          po.requested_delivery_date
            ? new Date(po.requested_delivery_date).getTime()
            : Number.MIN_SAFE_INTEGER,
      },
      {
        id: "items",
        header: "Items",
        cell: (po) => (
          <Badge variant="outline" className="text-[11px]">
            {po.items?.length ?? 0}
          </Badge>
        ),
        sortFn: (po) => po.items?.length ?? 0,
        className: "w-[80px]",
        align: "center",
      },
      {
        id: "total",
        header: "Total",
        cell: (po) => (
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
            ${(po.total_amount ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        ),
        sortFn: (po) => po.total_amount ?? 0,
        align: "right",
      },
      {
        id: "actions",
        header: "",
        align: "right",
        className: "w-10",
        cell: (po) => (
          <PoActionsCell
            po={po}
            onView={onView}
            onEdit={onEdit}
            onUpdateStatus={onUpdateStatus}
            onCancel={onCancel}
            organizationPreferences={organizationPreferences}
          />
        ),
      },
    ],
    [onView, onEdit, onUpdateStatus, onCancel, userPreferences, organizationPreferences]
  )
}

interface PoActionsCellProps {
  po: PurchaseOrderWithDetails
  onView: (po: PurchaseOrderWithDetails) => void
  onEdit: (po: PurchaseOrderWithDetails) => void
  onUpdateStatus: (poId: string, next: PurchaseOrder["status"]) => Promise<boolean>
  onCancel: (po: PurchaseOrderWithDetails) => void
  organizationPreferences: ReturnType<typeof useOrganizationPreferences>
}

/**
 * Row-level action menu for the PO `<DataTable>`. Extracted from
 * the column registry's inline `cell` so the per-row event
 * handlers can use the project's `handle*` naming convention
 * instead of anonymous `() =>` callbacks. Wrapped in `memo` so
 * a list-level re-render doesn't redraw every row's dropdown
 * when nothing in this row changed (callbacks are stable refs
 * coming from `useInventoryColumns`-style memoized parents).
 */
function PoActionsCellInner({
  po,
  onView,
  onEdit,
  onUpdateStatus,
  onCancel,
  organizationPreferences,
}: PoActionsCellProps) {
  // `void onUpdateStatus(...)` discards the resolved value but
  // does NOT suppress an unexpected rejection — Promise rejects
  // without a handler trigger an `unhandledrejection` global
  // event. The `.catch(() => {})` is a defensive guard: per the
  // signature contract, `updatePOStatus` always resolves to a
  // boolean (it toasts internally on failure). The empty catch
  // exists only so a future contract drift doesn't surface as
  // a console-only error with no user feedback.
  function fireUpdate(next: PurchaseOrder["status"]) {
    onUpdateStatus(po.id, next).catch((error) => {
      console.error("[po-actions-cell] unexpected error updating status:", error)
    })
  }

  function handleTriggerClick(event: React.MouseEvent<HTMLButtonElement>) {
    // The row itself has a click handler that opens the drawer;
    // a click on the action menu trigger must not double-fire it.
    event.stopPropagation()
  }

  function handleViewClick() {
    onView(po)
  }

  function handleEditClick() {
    onEdit(po)
  }

  function handleSubmitForApprovalClick() {
    fireUpdate("pending")
  }

  function handleApproveClick() {
    fireUpdate("approved")
  }

  function handleMarkOrderedClick() {
    fireUpdate("ordered")
  }

  function handleReceiveClick() {
    fireUpdate("received")
  }

  function handleDownloadClick() {
    handleDownloadPDF(po, organizationPreferences)
  }

  function handleCancelClick() {
    onCancel(po)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={handleTriggerClick}
        >
          <MoreVertical className="size-4" aria-hidden="true" />
          <span className="sr-only">Row actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleViewClick}>
          <Eye className="size-3.5" aria-hidden="true" />
          View details
        </DropdownMenuItem>
        {po.status === "draft" && (
          <>
            <DropdownMenuItem onClick={handleEditClick}>
              <Edit2 className="size-3.5" aria-hidden="true" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSubmitForApprovalClick}>
              <Send className="size-3.5" aria-hidden="true" />
              Submit for approval
            </DropdownMenuItem>
          </>
        )}
        {po.status === "pending" && (
          <DropdownMenuItem onClick={handleApproveClick}>
            <CheckCircle className="size-3.5" aria-hidden="true" />
            Approve
          </DropdownMenuItem>
        )}
        {po.status === "approved" && (
          <DropdownMenuItem onClick={handleMarkOrderedClick}>
            <Truck className="size-3.5" aria-hidden="true" />
            Mark as ordered
          </DropdownMenuItem>
        )}
        {po.status === "ordered" && (
          <DropdownMenuItem onClick={handleReceiveClick}>
            <ClipboardCheck className="size-3.5" aria-hidden="true" />
            Receive goods
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDownloadClick}>
          <Download className="size-3.5" aria-hidden="true" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Mail className="size-3.5" aria-hidden="true" />
          Email to supplier
        </DropdownMenuItem>
        {po.status === "draft" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger-foreground focus:text-danger-foreground"
              onClick={handleCancelClick}
            >
              <XCircle className="size-3.5" aria-hidden="true" />
              Cancel
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const PoActionsCell = memo(PoActionsCellInner)
