"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  type Supplier,
  type MaterialSupplier,
  type MaterialSupplierWithDetails,
} from "@/app/lib/supabase"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { taxService } from "@/src/infrastructure/services/taxService"
import { MaterialSupplierLink } from "./material-supplier-link"
import { SupplierLinkedMaterials } from "./supplier-linked-materials"
import { SupplierGeneralFields } from "./supplier-general-fields"
import { SupplierShippingFields } from "./supplier-shipping-fields"
import { SupplierAddressFields } from "./supplier-address-fields"
import { SupplierPreferencesFields } from "./supplier-preferences-fields"
import {
  supplierSchema,
  type SupplierFormData,
  DEFAULT_FORM_VALUES,
  buildSupplierPayload,
  supplierToFormData,
} from "./supplier-form-schema"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { toast } from "sonner"
import { Form } from "@/app/components/ui/form"

interface SupplierFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: Supplier | null
  onSuccess: () => void
}

export function SupplierFormModal({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierFormModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [resolvedTaxRate, setResolvedTaxRate] = useState<{
    rate: number
    name: string
    level: string
  } | null>(null)
  const [loadingTaxRate, setLoadingTaxRate] = useState(false)
  const [linkedMaterials, setLinkedMaterials] = useState<MaterialSupplierWithDetails[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<MaterialSupplier | null>(null)

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  })

  const fetchLinkedMaterials = useCallback(async (supplierId: string) => {
    setLoadingMaterials(true)
    try {
      const materials = await supplierService.getMaterialsBySupplier(supplierId)
      setLinkedMaterials(materials || [])
    } catch (error) {
      console.error("Error fetching linked materials:", error)
    } finally {
      setLoadingMaterials(false)
    }
  }, [])

  useEffect(() => {
    if (open && supplier) {
      fetchLinkedMaterials(supplier.id)
      form.reset(supplierToFormData(supplier))
    } else if (open && !supplier) {
      setLinkedMaterials([])
      form.reset(DEFAULT_FORM_VALUES)
    }
  }, [open, supplier, fetchLinkedMaterials, form])

  // Watch ZIP code changes and resolve tax rate via Avalara
  const watchedZip = form.watch("zip_code")
  const watchedState = form.watch("state")
  const watchedCity = form.watch("city")
  const watchedTaxExempt = form.watch("tax_exempt")

  useEffect(() => {
    if (!watchedZip || watchedTaxExempt) {
      setResolvedTaxRate(null)
      return
    }

    const timer = setTimeout(async () => {
      setLoadingTaxRate(true)
      try {
        const result = await taxService.getTaxRateForLocation(
          watchedState || null,
          watchedCity || null,
          watchedZip
        )
        setResolvedTaxRate({
          rate: result.tax_rate,
          name: result.tax_name,
          level: result.tax_level,
        })
      } catch (_error) {
        setResolvedTaxRate(null)
      } finally {
        setLoadingTaxRate(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [watchedZip, watchedState, watchedCity, watchedTaxExempt])

  const onSubmit = async (data: SupplierFormData) => {
    setSubmitting(true)
    try {
      const supplierData = buildSupplierPayload(data, !!supplier)

      if (supplier) {
        await supplierService.updateSupplier(
          supplier.id,
          supplierData as Partial<Omit<Supplier, "id" | "user_id" | "created_at" | "updated_at">>
        )
        toast.success("Supplier updated successfully")
      } else {
        await supplierService.createSupplier(
          supplierData as Omit<Supplier, "id" | "user_id" | "created_at" | "updated_at">
        )
        toast.success("Supplier created successfully")
      }

      // Proactively cache tax rate when ZIP code changes
      const newZip = data.zip_code?.trim()
      const oldZip = supplier?.zip_code?.trim()
      if (newZip && newZip !== oldZip && !data.tax_exempt) {
        taxService
          .getTaxRateForLocation(data.state?.trim() || null, data.city?.trim() || null, newZip)
          .catch((err) => console.warn("Proactive tax cache failed:", err))
      }

      onSuccess()
    } catch (error) {
      console.error("Error saving supplier:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save supplier")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
          <DialogDescription>
            {supplier
              ? "Update supplier information and contact details"
              : "Add a new supplier to your vendor management system"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className={`grid w-full ${supplier ? "grid-cols-5" : "grid-cols-4"}`}>
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="address">Address</TabsTrigger>
                <TabsTrigger value="taxship">Tax & Shipping</TabsTrigger>
                <TabsTrigger value="preferences">Preferences</TabsTrigger>
                {supplier && <TabsTrigger value="materials">Materials</TabsTrigger>}
              </TabsList>

              <TabsContent value="basic" className="space-y-6 mt-6">
                <SupplierGeneralFields form={form} />
              </TabsContent>
              <TabsContent value="address" className="space-y-6 mt-6">
                <SupplierAddressFields form={form} />
              </TabsContent>
              <TabsContent value="taxship" className="space-y-6 mt-6">
                <SupplierShippingFields
                  form={form}
                  resolvedTaxRate={resolvedTaxRate}
                  loadingTaxRate={loadingTaxRate}
                />
              </TabsContent>
              {supplier && (
                <TabsContent value="materials" className="space-y-4 mt-4">
                  <SupplierLinkedMaterials
                    supplierName={supplier.name}
                    linkedMaterials={linkedMaterials}
                    loadingMaterials={loadingMaterials}
                    supplierId={supplier.id}
                    onEditLink={(link) => {
                      setEditingLink(link)
                      setLinkModalOpen(true)
                    }}
                    onAddLink={() => {
                      setEditingLink(null)
                      setLinkModalOpen(true)
                    }}
                    onRefresh={fetchLinkedMaterials}
                  />
                </TabsContent>
              )}
              <TabsContent value="preferences" className="space-y-4 mt-4">
                <SupplierPreferencesFields form={form} />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="min-h-[44px]">
                {submitting ? "Saving..." : supplier ? "Update Supplier" : "Create Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {supplier && (
        <MaterialSupplierLink
          open={linkModalOpen}
          onOpenChange={setLinkModalOpen}
          materialSupplier={editingLink}
          defaultSupplierId={supplier.id}
          onSuccess={() => {
            setLinkModalOpen(false)
            setEditingLink(null)
            fetchLinkedMaterials(supplier.id)
          }}
        />
      )}
    </Dialog>
  )
}
