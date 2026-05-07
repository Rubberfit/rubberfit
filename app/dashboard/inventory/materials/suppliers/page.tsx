"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Star } from "lucide-react"
import { toast } from "sonner"

import { type Supplier } from "@/src/infrastructure/models/supabase"
import { suppliers as suppliersSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"

import { SupplierDetailSheet } from "./_components/supplier-detail-sheet"
import { SupplierFormSheet } from "./_components/supplier-form-sheet"
import { SuppliersTableCard } from "./_components/suppliers-table-card"

type ActiveFilter = "all" | "active" | "inactive"

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterPreferred, setFilterPreferred] = useState(false)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active")

  const [formSheetOpen, setFormSheetOpen] = useState(false)
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await suppliersSdk.list()
      setSuppliers(data)
    } catch (error) {
      console.error("Error fetching suppliers:", error)
      toast.error("Failed to load suppliers")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSuppliers()
  }, [fetchSuppliers])

  const filteredSuppliers = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase()
    return suppliers.filter((supplier) => {
      const matchesSearch =
        searchTerm === "" ||
        supplier.name.toLowerCase().includes(lowerSearch) ||
        supplier.contact_person?.toLowerCase().includes(lowerSearch) ||
        supplier.email?.toLowerCase().includes(lowerSearch)

      const matchesPreferred = !filterPreferred || supplier.preferred
      const matchesActive =
        activeFilter === "all" || (activeFilter === "active" ? supplier.active : !supplier.active)

      return matchesSearch && matchesPreferred && matchesActive
    })
  }, [suppliers, searchTerm, filterPreferred, activeFilter])

  const handleAddSupplier = () => {
    setSelectedSupplier(null)
    setFormSheetOpen(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setFormSheetOpen(true)
  }

  const handleViewSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setDetailSheetOpen(true)
  }

  const handleDeleteClick = (supplier: Supplier) => {
    setSupplierToDelete(supplier)
    setDeleteAlertOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!supplierToDelete) return

    try {
      await suppliersSdk.delete(supplierToDelete.id)
      toast.success(`${supplierToDelete.name} has been deleted`)
      void fetchSuppliers()
    } catch (error) {
      const errCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: string }).code
          : undefined
      const isFkError =
        errCode === "23503" ||
        errCode === "FK_VIOLATION_MATERIAL_SUPPLIERS_EXIST" ||
        ((error as { message?: string }).message?.includes("foreign key constraint") ?? false)
      toast.error("Cannot delete supplier", {
        description: isFkError
          ? "This supplier is referenced by existing purchase orders or material records"
          : error instanceof Error
            ? error.message
            : "Failed to delete supplier",
      })
    } finally {
      setDeleteAlertOpen(false)
      setSupplierToDelete(null)
    }
  }

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Materials", href: "/dashboard/inventory/materials" },
          { label: "Suppliers" },
        ]}
        title="Suppliers"
        subtitle="Supplier profiles, shipping preferences, and performance history."
        actions={
          <Button onClick={handleAddSupplier} size="sm">
            <Plus className="size-3.5" />
            Add supplier
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <ViewToolbar
          searchPlaceholder="Search name, contact, or email…"
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={
            <>
              <Select
                value={activeFilter}
                onValueChange={(value) => setActiveFilter(value as ActiveFilter)}
              >
                <SelectTrigger className="h-9 w-[160px] text-sm">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={filterPreferred ? "default" : "outline"}
                onClick={() => setFilterPreferred(!filterPreferred)}
                size="sm"
              >
                <Star className="size-3.5" />
                Preferred
              </Button>
            </>
          }
        />
      </Card>

      <SuppliersTableCard
        suppliers={filteredSuppliers}
        loading={loading}
        searchTerm={searchTerm}
        filterPreferred={filterPreferred}
        filterActive={activeFilter === "active"}
        onViewSupplier={handleViewSupplier}
        onEditSupplier={handleEditSupplier}
        onDeleteClick={handleDeleteClick}
      />

      <SupplierFormSheet
        open={formSheetOpen}
        onOpenChange={setFormSheetOpen}
        supplier={selectedSupplier}
        onSuccess={() => {
          void fetchSuppliers()
          setFormSheetOpen(false)
        }}
      />

      {selectedSupplier && (
        <SupplierDetailSheet
          open={detailSheetOpen}
          onOpenChange={setDetailSheetOpen}
          supplier={selectedSupplier}
          onEdit={() => {
            setDetailSheetOpen(false)
            handleEditSupplier(selectedSupplier)
          }}
        />
      )}

      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{supplierToDelete?.name}</strong>. This action
              cannot be undone and will remove all associated pricing and order history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
