"use client";

import { useEffect, useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";

import { type MaterialType } from "@/lib/supabase";
import { materialTypeService } from "@/services/materialTypeService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface MaterialTypeForm {
  name: string;
  description: string;
  default_cost: string;
  min_stock_alert: string;
}

export default function MaterialTypesPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<MaterialType | null>(null);
  const [formData, setFormData] = useState<MaterialTypeForm>({
    name: "",
    description: "",
    default_cost: "",
    min_stock_alert: "",
  });
  const [submitting, setSubmitting] = useState(false);


  const fetchMaterialTypes = async () => {
    setLoading(true);
    try {
      const data = await materialTypeService.getAll();
      setMaterialTypes(data);
    } catch (error) {
      console.error("Error fetching material types:", error);
      toast.error("Failed to load material types");
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingType(null);
    setFormData({
      name: "",
      description: "",
      default_cost: "",
      min_stock_alert: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (materialType: MaterialType) => {
    setEditingType(materialType);
    setFormData({
      name: materialType.name,
      description: materialType.description || "",
      default_cost: materialType.default_cost?.toString() || "",
      min_stock_alert: materialType.min_stock_alert?.toString() || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Material name is required");
      return;
    }

    setSubmitting(true);
    try {
      const materialData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        default_cost: formData.default_cost ? parseFloat(formData.default_cost) : undefined,
        min_stock_alert: formData.min_stock_alert ? parseFloat(formData.min_stock_alert) : undefined,
      };

      if (editingType) {
        await materialTypeService.update(editingType.id, materialData);
        toast.success("Material type updated successfully");
      } else {
        await materialTypeService.create(materialData);
        toast.success("Material type created successfully");
      }

      setDialogOpen(false);
      fetchMaterialTypes();
    } catch (error: any) {
      console.error("Error saving material type:", error);
      toast.error(error.message || "Failed to save material type");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (materialType: MaterialType) => {
    if (!confirm(`Are you sure you want to delete ${materialType.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await materialTypeService.delete(materialType.id);
      toast.success("Material type deleted successfully");
      fetchMaterialTypes();
    } catch (error: any) {
      console.error("Error deleting material type:", error);
      toast.error(error.message || "Failed to delete material type");
    }
  };

  useEffect(() => {
    fetchMaterialTypes();
  }, []);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Material Types</h1>
          <p className="text-muted-foreground">
            Manage rubber material categories and their properties
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Material Type
        </Button>
      </div>

      {/* Material Types Table */}
      <Card>
        <CardHeader>
          <CardTitle>Material Types</CardTitle>
          <CardDescription>
            Configure material properties, pricing, and stock alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Default Cost</TableHead>
                  <TableHead>Stock Alert</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading material types...
                    </TableCell>
                  </TableRow>
                ) : materialTypes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No material types found. Add your first material type to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  materialTypes.map((materialType) => (
                    <TableRow key={materialType.id}>
                      <TableCell className="font-medium">
                        {materialType.name}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          {materialType.description || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {materialType.default_cost ? (
                          <Badge variant="outline">
                            ${materialType.default_cost.toFixed(2)}/sq ft
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {materialType.min_stock_alert ? (
                          <Badge variant="secondary">
                            {materialType.min_stock_alert} sq ft
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(materialType.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(materialType)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(materialType)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit Material Type" : "Add Material Type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update the material type information"
                : "Add a new material type to your inventory system"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Neoprene, EPDM, Silicone"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Material properties and characteristics"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="default_cost">Default Cost (per sq ft)</Label>
              <Input
                id="default_cost"
                type="number"
                step="0.01"
                min="0"
                value={formData.default_cost}
                onChange={(e) => setFormData({ ...formData, default_cost: e.target.value })}
                placeholder="2.50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="min_stock_alert">Low Stock Alert (sq ft)</Label>
              <Input
                id="min_stock_alert"
                type="number"
                step="1"
                min="0"
                value={formData.min_stock_alert}
                onChange={(e) => setFormData({ ...formData, min_stock_alert: e.target.value })}
                placeholder="100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : editingType ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}