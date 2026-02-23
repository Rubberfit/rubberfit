"use client";

import { useEffect, useState } from "react";
import { Calculator, Info } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  type ReorderRule,
  type MaterialType,
  type Supplier,
  type CreateReorderRule,
  type UpdateReorderRule
} from "@/lib/supabase";
import { reorderService } from "@/services/reorderService";

interface ReorderRuleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: ReorderRule | null;
  materialTypes: MaterialType[];
  suppliers: Supplier[];
  onSuccess?: () => void;
}

export function ReorderRuleModal({
  open,
  onOpenChange,
  rule,
  materialTypes,
  suppliers,
  onSuccess
}: ReorderRuleModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    material_type_id: "",
    supplier_id: "",
    reorder_point: 100,
    reorder_quantity: 500,
    max_stock_level: 1000,
    lead_time_days: 7,
    safety_stock_days: 3,
    auto_reorder: false,
    active: true,
    notes: ""
  });

  // Calculate EOQ
  const [eoqData, setEoqData] = useState({
    annualDemand: 10000,
    orderingCost: 50,
    holdingCost: 5,
    calculatedEOQ: 0
  });

  // Initialize form data when rule changes
  useEffect(() => {
    if (rule) {
      setFormData({
        material_type_id: rule.material_type_id,
        supplier_id: rule.supplier_id || "",
        reorder_point: rule.reorder_point,
        reorder_quantity: rule.reorder_quantity,
        max_stock_level: rule.max_stock_level || 1000,
        lead_time_days: rule.lead_time_days,
        safety_stock_days: rule.safety_stock_days,
        auto_reorder: rule.auto_reorder,
        active: rule.active,
        notes: rule.notes || ""
      });
    } else {
      // Reset for new rule
      setFormData({
        material_type_id: "",
        supplier_id: "",
        reorder_point: 100,
        reorder_quantity: 500,
        max_stock_level: 1000,
        lead_time_days: 7,
        safety_stock_days: 3,
        auto_reorder: false,
        active: true,
        notes: ""
      });
    }
  }, [rule]);

  // Calculate EOQ
  const calculateEOQ = () => {
    const { annualDemand, orderingCost, holdingCost } = eoqData;
    if (annualDemand > 0 && orderingCost > 0 && holdingCost > 0) {
      const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
      setEoqData({ ...eoqData, calculatedEOQ: Math.round(eoq) });
      setFormData({ ...formData, reorder_quantity: Math.round(eoq) });
      toast.success(`EOQ calculated: ${Math.round(eoq)} sq ft`);
    } else {
      toast.error("Please enter valid values for EOQ calculation");
    }
  };

  // Calculate reorder point
  const calculateReorderPoint = () => {
    const dailyUsage = eoqData.annualDemand / 365;
    const leadTimeUsage = dailyUsage * formData.lead_time_days;
    const safetyStock = dailyUsage * formData.safety_stock_days;
    const reorderPoint = Math.round(leadTimeUsage + safetyStock);

    setFormData({ ...formData, reorder_point: reorderPoint });
    toast.success(`Reorder point calculated: ${reorderPoint} sq ft`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.material_type_id) {
        throw new Error("Please select a material type");
      }

      // Validate DB constraints: max_stock_level >= reorder_quantity AND > reorder_point
      if (formData.max_stock_level != null && formData.max_stock_level > 0) {
        if (formData.max_stock_level < formData.reorder_quantity) {
          throw new Error("Max stock level must be greater than or equal to reorder quantity");
        }
        if (formData.max_stock_level <= formData.reorder_point) {
          throw new Error("Max stock level must be greater than reorder point");
        }
      }

      if (rule) {
        // Update existing rule — exclude material_type_id (immutable)
        const { material_type_id, supplier_id, ...rest } = formData;
        const updateData = {
          ...rest,
          supplier_id: supplier_id || null
        } as UpdateReorderRule;

        const response = await reorderService.updateReorderRule(rule.id, updateData);
        if (!response) throw new Error("Failed to update reorder rule");

        toast.success("Reorder rule updated successfully");
      } else {
        // Create new rule
        const createData = {
          ...formData,
          supplier_id: formData.supplier_id || undefined
        } as CreateReorderRule;

        const response = await reorderService.createReorderRule(createData);
        if (!response) throw new Error("Failed to create reorder rule");

        toast.success("Reorder rule created successfully");
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving reorder rule:", error);
      toast.error(error.message || "Failed to save reorder rule");
    } finally {
      setLoading(false);
    }
  };

  const selectedMaterial = materialTypes.find(m => m.id === formData.material_type_id);
  const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit Reorder Rule" : "Create Reorder Rule"}
          </DialogTitle>
          <DialogDescription>
            Configure automatic reorder parameters for material inventory
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Material and Supplier Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="material">Material Type *</Label>
              <Select
                value={formData.material_type_id}
                onValueChange={(value) => setFormData({ ...formData, material_type_id: value })}
                disabled={!!rule} // Can't change material for existing rules
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select material type" />
                </SelectTrigger>
                <SelectContent>
                  {materialTypes.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMaterial && (
                <p className="text-sm text-muted-foreground">
                  Default cost: ${selectedMaterial.default_cost?.toFixed(2) || "N/A"} per sq ft
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Preferred Supplier</Label>
              <Select
                value={formData.supplier_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, supplier_id: value === "none" ? "" : value })}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select supplier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSupplier && (
                <p className="text-sm text-muted-foreground">
                  Payment terms: {selectedSupplier.payment_terms || "N/A"}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Stock Levels */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Stock Levels</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="reorder_point">Reorder Point (sq ft) *</Label>
                <div className="flex gap-2">
                  <Input
                    id="reorder_point"
                    type="number"
                    value={formData.reorder_point}
                    onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
                    required
                    className="min-h-[44px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="min-h-[44px] min-w-[44px] shrink-0"
                    onClick={calculateReorderPoint}
                    title="Calculate reorder point"
                  >
                    <Calculator className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trigger reorder when stock falls below this level
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reorder_quantity">Reorder Quantity (sq ft) *</Label>
                <div className="flex gap-2">
                  <Input
                    id="reorder_quantity"
                    type="number"
                    value={formData.reorder_quantity}
                    onChange={(e) => setFormData({ ...formData, reorder_quantity: parseInt(e.target.value) || 0 })}
                    required
                    className="min-h-[44px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] shrink-0 text-xs"
                    onClick={() => setFormData({ ...formData, reorder_quantity: eoqData.calculatedEOQ })}
                    disabled={!eoqData.calculatedEOQ}
                  >
                    Use EOQ
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Amount to order when reorder point is reached
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_stock">Max Stock Level (sq ft)</Label>
                <Input
                  id="max_stock"
                  type="number"
                  value={formData.max_stock_level}
                  onChange={(e) => setFormData({ ...formData, max_stock_level: parseInt(e.target.value) || 0 })}
                  className="min-h-[44px]"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum inventory level (optional)
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Lead Time and Safety Stock */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Timing Parameters</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead_time">Lead Time (days) *</Label>
                <Input
                  id="lead_time"
                  type="number"
                  value={formData.lead_time_days}
                  onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })}
                  required
                  className="min-h-[44px]"
                />
                <p className="text-xs text-muted-foreground">
                  Days between order placement and delivery
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="safety_stock">Safety Stock (days) *</Label>
                <Input
                  id="safety_stock"
                  type="number"
                  value={formData.safety_stock_days}
                  onChange={(e) => setFormData({ ...formData, safety_stock_days: parseInt(e.target.value) || 0 })}
                  required
                  className="min-h-[44px]"
                />
                <p className="text-xs text-muted-foreground">
                  Buffer stock to prevent stockouts
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* EOQ Calculator */}
          <div>
            <h3 className="text-sm font-semibold mb-3">EOQ Calculator (Optional)</h3>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Calculate Economic Order Quantity for optimal reorder amounts
              </AlertDescription>
            </Alert>
            <div className="grid gap-4 md:grid-cols-3 mt-4">
              <div className="space-y-2">
                <Label htmlFor="annual_demand">Annual Demand (sq ft)</Label>
                <Input
                  id="annual_demand"
                  type="number"
                  value={eoqData.annualDemand}
                  onChange={(e) => setEoqData({ ...eoqData, annualDemand: parseFloat(e.target.value) || 0 })}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ordering_cost">Ordering Cost ($)</Label>
                <Input
                  id="ordering_cost"
                  type="number"
                  step="0.01"
                  value={eoqData.orderingCost}
                  onChange={(e) => setEoqData({ ...eoqData, orderingCost: parseFloat(e.target.value) || 0 })}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="holding_cost">Holding Cost ($/sq ft/year)</Label>
                <Input
                  id="holding_cost"
                  type="number"
                  step="0.01"
                  value={eoqData.holdingCost}
                  onChange={(e) => setEoqData({ ...eoqData, holdingCost: parseFloat(e.target.value) || 0 })}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <Button type="button" variant="outline" onClick={calculateEOQ}>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate EOQ
              </Button>
              {eoqData.calculatedEOQ > 0 && (
                <span className="font-mono font-semibold">
                  EOQ: {eoqData.calculatedEOQ} sq ft
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Settings and Notes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto_reorder">Auto-Reorder</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically create POs when reorder point is reached
                </p>
              </div>
              <Switch
                id="auto_reorder"
                checked={formData.auto_reorder}
                onCheckedChange={(checked) => setFormData({ ...formData, auto_reorder: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="active">Active Rule</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable this reorder rule
                </p>
              </div>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or special instructions..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="min-h-[44px]">
              {loading ? "Saving..." : rule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}