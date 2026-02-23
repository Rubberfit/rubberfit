"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Scissors, Calculator, Package, AlertTriangle } from "lucide-react";
import type { MaterialType } from "@/lib/supabase";
import { cutService } from "@/services/cutService";
import { materialTypeService } from "@/services/materialTypeService";
import { rollService } from "@/services/rollService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
interface CutOptimization {
  roll: any;
  total_length_needed: number;
  material_used_sqft: number;
  waste_sqft: number;
  waste_percentage: number;
  remaining_length_after: number;
  remaining_value_after: number;
  score: number;
}

interface BatchCutItem {
  id: string;
  materialType: string;
  width: number;
  length: number;
  quantity: number;
  thickness?: number;
}

interface BatchOptimizationResult {
  cuts: Array<{
    cutRequest: BatchCutItem;
    recommendation: CutOptimization;
  }>;
  totalWaste: number;
  totalMaterialUsed: number;
  wastePercentage: number;
}

export default function BatchCutPlannerPage() {
  const [cutRequests, setCutRequests] = useState<BatchCutItem[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [rollRanges, setRollRanges] = useState<{ minWidth: number; maxWidth: number; maxLength: number; minThickness: number; maxThickness: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<BatchOptimizationResult | null>(null);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Form state for new cut
  const [newCut, setNewCut] = useState<Partial<BatchCutItem>>({
    materialType: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [types, activeRolls] = await Promise.all([
          materialTypeService.getAll(),
          rollService.getActiveRolls(),
        ]);
        setMaterialTypes(types || []);
        if (activeRolls.length > 0) {
          setRollRanges({
            minWidth: Math.min(...activeRolls.map(r => r.width)),
            maxWidth: Math.max(...activeRolls.map(r => r.width)),
            maxLength: Math.max(...activeRolls.map(r => r.remaining_length)),
            minThickness: Math.min(...activeRolls.map(r => r.thickness)),
            maxThickness: Math.max(...activeRolls.map(r => r.thickness)),
          });
        }
      } catch (error) {
        toast.error("Failed to load material types");
      }
    };
    load();
  }, []);

  const addCutRequest = () => {
    if (!newCut.materialType) {
      toast.error("Please select a material type");
      return;
    }
    if (!newCut.width || newCut.width <= 0) {
      toast.error("Width must be greater than 0");
      return;
    }
    if (!newCut.length || newCut.length <= 0) {
      toast.error("Length must be greater than 0");
      return;
    }
    if (!newCut.quantity || newCut.quantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    const cutItem: BatchCutItem = {
      id: Date.now().toString(),
      materialType: newCut.materialType,
      width: newCut.width,
      length: newCut.length,
      quantity: newCut.quantity,
      thickness: newCut.thickness,
    };

    setCutRequests(prev => [...prev, cutItem]);

    // Reset form
    setNewCut({
      materialType: "",
    });

    toast.success("Cut added to batch");
  };

  const removeCutRequest = (id: string) => {
    setCutRequests(prev => prev.filter(cut => cut.id !== id));
  };

  const optimizeBatch = async () => {
    if (cutRequests.length === 0) {
      toast.error("Please add at least one cut request");
      return;
    }

    setLoading(true);
    try {
      // Group cuts by material type for optimization
      const cutsByMaterial = cutRequests.reduce((acc, cut) => {
        if (!acc[cut.materialType]) {
          acc[cut.materialType] = [];
        }
        acc[cut.materialType].push(cut);
        return acc;
      }, {} as Record<string, BatchCutItem[]>);

      const optimizationPromises = [];

      // Optimize each material type group
      for (const [materialType, cuts] of Object.entries(cutsByMaterial)) {
        for (const cut of cuts) {
          optimizationPromises.push(
            cutService.optimizeCut({
              materialType: cut.materialType,
              width: cut.width,
              length: cut.length,
              quantity: cut.quantity,
              thickness: cut.thickness,
            }).then(result => ({
              cutRequest: cut,
              recommendation: result.recommendations[0], // Take best recommendation
            }))
          );
        }
      }

      const results = await Promise.all(optimizationPromises);

      // Calculate totals
      const totalWaste = results.reduce((sum, r) => sum + r.recommendation.waste_sqft, 0);
      const totalMaterialUsed = results.reduce((sum, r) => sum + r.recommendation.material_used_sqft, 0);
      const wastePercentage = totalMaterialUsed > 0 ? (totalWaste / (totalMaterialUsed + totalWaste)) * 100 : 0;

      setOptimizationResult({
        cuts: results,
        totalWaste,
        totalMaterialUsed,
        wastePercentage,
      });

    } catch (error) {
      console.error("Failed to optimize batch:", error);
      toast.error("Failed to optimize batch cuts");
    } finally {
      setLoading(false);
    }
  };

  const confirmBatch = async () => {
    if (!optimizationResult) return;

    setProcessing(true);
    try {
      // Process each cut
      for (const { cutRequest, recommendation } of optimizationResult.cuts) {
        await cutService.recordCut({
          roll_id: recommendation.roll.id,
          cut_width: cutRequest.width,
          cut_length: cutRequest.length,
          quantity: cutRequest.quantity,
          waste_sqft: recommendation.waste_sqft,
          waste_percentage: recommendation.waste_percentage,
          total_sqft_used: recommendation.material_used_sqft + recommendation.waste_sqft,
          job_reference: `BATCH-${Date.now()}`,
          cut_by: "Current User",
          notes: "Batch cut",
        });
      }

      toast.success(`Successfully processed ${optimizationResult.cuts.length} cuts!`);

      // Reset everything
      setCutRequests([]);
      setOptimizationResult(null);
      setConfirmDialog(false);

    } catch (error) {
      console.error("Failed to process batch:", error);
      toast.error("Failed to process some cuts");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Batch Cut Planner</h1>
        <p className="text-muted-foreground">
          Add multiple cuts and optimize them together for maximum efficiency
        </p>
      </div>

      {/* Add Cut Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Cut to Batch</CardTitle>
          <CardDescription>
            Add cuts one by one, then optimize the entire batch
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Material Type</Label>
              <Select
                value={newCut.materialType}
                onValueChange={(value) => setNewCut(prev => ({ ...prev, materialType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materialTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Width (inches)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={newCut.width ?? ""}
                onChange={(e) => setNewCut(prev => ({ ...prev, width: e.target.value ? parseFloat(e.target.value) : undefined }))}
                placeholder={rollRanges ? `e.g. ${rollRanges.minWidth}–${rollRanges.maxWidth}` : "12"}
              />
            </div>

            <div className="space-y-2">
              <Label>Length (inches)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={newCut.length ?? ""}
                onChange={(e) => setNewCut(prev => ({ ...prev, length: e.target.value ? parseFloat(e.target.value) : undefined }))}
                placeholder={rollRanges ? `e.g. up to ${rollRanges.maxLength}` : "24"}
              />
            </div>

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={newCut.quantity ?? ""}
                onChange={(e) => setNewCut(prev => ({ ...prev, quantity: e.target.value ? parseInt(e.target.value) : undefined }))}
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label className="invisible">Action</Label>
              <Button onClick={addCutRequest} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add to Batch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch List */}
      {cutRequests.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Batch Queue</CardTitle>
                <CardDescription>
                  {cutRequests.length} cut{cutRequests.length !== 1 ? 's' : ''} ready for optimization
                </CardDescription>
              </div>
              <Button onClick={optimizeBatch} disabled={loading}>
                <Calculator className="mr-2 h-4 w-4" />
                {loading ? "Optimizing..." : "Optimize Batch"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cutRequests.map((cut) => (
                <div key={cut.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{cut.materialType}</span>
                    <Badge variant="outline">
                      {cut.width}" × {cut.length}" × {cut.quantity}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCutRequest(cut.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Optimization Results */}
      {optimizationResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Optimization Results</CardTitle>
                <CardDescription>
                  Optimized placement for all cuts in the batch
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOptimizationResult(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setConfirmDialog(true)}>
                  <Scissors className="mr-2 h-4 w-4" />
                  Execute Batch
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Total Cuts</div>
                <div className="text-2xl font-bold">{optimizationResult.cuts.length}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Total Material Used</div>
                <div className="text-2xl font-bold">{optimizationResult.totalMaterialUsed.toFixed(2)} sqft</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Overall Waste</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {optimizationResult.wastePercentage.toFixed(1)}%
                  {optimizationResult.wastePercentage < 10 && <Badge variant="default" className="bg-green-500">Excellent</Badge>}
                  {optimizationResult.wastePercentage >= 10 && optimizationResult.wastePercentage < 20 && <Badge variant="default" className="bg-amber-500">Good</Badge>}
                  {optimizationResult.wastePercentage >= 20 && <Badge variant="destructive">High</Badge>}
                </div>
              </div>
            </div>

            {/* Individual Cuts */}
            <div className="space-y-2">
              {optimizationResult.cuts.map((result, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="font-medium">Cut {index + 1}:</span>
                      <Badge variant="outline">
                        {result.cutRequest.width}" × {result.cutRequest.length}" × {result.cutRequest.quantity}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        from {result.cutRequest.materialType}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">
                        Roll: {result.recommendation.roll.location || `#${result.recommendation.roll.id.slice(0, 8)}`}
                      </span>
                      <Badge
                        variant={result.recommendation.waste_percentage < 10 ? "default" : result.recommendation.waste_percentage < 20 ? "secondary" : "destructive"}
                      >
                        {result.recommendation.waste_percentage.toFixed(1)}% waste
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Batch Execution</DialogTitle>
            <DialogDescription>
              This will process {optimizationResult?.cuts.length} cuts and update inventory accordingly.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {optimizationResult && (
            <div className="py-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Cuts:</span>
                  <span className="font-medium">{optimizationResult.cuts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Material Used:</span>
                  <span className="font-medium">{optimizationResult.totalMaterialUsed.toFixed(2)} sqft</span>
                </div>
                <div className="flex justify-between">
                  <span>Waste:</span>
                  <span className="font-medium">{optimizationResult.totalWaste.toFixed(2)} sqft ({optimizationResult.wastePercentage.toFixed(1)}%)</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={confirmBatch} disabled={processing}>
              {processing ? "Processing..." : "Confirm & Execute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}