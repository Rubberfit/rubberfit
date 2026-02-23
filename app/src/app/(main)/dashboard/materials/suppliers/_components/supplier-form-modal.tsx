"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Building, Mail, Phone, MapPin, Globe, CreditCard, Star, Loader2, Plus, Trash2, Link2 } from "lucide-react";

import { type Supplier, type MaterialSupplier } from "@/lib/supabase";
import { supplierService } from "@/services/supplierService";
import { taxService } from "@/services/taxService";
import { MaterialSupplierLink } from "./material-supplier-link";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required").max(100),
  contact_person: z.string().max(100).optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip_code: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  tax_id: z.string().max(50).optional(),
  payment_terms: z.string().max(100).optional(),
  rating: z.number().min(1).max(5).optional(),
  preferred: z.boolean(),
  active: z.boolean(),
  notes: z.string().optional(),
  // Tax and shipping configuration
  tax_rate: z.number().min(0).max(1).optional(),
  tax_exempt: z.boolean(),
  default_shipping_cost: z.number().min(0).optional(),
  shipping_calculation_type: z.enum(["flat", "weight", "percentage", "custom"]).optional(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

interface SupplierFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSuccess: () => void;
}

export function SupplierFormModal({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierFormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [resolvedTaxRate, setResolvedTaxRate] = useState<{
    rate: number;
    name: string;
    level: string;
  } | null>(null);
  const [loadingTaxRate, setLoadingTaxRate] = useState(false);
  const [linkedMaterials, setLinkedMaterials] = useState<any[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<MaterialSupplier | null>(null);

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      country: "USA",
      website: "",
      tax_id: "",
      payment_terms: "Net 30",
      rating: undefined,
      preferred: false,
      active: true,
      notes: "",
      tax_rate: 0.08,
      tax_exempt: false,
      default_shipping_cost: 50,
      shipping_calculation_type: "flat" as const,
    },
  });

  const fetchLinkedMaterials = async (supplierId: string) => {
    setLoadingMaterials(true);
    try {
      const materials = await supplierService.getMaterialsBySupplier(supplierId);
      setLinkedMaterials(materials || []);
    } catch (error) {
      console.error("Error fetching linked materials:", error);
    } finally {
      setLoadingMaterials(false);
    }
  };

  useEffect(() => {
    if (open && supplier) {
      fetchLinkedMaterials(supplier.id);
      form.reset({
        name: supplier.name,
        contact_person: supplier.contact_person || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        city: supplier.city || "",
        state: supplier.state || "",
        zip_code: supplier.zip_code || "",
        country: supplier.country || "USA",
        website: supplier.website || "",
        tax_id: supplier.tax_id || "",
        payment_terms: supplier.payment_terms || "Net 30",
        rating: supplier.rating || undefined,
        preferred: supplier.preferred,
        active: supplier.active,
        notes: supplier.notes || "",
        tax_rate: supplier.tax_rate ?? 0.08,
        tax_exempt: supplier.tax_exempt ?? false,
        default_shipping_cost: supplier.default_shipping_cost ?? 50,
        shipping_calculation_type: supplier.shipping_calculation_type || "flat",
      });
    } else if (open && !supplier) {
      setLinkedMaterials([]);
      form.reset({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        zip_code: "",
        country: "USA",
        website: "",
        tax_id: "",
        payment_terms: "Net 30",
        rating: undefined,
        preferred: false,
        active: true,
        notes: "",
        tax_rate: 0.08,
        tax_exempt: false,
        default_shipping_cost: 50,
        shipping_calculation_type: "flat" as const,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier]);

  // Watch ZIP code changes and resolve tax rate via Avalara
  const watchedZip = form.watch("zip_code");
  const watchedState = form.watch("state");
  const watchedCity = form.watch("city");
  const watchedTaxExempt = form.watch("tax_exempt");

  useEffect(() => {
    if (!watchedZip || watchedTaxExempt) {
      setResolvedTaxRate(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingTaxRate(true);
      try {
        const result = await taxService.getTaxRateForLocation(
          watchedState || null,
          watchedCity || null,
          watchedZip
        );
        setResolvedTaxRate({
          rate: result.tax_rate,
          name: result.tax_name,
          level: result.tax_level
        });
      } catch {
        setResolvedTaxRate(null);
      } finally {
        setLoadingTaxRate(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [watchedZip, watchedState, watchedCity, watchedTaxExempt]);

  const onSubmit = async (data: SupplierFormData) => {
    setSubmitting(true);
    try {
      // Helper: for updates, use null to clear a field in the database.
      // For inserts, use undefined so the field is omitted and gets the DB default.
      const emptyValue = supplier ? null : undefined;

      const supplierData = {
        name: data.name.trim(),
        contact_person: data.contact_person?.trim() || emptyValue,
        email: data.email?.trim() || emptyValue,
        phone: data.phone?.trim() || emptyValue,
        address: data.address?.trim() || emptyValue,
        city: data.city?.trim() || emptyValue,
        state: data.state?.trim() || emptyValue,
        zip_code: data.zip_code?.trim() || emptyValue,
        country: data.country?.trim() || emptyValue,
        website: data.website?.trim() || emptyValue,
        tax_id: data.tax_id?.trim() || emptyValue,
        payment_terms: data.payment_terms?.trim() || emptyValue,
        rating: data.rating ?? emptyValue,
        preferred: data.preferred,
        active: data.active,
        notes: data.notes?.trim() || emptyValue,
        tax_rate: data.tax_rate ?? 0.08,
        tax_exempt: data.tax_exempt ?? false,
        default_shipping_cost: data.default_shipping_cost ?? 50,
        shipping_calculation_type: data.shipping_calculation_type || 'flat',
      };

      if (supplier) {
        await supplierService.updateSupplier(supplier.id, supplierData as any);
        toast.success("Supplier updated successfully");
      } else {
        await supplierService.createSupplier(supplierData as any);
        toast.success("Supplier created successfully");
      }

      // Proactively cache tax rate when ZIP code changes
      const newZip = data.zip_code?.trim();
      const oldZip = supplier?.zip_code?.trim();
      if (newZip && newZip !== oldZip && !data.tax_exempt) {
        taxService.getTaxRateForLocation(
          data.state?.trim() || null,
          data.city?.trim() || null,
          newZip
        ).catch(err => console.warn('Proactive tax cache failed:', err));
      }

      onSuccess();
    } catch (error: any) {
      console.error("Error saving supplier:", error);
      toast.error(error.message || "Failed to save supplier");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {supplier ? "Edit Supplier" : "Add New Supplier"}
          </DialogTitle>
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
                <div className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Building className="inline h-4 w-4 mr-2" />
                          Company Name *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="ABC Rubber Supply Co."
                            {...field}
                            className="min-h-[44px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="contact_person"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John Smith"
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
                      name="tax_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax ID / EIN</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="12-3456789"
                              {...field}
                              className="min-h-[44px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <Mail className="inline h-4 w-4 mr-2" />
                            Email
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="contact@supplier.com"
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
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <Phone className="inline h-4 w-4 mr-2" />
                            Phone
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="(555) 123-4567"
                              {...field}
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
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Globe className="inline h-4 w-4 mr-2" />
                          Website
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://www.supplier.com"
                            {...field}
                            className="min-h-[44px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="address" className="space-y-6 mt-6">
                <div className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <MapPin className="inline h-4 w-4 mr-2" />
                          Street Address
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123 Industrial Blvd"
                            {...field}
                            className="min-h-[44px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-3 gap-4 items-start">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Columbus"
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
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State / Province</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="OH or Ohio"
                              {...field}
                              className="min-h-[44px]"
                              maxLength={50}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="zip_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP / Postal Code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="43215"
                              {...field}
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
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="USA"
                            {...field}
                            className="min-h-[44px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="taxship" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Tax Configuration</CardTitle>
                    <CardDescription>
                      Location-based tax rates will be calculated using the address information from the Address tab
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6">
                    {/* Show current location for tax calculation */}
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-sm font-medium mb-2">Tax Calculation Location:</p>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>City: {form.watch("city") || "Not set"}</span>
                        <span>State: {form.watch("state") || "Not set"}</span>
                        <span>ZIP: {form.watch("zip_code") || "Not set"}</span>
                      </div>
                      {loadingTaxRate && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-blue-600">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Looking up tax rate...
                        </div>
                      )}
                      {resolvedTaxRate && !loadingTaxRate && (
                        <div className="mt-2 p-2 rounded bg-green-50 border border-green-200">
                          <p className="text-sm font-medium text-green-800">
                            Tax Rate: {(resolvedTaxRate.rate * 100).toFixed(3)}%
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Tax rates are automatically looked up when a ZIP code is provided
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="tax_exempt"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Tax Exempt Status</FormLabel>
                            <FormDescription>
                              Mark this supplier as tax exempt (no tax will be charged)
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

                    {!form.watch("tax_exempt") && (
                      <FormField
                        control={form.control}
                        name="tax_rate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Override Tax Rate (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                placeholder="Leave empty for automatic"
                                value={(field.value || 0) * 100}
                                onChange={(e) => {
                                  const percentage = parseFloat(e.target.value) || 0;
                                  field.onChange(percentage / 100);
                                }}
                                className="min-h-[44px]"
                              />
                            </FormControl>
                            <FormDescription>
                              Override location-based tax calculation. Leave at 0 to use automatic rates based on location.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Shipping Configuration</CardTitle>
                    <CardDescription>
                      Configure default shipping costs and calculation method
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="shipping_calculation_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shipping Calculation Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value || "flat"}
                          >
                            <FormControl>
                              <SelectTrigger className="min-h-[44px]">
                                <SelectValue placeholder="Select calculation type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="flat">Flat Rate</SelectItem>
                              <SelectItem value="weight">By Weight</SelectItem>
                              <SelectItem value="percentage">Percentage of Total</SelectItem>
                              <SelectItem value="custom">Custom Calculation</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch("shipping_calculation_type") === "flat" && (
                      <FormField
                        control={form.control}
                        name="default_shipping_cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Shipping Cost ($)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="50.00"
                                value={field.value || 0}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                className="min-h-[44px]"
                              />
                            </FormControl>
                            <FormDescription>
                              Default shipping cost for purchase orders
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {supplier && (
                <TabsContent value="materials" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5" />
                            Linked Materials
                          </CardTitle>
                          <CardDescription>
                            Materials supplied by {supplier.name} with pricing details
                          </CardDescription>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setEditingLink(null);
                            setLinkModalOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Link Material
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {loadingMaterials ? (
                        <div className="text-center py-8 text-muted-foreground">
                          Loading linked materials...
                        </div>
                      ) : linkedMaterials.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No materials linked to this supplier yet.</p>
                          <p className="text-sm mt-1">Click "Link Material" to add pricing for a material.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {linkedMaterials.map((link: any) => (
                            <div
                              key={link.id}
                              className="flex items-center justify-between p-3 border rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div>
                                  <div className="font-medium">
                                    {link.material_type?.name || "Unknown Material"}
                                  </div>
                                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <span>${link.cost_per_sqft?.toFixed(2)}/sq ft</span>
                                    {link.lead_time_days && (
                                      <span>| {link.lead_time_days} day lead</span>
                                    )}
                                    {link.minimum_order_sqft && (
                                      <span>| Min {link.minimum_order_sqft} sq ft</span>
                                    )}
                                  </div>
                                </div>
                                {link.preferred_supplier && (
                                  <Badge variant="secondary">Preferred</Badge>
                                )}
                                {!link.active && (
                                  <Badge variant="outline">Inactive</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingLink(link);
                                    setLinkModalOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    try {
                                      await supplierService.unlinkMaterialFromSupplier(link.id);
                                      toast.success("Material unlinked");
                                      fetchLinkedMaterials(supplier.id);
                                    } catch {
                                      toast.error("Failed to unlink material");
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              <TabsContent value="preferences" className="space-y-4 mt-4">
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="payment_terms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <CreditCard className="inline h-4 w-4 mr-2" />
                          Payment Terms
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="min-h-[44px]">
                              <SelectValue placeholder="Select payment terms" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                            <SelectItem value="Net 15">Net 15</SelectItem>
                            <SelectItem value="Net 30">Net 30</SelectItem>
                            <SelectItem value="Net 45">Net 45</SelectItem>
                            <SelectItem value="Net 60">Net 60</SelectItem>
                            <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rating"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Star className="inline h-4 w-4 mr-2" />
                          Supplier Rating
                        </FormLabel>
                        <Select
                          onValueChange={(value) => {
                            // Handle "none" as undefined, otherwise parse as integer
                            field.onChange(value === "none" ? undefined : parseInt(value, 10))
                          }}
                          value={field.value?.toString() ?? "none"}
                        >
                          <FormControl>
                            <SelectTrigger className="min-h-[44px]">
                              <SelectValue placeholder="Select rating" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No rating</SelectItem>
                            <SelectItem value="1">⭐ 1 Star - Poor</SelectItem>
                            <SelectItem value="2">⭐⭐ 2 Stars - Below Average</SelectItem>
                            <SelectItem value="3">⭐⭐⭐ 3 Stars - Average</SelectItem>
                            <SelectItem value="4">⭐⭐⭐⭐ 4 Stars - Good</SelectItem>
                            <SelectItem value="5">⭐⭐⭐⭐⭐ 5 Stars - Excellent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Rate supplier performance and reliability
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="preferred"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Preferred Supplier
                            </FormLabel>
                            <FormDescription>
                              Mark as a preferred vendor for priority ordering
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
                            <FormLabel className="text-base">Active Status</FormLabel>
                            <FormDescription>
                              Enable or disable this supplier for new orders
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
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional notes about this supplier..."
                            className="resize-none"
                            rows={4}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Internal notes about the supplier (not visible to vendor)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
            setLinkModalOpen(false);
            setEditingLink(null);
            fetchLinkedMaterials(supplier.id);
          }}
        />
      )}
    </Dialog>
  );
}