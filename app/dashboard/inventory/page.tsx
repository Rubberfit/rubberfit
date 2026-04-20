"use client"

import { useState } from "react"
import { Plus, Download, FileText } from "lucide-react"
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
import {
  PageHeader,
  PageShell,
  ViewToolbar,
} from "@/app/components/patterns"
import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { exportService } from "@/src/infrastructure/services/exportService"
import { exportPdfService } from "@/src/infrastructure/services/exportPdfService"
import { useRole } from "@/src/infrastructure/services/useRole"

import { CSVUpload } from "../_components/csv-upload"
import { InventoryTable } from "../_components/inventory-table"
import { RollFormDialog } from "../_components/roll-form-dialog"

export default function InventoryPage() {
  const { user } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const readOnlyInventory = isRestrictedCutter(user?.roles)

  const { can, isLoading } = useRole()
  const canManageRolls = can("manageRolls")

  const handleUploadComplete = () => setRefreshKey((prev) => prev + 1)
  const handleAddSuccess = () => setRefreshKey((prev) => prev + 1)

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
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory" },
        ]}
        title="Inventory"
        subtitle={
          readOnlyInventory
            ? "View current rubber roll inventory"
            : "Rubber rolls in stock. Track, import, and manage material inventory."
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

      {canManageRolls && <CSVUpload onUploadComplete={handleUploadComplete} />}

      <Card className="overflow-hidden p-0">
        <ViewToolbar
          searchPlaceholder="Search rolls, material, location…"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <div className="p-0">
          <InventoryTable
            onRefresh={refreshKey}
            searchQuery={searchQuery}
            canManageRolls={canManageRolls}
          />
        </div>
      </Card>

      {canManageRolls && (
        <RollFormDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          roll={null}
          onSuccess={handleAddSuccess}
        />
      )}
    </PageShell>
  )
}
