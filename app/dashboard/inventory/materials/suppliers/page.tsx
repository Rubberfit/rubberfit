"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { Plus, Filter, Star } from "lucide-react"

import { type Supplier } from "@/src/infrastructure/models/supabase"
import { suppliers as suppliersSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { Card } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"
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
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"

import { SupplierFormModal } from "./_components/supplier-form-modal"
import { SupplierDetailView } from "./_components/supplier-detail-view"
import { SuppliersTableCard } from "./_components/suppliers-table-card"

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterPreferred, setFilterPreferred] = useState(false)
  const [filterActive, setFilterActive] = useState(true)

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)

  // Selected supplier states
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
    fetchSuppliers()
  }, [fetchSuppliers])

  // Filter suppliers based on search and filter criteria
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const matchesSearch =
        searchTerm === "" ||
        supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesPreferred = !filterPreferred || supplier.preferred
      const matchesActive = !filterActive || supplier.active

      return matchesSearch && matchesPreferred && matchesActive
    })
  }, [suppliers, searchTerm, filterPreferred, filterActive])

  const handleAddSupplier = () => {
    setSelectedSupplier(null)
    setFormModalOpen(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setFormModalOpen(true)
  }

  const handleViewSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setDetailModalOpen(true)
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
      fetchSuppliers()
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
              <Button
                variant={filterPreferred ? "default" : "outline"}
                onClick={() => setFilterPreferred(!filterPreferred)}
                size="sm"
              >
                <Star className="size-3.5" />
                Preferred
              </Button>
              <Button
                variant={filterActive ? "default" : "outline"}
                onClick={() => setFilterActive(!filterActive)}
                size="sm"
              >
                <Filter className="size-3.5" />
                Active only
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
        filterActive={filterActive}
        onViewSupplier={handleViewSupplier}
        onEditSupplier={handleEditSupplier}
        onDeleteClick={handleDeleteClick}
      />

      {/* Modals */}
      <SupplierFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        supplier={selectedSupplier}
        onSuccess={() => {
          fetchSuppliers()
          setFormModalOpen(false)
        }}
      />

      {selectedSupplier && (
        <SupplierDetailView
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          supplier={selectedSupplier}
          onEdit={() => {
            setDetailModalOpen(false)
            handleEditSupplier(selectedSupplier)
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{supplierToDelete?.name}</strong>? This action
              cannot be undone and will remove all associated pricing and order history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 min-h-[44px]"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
