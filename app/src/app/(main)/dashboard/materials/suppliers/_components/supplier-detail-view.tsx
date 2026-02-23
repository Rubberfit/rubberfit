"use client";

import { useEffect, useState } from "react";
import {
  Building,
  Mail,
  Phone,
  MapPin,
  Globe,
  CreditCard,
  Star,
  Edit,
  Package,
  TrendingUp,
  Calendar,
  DollarSign,
} from "lucide-react";

import { type Supplier, type MaterialSupplierWithDetails } from "@/lib/supabase";
import { supplierService } from "@/services/supplierService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SupplierDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier;
  onEdit: () => void;
}

export function SupplierDetailView({
  open,
  onOpenChange,
  supplier,
  onEdit,
}: SupplierDetailViewProps) {
  const [materialSuppliers, setMaterialSuppliers] = useState<MaterialSupplierWithDetails[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  useEffect(() => {
    if (open && supplier) {
      fetchMaterialSuppliers();
    }
  }, [open, supplier]);

  const fetchMaterialSuppliers = async () => {
    setLoadingMaterials(true);
    try {
      const data = await supplierService.getMaterialsBySupplier(supplier.id);
      setMaterialSuppliers(data);
    } catch (error) {
      console.error("Error fetching material suppliers:", error);
      setMaterialSuppliers([]);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const renderRatingStars = (rating: number | null | undefined) => {
    if (!rating) return <span className="text-muted-foreground">Not rated</span>;

    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`h-5 w-5 ${
                star <= rating
                  ? "fill-yellow-500 text-yellow-500"
                  : "text-gray-300"
              }`}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">({rating}/5)</span>
      </div>
    );
  };

  const formatAddress = () => {
    const parts = [
      supplier.address,
      supplier.city,
      supplier.state && supplier.zip_code
        ? `${supplier.state} ${supplier.zip_code}`
        : supplier.state || supplier.zip_code,
      supplier.country,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "No address on file";
  };

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

          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {supplier.contact_person && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Building className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Contact Person</p>
                      <p className="font-medium">{supplier.contact_person}</p>
                    </div>
                  </div>
                )}

                {supplier.email && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <a
                        href={`mailto:${supplier.email}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {supplier.email}
                      </a>
                    </div>
                  </div>
                )}

                {supplier.phone && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <a
                        href={`tel:${supplier.phone}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {supplier.phone}
                      </a>
                    </div>
                  </div>
                )}

                {supplier.website && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Website</p>
                      <a
                        href={supplier.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {supplier.website}
                      </a>
                    </div>
                  </div>
                )}

                {supplier.tax_id && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Tax ID / EIN</p>
                        <p className="font-medium">{supplier.tax_id}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Location & Tax */}
            <Card>
              <CardHeader>
                <CardTitle>Location & Tax</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">{supplier.address || "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">City</p>
                    <p className="font-medium">{supplier.city || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">State</p>
                    <p className="font-medium">{supplier.state || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ZIP Code</p>
                    <p className="font-medium">{supplier.zip_code || "—"}</p>
                  </div>
                </div>

                {supplier.country && (
                  <div>
                    <p className="text-sm text-muted-foreground">Country</p>
                    <p className="font-medium">{supplier.country}</p>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Tax Status</p>
                    <p className="font-medium">
                      {supplier.tax_exempt ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">Tax Exempt</Badge>
                      ) : (
                        "Taxable"
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tax Rate</p>
                    <p className="font-medium font-mono">
                      {supplier.tax_exempt
                        ? "0%"
                        : supplier.tax_rate
                          ? `${(supplier.tax_rate * 100).toFixed(2)}% (override)`
                          : "Auto (Ziptax)"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Information */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Supplier Rating</p>
                  {renderRatingStars(supplier.rating)}
                </div>

                {supplier.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Internal Notes</p>
                      <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
                    </div>
                  </>
                )}

                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {new Date(supplier.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p className="font-medium">
                      {new Date(supplier.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Supplied Materials</CardTitle>
                <CardDescription>
                  Materials and pricing agreements with this supplier
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMaterials ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading materials...
                  </div>
                ) : materialSuppliers.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">
                      No materials linked to this supplier yet.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material Type</TableHead>
                          <TableHead>Supplier Code</TableHead>
                          <TableHead>Cost/sq ft</TableHead>
                          <TableHead>Min Order</TableHead>
                          <TableHead>Lead Time</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materialSuppliers.map((ms) => (
                          <TableRow key={ms.id}>
                            <TableCell className="font-medium">
                              {ms.material_type?.name || "Unknown"}
                              {ms.preferred_supplier && (
                                <Badge variant="secondary" className="ml-2">
                                  Preferred
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {ms.supplier_material_code || "—"}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono">
                                ${ms.cost_per_sqft.toFixed(2)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {ms.minimum_order_sqft
                                ? `${ms.minimum_order_sqft} sq ft`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {ms.lead_time_days
                                ? `${ms.lead_time_days} days`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={ms.active ? "default" : "secondary"}>
                                {ms.active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="mt-6">
            <div className="grid gap-6">
              {/* Performance Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>
                    Supplier performance and order history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Total Orders</p>
                      </div>
                      <p className="text-2xl font-bold">—</p>
                      <p className="text-xs text-muted-foreground">Phase 2</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">On-Time Delivery</p>
                      </div>
                      <p className="text-2xl font-bold">—</p>
                      <p className="text-xs text-muted-foreground">Phase 2</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Quality Score</p>
                      </div>
                      <p className="text-2xl font-bold">—</p>
                      <p className="text-xs text-muted-foreground">Phase 2</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Total Spent</p>
                      </div>
                      <p className="text-2xl font-bold">—</p>
                      <p className="text-xs text-muted-foreground">Phase 2</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order History Placeholder */}
              <Card>
                <CardHeader>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>
                    Recent purchase orders from this supplier
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">
                      Order history will be available in Phase 2
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Track purchase orders, deliveries, and payment status
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}