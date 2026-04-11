"use client"

import { useCallback, useEffect, useState } from "react"
import { Building, CreditCard, Star, Edit } from "lucide-react"

import {
  type Supplier,
  type MaterialSupplierWithDetails,
} from "@/src/infrastructure/models/supabase"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import { Badge } from "@/app/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { SupplierOverviewTab } from "./supplier-overview-tab"
import { SupplierMaterialsTab } from "./supplier-materials-tab"
import { SupplierPerformanceTab } from "./supplier-performance-tab"

interface SupplierDetailViewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier
  onEdit: () => void
}

export function SupplierDetailView({
  open,
  onOpenChange,
  supplier,
  onEdit,
}: SupplierDetailViewProps) {
  const [materialSuppliers, setMaterialSuppliers] = useState<MaterialSupplierWithDetails[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)

  const fetchMaterialSuppliers = useCallback(async () => {
    setLoadingMaterials(true)
    try {
      const data = await supplierService.getMaterialsBySupplier(supplier.id)
      setMaterialSuppliers(data)
    } catch (error) {
      console.error("Error fetching material suppliers:", error)
      setMaterialSuppliers([])
    } finally {
      setLoadingMaterials(false)
    }
  }, [supplier.id])

  useEffect(() => {
    if (open && supplier) {
      fetchMaterialSuppliers()
    }
  }, [open, supplier, fetchMaterialSuppliers])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Building className="h-6 w-6" />
                {supplier.name}
              </DialogTitle>
              <DialogDescription asChild className="mt-2">
                <div className="text-muted-foreground text-sm flex flex-wrap gap-2 mt-2">
                  {supplier.preferred && (
                    <Badge variant="default" className="bg-blue-600">
                      <Star className="h-3 w-3 mr-1" />
                      Preferred Supplier
                    </Badge>
                  )}
                  <Badge variant={supplier.active ? "default" : "secondary"}>
                    {supplier.active ? "Active" : "Inactive"}
                  </Badge>
                  {supplier.payment_terms && (
                    <Badge variant="outline">
                      <CreditCard className="h-3 w-3 mr-1" />
                      {supplier.payment_terms}
                    </Badge>
                  )}
                </div>
              </DialogDescription>
            </div>
            <Button onClick={onEdit} className="min-h-[44px]">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="materials">Materials & Pricing</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <SupplierOverviewTab supplier={supplier} />
          </TabsContent>

          <TabsContent value="materials" className="mt-6">
            <SupplierMaterialsTab
              materialSuppliers={materialSuppliers}
              loadingMaterials={loadingMaterials}
            />
          </TabsContent>

          <TabsContent value="performance" className="mt-6">
            <SupplierPerformanceTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
