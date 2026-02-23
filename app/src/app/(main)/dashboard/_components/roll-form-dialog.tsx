"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Calendar } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { rollService } from "@/services/rollService";
import { supplierService } from "@/services/supplierService";
import type { Roll, MaterialType } from "@/lib/supabase";
import { SupplierSelect } from "../materials/suppliers/_components/supplier-selection";

const rollFormSchema = z.object({
  material_type: z.string().min(1, "Material type is required"),
  width: z.coerce.number().positive("Width must be greater than 0"),
  length: z.coerce.number().positive("Length must be greater than 0"),
  thickness: z.coerce.number().positive("Thickness must be greater than 0"),
  color: z.string().optional(),
  location: z.string().optional(),
  date_received: z.string().min(1, "Date received is required"),
  supplier: z.string().optional(),
  cost_per_sqft: z.coerce.number().min(0, "Cost must be 0 or greater").optional(),
  notes: z.string().optional(),
  remaining_length: z.coerce.number().min(0).optional(),
});

type RollFormValues = z.infer<typeof rollFormSchema>;

interface RollFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roll?: Roll | null;
  onSuccess?: () => void;
}

export function RollFormDialog({
  open,
  onOpenChange,
  roll,
  onSuccess,
}: RollFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const isEdit = !!roll;

  const form = useForm<RollFormValues>({
    resolver: zodResolver(rollFormSchema),
    defaultValues: {
      material_type: "",
      width: 0,
      length: 0,
      thickness: 0,
      color: "",
      location: "",
      date_received: format(new Date(), "yyyy-MM-dd"),
      supplier: "",
      cost_per_sqft: 2.5,
      notes: "",
      remaining_length: undefined,
    },
  });

  // Fetch material types on mount
  useEffect(() => {
    const fetchMaterialTypes = async () => {
      try {
        const types = await rollService.getMaterialTypes();
        setMaterialTypes(types);
      } catch (error) {
        console.error("Error fetching material types:", error);
        toast.error("Failed to load material types");
      }
    };
    fetchMaterialTypes();
  }, []);

  // Reset form when roll changes or dialog opens
  useEffect(() => {
    if (roll) {
      form.reset({
        material_type: roll.material_type,
        width: roll.width,
        length: roll.length,
        thickness: roll.thickness,
        color: roll.color || "",
        location: roll.location || "",
        date_received: roll.date_received ?
          format(new Date(roll.date_received), "yyyy-MM-dd") :
          format(new Date(), "yyyy-MM-dd"),
        supplier: roll.supplier || "",
        cost_per_sqft: roll.cost_per_sqft || 2.5,
        notes: roll.notes || "",
        remaining_length: roll.remaining_length,
      });
    } else {
      form.reset({
        material_type: "",
        width: 0,
        length: 0,
        thickness: 0,
        color: "",
        location: "",
        date_received: format(new Date(), "yyyy-MM-dd"),
        supplier: "",
        cost_per_sqft: 2.5,
        notes: "",
        remaining_length: undefined,
      });
    }
  }, [roll, form]);

  const onSubmit = async (values: RollFormValues) => {
    setLoading(true);
    try {
      if (isEdit && roll) {
        // Update existing roll
        await rollService.updateRoll(roll.id, {
          ...values,
          remaining_length: values.remaining_length ?? values.length,
        });
        toast.success("Roll updated successfully");
      } else {
        // Add new roll
        await rollService.addRoll({
          ...values,
          remaining_length: values.length, // Set remaining_length to length for new rolls
          status: 'active',
        } as any);
        toast.success("Roll added successfully");
      }

      onSuccess?.();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      console.error("Error saving roll:", error);
      toast.error(isEdit ? "Failed to update roll" : "Failed to add roll", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Roll" : "Add New Roll"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of this roll."
              : "Enter the details of the new roll to add to inventory."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Material Type */}
              <FormField
                control={form.control}
                name="material_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select material type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {materialTypes.map((type) => (
                          <SelectItem key={type.id} value={type.name}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Color */}
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Black, Red" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Width */}
              <FormField
                control={form.control}
                name="width"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Width (inches) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="48"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Length */}
              <FormField
                control={form.control}
                name="length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Length (inches) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="600"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Thickness */}
              <FormField
                control={form.control}
                name="thickness"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thickness (inches) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="0.25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Remaining Length (only for edit) */}
              {isEdit && (
                <FormField
                  control={form.control}
                  name="remaining_length"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remaining Length (inches)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.001"
                          placeholder="Remaining length"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Adjust for manual corrections
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Location */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Rack A1, Warehouse B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Date Received */}
              <FormField
                control={form.control}
                name="date_received"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Received *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Supplier */}
              <FormField
                control={form.control}
                name="supplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl>
                      <SupplierSelect
                        value={field.value}
                        onValueChange={(value) => {
                          // Get supplier name from the selected ID
                          supplierService
                            .getSupplierById(value)
                            .then((supplier) => {
                              if (supplier) {
                                field.onChange(supplier.name);
                              }
                            })
                            .catch((error) => {
                              console.error("Error resolving supplier name:", error);
                            });
                        }}
                        placeholder="Select supplier"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cost per sqft */}
              <FormField
                control={form.control}
                name="cost_per_sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost per sqft ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="2.50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? isEdit
                    ? "Updating..."
                    : "Adding..."
                  : isEdit
                  ? "Update Roll"
                  : "Add Roll"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}