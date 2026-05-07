"use client"

import { useEffect, useState } from "react"
import { Building, ChevronLeft, CreditCard, Edit, Star, X } from "lucide-react"

import {
  type MaterialSupplierWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import { materialSuppliers as materialSuppliersSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"

import { SupplierMaterialsTab } from "./supplier-materials-tab"
import { SupplierOverviewTab } from "./supplier-overview-tab"
import { SupplierPerformanceTab } from "./supplier-performance-tab"

interface SupplierDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier
  onEdit: () => void
}

/**
 * Supplier detail viewer — Phase 3 PR 3h.
 *
 * Right-docked `<Sheet>` replacement for `SupplierDetailView`.
 * Width matches the form Sheet (`sm:max-w-4xl`) so view → edit
 * flips render in the same frame. Tabs use the same sticky strip
 * as the form for consistent navigation between dense sections.
 */
export function SupplierDetailSheet({
  open,
  onOpenChange,
  supplier,
  onEdit,
}: SupplierDetailSheetProps) {
  const [materialSuppliers, setMaterialSuppliers] = useState<MaterialSupplierWithDetails[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)

  useEffect(() => {
    if (!open || !supplier) return
    // `cancelled` guards against stale resolves — if the user
    // closes and reopens the detail sheet for a different supplier
    // before the first fetch resolves, the slow response would
    // otherwise overwrite the new supplier's data.
    let cancelled = false
    setLoadingMaterials(true)
    materialSuppliersSdk
      .list({ supplier_id: supplier.id })
      .then((data) => {
        if (!cancelled) setMaterialSuppliers(data as MaterialSupplierWithDetails[])
      })
      .catch((error) => {
        console.error("Error fetching material suppliers:", error)
        if (!cancelled) setMaterialSuppliers([])
      })
      .finally(() => {
        if (!cancelled) setLoadingMaterials(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, supplier])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-4xl">
        <SheetHeader className="flex flex-row items-start justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-start gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="space-y-1.5">
              <SheetTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
                <Building className="size-4" aria-hidden="true" />
                {supplier.name}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {supplier.preferred && (
                    <Badge variant="default" className="gap-1">
                      <Star className="size-3" aria-hidden="true" />
                      Preferred
                    </Badge>
                  )}
                  <Badge variant={supplier.active ? "default" : "secondary"}>
                    {supplier.active ? "Active" : "Inactive"}
                  </Badge>
                  {supplier.payment_terms && (
                    <Badge variant="outline" className="gap-1">
                      <CreditCard className="size-3" aria-hidden="true" />
                      {supplier.payment_terms}
                    </Badge>
                  )}
                </div>
              </SheetDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={onEdit} size="sm">
              <Edit className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 border-b bg-card px-6 py-3">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="materials">Materials & pricing</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <TabsContent value="overview" className="mt-0">
              <SupplierOverviewTab supplier={supplier} />
            </TabsContent>
            <TabsContent value="materials" className="mt-0">
              <SupplierMaterialsTab
                materialSuppliers={materialSuppliers}
                loadingMaterials={loadingMaterials}
              />
            </TabsContent>
            <TabsContent value="performance" className="mt-0">
              <SupplierPerformanceTab />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
