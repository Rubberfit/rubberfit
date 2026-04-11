"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { Plus, Search, Filter, Star } from "lucide-react"

import { type Supplier } from "@/app/lib/supabase"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
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
      const data = await supplierService.getAllSuppliersOrdered()
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
      await supplierService.deleteSupplier(supplierToDelete.id)

      toast.success(`${supplierToDelete.name} has been deleted`)
      fetchSuppliers()
    } catch (error) {
      console.error("Error deleting supplier:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete supplier")
    } finally {
      setDeleteAlertOpen(false)
      setSupplierToDelete(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground">
            Manage your material suppliers and vendor relationships
          </p>
        </div>
        <Button onClick={handleAddSupplier} size="lg" className="min-h-[44px]">
          <Plus className="mr-2 h-5 w-5" />
          Add Supplier
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, contact, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterPreferred ? "default" : "outline"}
                onClick={() => setFilterPreferred(!filterPreferred)}
                size="lg"
                className="min-h-[44px]"
              >
                <Star className="mr-2 h-4 w-4" />
                Preferred
              </Button>
              <Button
                variant={filterActive ? "default" : "outline"}
                onClick={() => setFilterActive(!filterActive)}
                size="lg"
                className="min-h-[44px]"
              >
                <Filter className="mr-2 h-4 w-4" />
                Active Only
              </Button>
            </div>
          </div>
        </CardContent>
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
    </div>
  )
}
