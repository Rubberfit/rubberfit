"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link2, Package, DollarSign, Clock, ShoppingCart } from "lucide-react";

import type {
  Supplier,
  MaterialType,
  MaterialSupplier,
  CreateMaterialSupplier,
} from "@/lib/supabase";
import { materialTypeService } from "@/services/materialTypeService";
import { supplierService } from "@/services/supplierService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const materialSupplierSchema = z.object({
  material_type_id: z.string().min(1, "Material type is required"),
  supplier_id: z.string().min(1, "Supplier is required"),
  supplier_material_code: z.string().max(100).optional(),
  cost_per_sqft: z.number().min(0.01, "Cost must be greater than 0"),
  minimum_order_sqft: z.number().min(0).optional(),
  lead_time_days: z.number().min(0).optional(),
  preferred_supplier: z.boolean(),
  active: z.boolean(),
  notes: z.string().optional(),
  effective_date: z.string(),
  expiration_date: z.string().optional(),
});

type MaterialSupplierFormData = z.infer<typeof materialSupplierSchema>;

interface MaterialSupplierLinkProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialSupplier?: MaterialSupplier | null;
  defaultMaterialId?: string;
  defaultSupplierId?: string;
  onSuccess: () => void;
}

export function MaterialSupplierLink({
  open,
  onOpenChange,
  materialSupplier,
  defaultMaterialId,
  defaultSupplierId,
  onSuccess,
}: MaterialSupplierLinkProps) {
  const [submitting, setSubmitting] = useState(false);
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const form = useForm<MaterialSupplierFormData>({
    resolver: zodResolver(materialSupplierSchema),
    defaultValues: {
      material_type_id: defaultMaterialId || "",
      supplier_id: defaultSupplierId || "",
      supplier_material_code: "",
      cost_per_sqft: 0,
      minimum_order_sqft: undefined,
      lead_time_days: undefined,
      preferred_supplier: false,
      active: true,
      notes: "",
      effective_date: new Date().toISOString().split("T")[0],
      expiration_date: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  useEffect(() => {
    if (materialSupplier) {
      form.reset({
        material_type_id: materialSupplier.material_type_id,
        supplier_id: materialSupplier.supplier_id,
        supplier_material_code: materialSupplier.supplier_material_code || "",
        cost_per_sqft: materialSupplier.cost_per_sqft,
        minimum_order_sqft: materialSupplier.minimum_order_sqft || undefined,
        lead_time_days: materialSupplier.lead_time_days || undefined,
        preferred_supplier: materialSupplier.preferred_supplier,
        active: materialSupplier.active,
        notes: materialSupplier.notes || "",
        effective_date: materialSupplier.effective_date,
        expiration_date: materialSupplier.expiration_date || "",
      });
    } else {
      form.reset({
        material_type_id: defaultMaterialId || "",
        supplier_id: defaultSupplierId || "",
        supplier_material_code: "",
        cost_per_sqft: 0,
        minimum_order_sqft: undefined,
        lead_time_days: undefined,
        preferred_supplier: false,
        active: true,
        notes: "",
        effective_date: new Date().toISOString().split("T")[0],
        expiration_date: "",
      });
    }
  }, [materialSupplier, defaultMaterialId, defaultSupplierId, form]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [materialsData, suppliersData] = await Promise.all([
        materialTypeService.getAll(),
        supplierService.getActiveSuppliers(),
      ]);

      setMaterials(materialsData);
      setSuppliers(suppliersData);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoadingData(false);
    }
  };

  const onSubmit = async (data: MaterialSupplierFormData) => {
    setSubmitting(true);
    try {
      // Check for existing link if creating new
      if (!materialSupplier) {
        const existingLink = await supplierService.checkMaterialSupplierLink(
          data.material_type_id,
          data.supplier_id
        );

        if (existingLink) {
          toast.error("This material-supplier link already exists");
          setSubmitting(false);
          return;
        }
      }

      const linkData: CreateMaterialSupplier = {
        material_type_id: data.material_type_id,
        supplier_id: data.supplier_id,
        supplier_material_code: data.supplier_material_code?.trim() || undefined,
        cost_per_sqft: data.cost_per_sqft,
        minimum_order_sqft: data.minimum_order_sqft || undefined,
        lead_time_days: data.lead_time_days || undefined,
        preferred_supplier: data.preferred_supplier,
        active: data.active,
        notes: data.notes?.trim() || undefined,
        effective_date: data.effective_date,
        expiration_date: data.expiration_date || undefined,
      };

      if (materialSupplier) {
        await supplierService.updateMaterialSupplier(materialSupplier.id, linkData);
        toast.success("Material-supplier link updated successfully");
      } else {
        await supplierService.linkMaterialToSupplier(linkData);
        toast.success("Material-supplier link created successfully");
      }

      onSuccess();
    } catch (error: any) {
      console.error("Error saving material-supplier link:", error);
      toast.error(error.message || "Failed to save material-supplier link");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMaterial = materials.find((m) => m.id === form.watch("material_type_id"));
  const selectedSupplier = suppliers.find((s) => s.id === form.watch("supplier_id"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {materialSupplier ? "Edit Material-Supplier Link" : "Link Material to Supplier"}
          </DialogTitle>
          <DialogDescription>
            Configure pricing and ordering details for materials from suppliers
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Selection Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Material & Supplier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="material_type_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Package className="inline h-4 w-4 mr-2" />
                          Material Type *
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!!materialSupplier || !!defaultMaterialId}
                        >
                          <FormControl>
                            <SelectTrigger className="min-h-[44px]">
                              <SelectValue placeholder="Select material type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {materials.map((material) => (
                              <SelectItem key={material.id} value={material.id}>
                                {material.name}
                                {material.default_cost && (
                                  <span className="text-muted-foreground ml-2">
                                    (${material.default_cost}/sq ft)
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplier_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Package className="inline h-4 w-4 mr-2" />
                          Supplier *
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!!materialSupplier || !!defaultSupplierId}
                        >
                          <FormControl>
                            <SelectTrigger className="min-h-[44px]">
                              <SelectValue placeholder="Select supplier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                <div className="flex items-center gap-2">
                                  {supplier.name}
                                  {supplier.preferred && (
                                    <Badge variant="secondary" className="ml-2">
                                      Preferred
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplier_material_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier Material Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., NEO-4870-BK"
                            {...field}
                            className="min-h-[44px]"
                          />
                        </FormControl>
                        <FormDescription>
                          The supplier's internal code for this material
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Pricing Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing & Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cost_per_sqft"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <DollarSign className="inline h-4 w-4 mr-2" />
                            Cost per sq ft *
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="2.50"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              className="min-h-[44px]"
                            />
                          </FormControl>
                          {selectedMaterial?.default_cost && (
                            <FormDescription>
                              Default: ${selectedMaterial.default_cost.toFixed(2)}
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="minimum_order_sqft"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <ShoppingCart className="inline h-4 w-4 mr-2" />
                            Minimum Order (sq ft)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="500"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? parseInt(e.target.value) : undefined
                                )
                              }
                              className="min-h-[44px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="lead_time_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Clock className="inline h-4 w-4 mr-2" />
                          Lead Time (days)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            placeholder="14"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? parseInt(e.target.value) : undefined
                              )
                            }
                            className="min-h-[44px]"
                          />
                        </FormControl>
                        <FormDescription>
                          Standard delivery time for this material from this supplier
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4 items-start">
                    <FormField
                      control={form.control}
                      name="effective_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Effective Date *</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              className="min-h-[44px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expiration_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              className="min-h-[44px]"
                            />
                          </FormControl>
                          <FormDescription>
                            Leave blank for no expiration
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Preferences Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="preferred_supplier"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Preferred Supplier for Material
                          </FormLabel>
                          <FormDescription>
                            Mark this supplier as preferred for this specific material
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Enable or disable this material-supplier relationship
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Special terms, conditions, or notes about this material-supplier relationship..."
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

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
                  {submitting
                    ? "Saving..."
                    : materialSupplier
                    ? "Update Link"
                    : "Create Link"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}