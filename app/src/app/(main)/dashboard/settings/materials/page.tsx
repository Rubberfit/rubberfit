"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";
import { type MaterialType } from "@/lib/supabase";
import { materialTypeService } from "@/services/materialTypeService";
import { rollService } from "@/services/rollService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function MaterialSettingsPage() {
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedValues, setEditedValues] = useState<{ [key: string]: { min_stock_alert: number; default_cost: number } }>({});
  const [newMaterialDialog, setNewMaterialDialog] = useState(false);
  const [deleteMaterialDialog, setDeleteMaterialDialog] = useState<string | null>(null);
  const [newMaterial, setNewMaterial] = useState({
    name: "",
    description: "",
    default_cost: 2.5,
    min_stock_alert: 100,
  });

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const data = await materialTypeService.getAll();
      setMaterials(data);
      // Initialize edited values
      const initialValues: { [key: string]: { min_stock_alert: number; default_cost: number } } = {};
      data.forEach(material => {
        initialValues[material.id] = {
          min_stock_alert: material.min_stock_alert || 0,
          default_cost: material.default_cost || 0,
        };
      });
      setEditedValues(initialValues);
    } catch (error: any) {
      toast.error("Failed to load materials", { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (materialId: string, field: 'min_stock_alert' | 'default_cost', value: number) => {
    setEditedValues(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [field]: value,
      }
    }));
  };

  const handleSave = async (materialId: string) => {
    try {
      const values = editedValues[materialId];
      await materialTypeService.update(materialId, {
        min_stock_alert: values.min_stock_alert,
        default_cost: values.default_cost,
      });
      toast.success("Material settings saved successfully");
      fetchMaterials();
    } catch (error: any) {
      toast.error("Failed to save changes", { description: error?.message });
    }
  };

  const handleAddMaterial = async () => {
    if (!newMaterial.name.trim()) {
      toast.error("Material name is required");
      return;
    }

    try {
      await materialTypeService.create({
        name: newMaterial.name.trim(),
        description: newMaterial.description.trim(),
        default_cost: newMaterial.default_cost,
        min_stock_alert: newMaterial.min_stock_alert,
      });
      toast.success("Material added successfully");
      setNewMaterialDialog(false);
      setNewMaterial({
        name: "",
        description: "",
        default_cost: 2.5,
        min_stock_alert: 100,
      });
      fetchMaterials();
    } catch (error: any) {
      toast.error("Failed to add material", { description: error?.message });
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    try {
      // Check if there are any rolls using this material
      const materialName = materials.find(m => m.id === materialId)?.name || '';
      const hasRolls = await rollService.existsByMaterialType(materialName);

      if (hasRolls) {
        toast.error("Cannot delete material", {
          description: "This material is being used by existing rolls"
        });
        return;
      }

      await materialTypeService.delete(materialId);
      toast.success("Material deleted successfully");
      setDeleteMaterialDialog(null);
      fetchMaterials();
    } catch (error: any) {
      toast.error("Failed to delete material", { description: error?.message });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">Material Settings</h1>
          <p className="text-muted-foreground">
            Configure material types and stock thresholds
          </p>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          Loading materials...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Material Settings</h1>
          <p className="text-muted-foreground">
            Configure material types and stock thresholds
          </p>
        </div>
        <Button onClick={() => setNewMaterialDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Material Type
        </Button>
      </div>

      <div className="grid gap-4">
        {materials.map((material) => (
          <Card key={material.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{material.name}</CardTitle>
                  {material.description && (
                    <CardDescription className="mt-1">
                      {material.description}
                    </CardDescription>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteMaterialDialog(material.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`stock-${material.id}`}>
                    Minimum Stock Alert (sqft)
                  </Label>
                  <Input
                    id={`stock-${material.id}`}
                    type="number"
                    min="0"
                    step="10"
                    value={editedValues[material.id]?.min_stock_alert || 0}
                    onChange={(e) => handleValueChange(material.id, 'min_stock_alert', parseFloat(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Alert when stock falls below this level
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`cost-${material.id}`}>
                    Default Cost per sqft ($)
                  </Label>
                  <Input
                    id={`cost-${material.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editedValues[material.id]?.default_cost || 0}
                    onChange={(e) => handleValueChange(material.id, 'default_cost', parseFloat(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default cost for new rolls
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="invisible">Action</Label>
                  <Button
                    onClick={() => handleSave(material.id)}
                    className="w-full"
                    variant="outline"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                  <p className="text-xs text-muted-foreground invisible">
                    Placeholder for alignment
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Material Dialog */}
      <Dialog open={newMaterialDialog} onOpenChange={setNewMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Material Type</DialogTitle>
            <DialogDescription>
              Create a new material type for your inventory
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Material Name *</Label>
              <Input
                id="new-name"
                value={newMaterial.name}
                onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Neoprene"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-description">Description</Label>
              <Textarea
                id="new-description"
                value={newMaterial.description}
                onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g., General purpose synthetic rubber"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-stock">Min Stock Alert (sqft)</Label>
                <Input
                  id="new-stock"
                  type="number"
                  min="0"
                  step="10"
                  value={newMaterial.min_stock_alert}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, min_stock_alert: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-cost">Default Cost per sqft ($)</Label>
                <Input
                  id="new-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newMaterial.default_cost}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, default_cost: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMaterialDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMaterial}>
              Add Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteMaterialDialog} onOpenChange={() => setDeleteMaterialDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this material type? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMaterialDialog && handleDeleteMaterial(deleteMaterialDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}