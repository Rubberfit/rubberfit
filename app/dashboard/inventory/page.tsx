"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Download, FileText, Printer } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/app/contexts/AuthContext"
import { isRestrictedCutter } from "@/app/lib/rbac"
import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"
import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { exportService } from "@/src/infrastructure/services/exportService"
import { exportPdfService } from "@/src/infrastructure/services/exportPdfService"
import { useRole } from "@/src/infrastructure/services/useRole"

import { CSVUpload } from "./_components/csv-upload"
import { InventoryTable } from "./_components/inventory-table"
import { RollFormDialog } from "./_components/roll-form-dialog"
import { downloadRollLabelPdf } from "./_components/roll-label-pdf"

function InventoryPageInner() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const readOnlyInventory = isRestrictedCutter(user?.roles)

  // `?scan=<part_number>` lands here after someone scans a printed
  // QR label with their phone (see `app/r/[partNumber]/page.tsx`).
  // Held in local state so we can keep the URL clean after the
  // drawer opens for the matching roll.
  const scanFromUrl = searchParams.get("scan")
  const [scanTarget, setScanTarget] = useState<string | null>(scanFromUrl)
  const scanToastRef = useRef<string | null>(null)

  useEffect(() => {
    if (scanFromUrl && scanToastRef.current !== scanFromUrl) {
      scanToastRef.current = scanFromUrl
      toast.message("Opening scanned roll…", {
        description: `Looking up ${scanFromUrl}`,
      })
    }
  }, [scanFromUrl])

  const { can, isLoading } = useRole()
  const canManageRolls = can("manageRolls")

  const bumpRefresh = () => setRefreshKey((prev) => prev + 1)

  const handleExportCSV = async () => {
    try {
      const rolls = await rollsSdk.list({ status: "active" })
      if (rolls && rolls.length > 0) {
        exportService.exportInventory(rolls as unknown as Record<string, unknown>[])
      } else {
        toast.error("No data to export")
      }
    } catch (error) {
      console.error("Error exporting inventory:", error)
      toast.error("Failed to export inventory")
    }
  }

  const handlePrintAllLabels = async () => {
    try {
      const list = await rollsSdk.list({ status: "active" })
      if (!list || list.length === 0) {
        toast.error("No active rolls to label")
        return
      }
      downloadRollLabelPdf(list)
      toast.success(`Labels generated for ${list.length} roll${list.length === 1 ? "" : "s"}`)
    } catch (error) {
      console.error("Error generating labels:", error)
      toast.error("Failed to generate labels")
    }
  }

  const handleExportPDF = async () => {
    try {
      const rolls = await rollsSdk.list({ status: "active" })
      const summary = {
        totalRolls: rolls?.length || 0,
        activeRolls: rolls?.filter((r) => r.status === "active").length || 0,
        totalValue:
          rolls?.reduce(
            (sum, roll) =>
              sum + (roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144,
            0
          ) || 0,
        totalSqft:
          rolls?.reduce((sum, roll) => sum + (roll.remaining_length * roll.width) / 144, 0) || 0,
      }
      if (rolls && rolls.length > 0) {
        await exportPdfService.generateInventoryReport(
          rolls as unknown as Record<string, unknown>[],
          summary as Record<string, unknown>
        )
      } else {
        toast.error("No data to export")
      }
    } catch (error) {
      console.error("Error generating report:", error)
      toast.error("Failed to generate report")
    }
  }

  if (isLoading) return null

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Inventory" }]}
        title="Inventory"
        subtitle={
          readOnlyInventory
            ? "View current rubber roll inventory"
            : "Rubber rolls in stock. Click any roll to preview the sheet and jump into the cutting engine."
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="size-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileText className="size-3.5" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileText className="size-3.5" />
                  Generate PDF Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrintAllLabels}>
                  <Printer className="size-3.5" />
                  Print all active labels
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManageRolls && (
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="size-3.5" />
                Add Roll
              </Button>
            )}
          </>
        }
      />

      {canManageRolls && <CSVUpload onUploadComplete={bumpRefresh} />}

      <Card className="overflow-hidden p-0 gap-0">
        <ViewToolbar
          searchPlaceholder="Search rolls, material, location…"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <InventoryTable
          refreshKey={refreshKey}
          searchQuery={searchQuery}
          canManageRolls={canManageRolls}
          onMutated={bumpRefresh}
          scanPartNumber={scanTarget ?? undefined}
          onScanResolved={() => {
            // Consume the one-shot scan target so a refresh doesn't
            // re-open the drawer, and clean the URL so the short
            // path stays usable as a bookmark.
            setScanTarget(null)
            router.replace("/dashboard/inventory")
          }}
        />
      </Card>

      {canManageRolls && (
        <RollFormDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          roll={null}
          onSuccess={bumpRefresh}
        />
      )}
    </PageShell>
  )
}

export default function InventoryPage() {
  // `useSearchParams` requires a Suspense boundary in Next 16.
  return (
    <Suspense fallback={null}>
      <InventoryPageInner />
    </Suspense>
  )
}
