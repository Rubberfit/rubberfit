"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Scissors, Calculator, CheckCircle, AlertCircle, XCircle, Package, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { rollService } from "@/services/rollService";
import { cutService } from "@/services/cutService";
import type { MaterialType, Roll } from "@/lib/supabase";
import { useRole } from "@/services/useRole";

// Types for cut optimization
interface CutRequest {
  materialType: string;
  width: number;
  length: number;
  quantity: number;
  thickness?: number;
}

interface CutRecommendation {
  roll: Roll;
  total_length_needed: number;
  material_used_sqft: number;
  waste_sqft: number;
  waste_percentage: number;
  remaining_length_after: number;
  remaining_value_after: number;
  score: number;
}

// Simple SVG Cut Diagram Component
function CutDiagram({
  roll,
  cutWidth,
  cutLength,
  quantity
}: {
  roll: Roll;
  cutWidth: number;
  cutLength: number;
  quantity: number;
}) {
  const svgWidth = 400;
  const svgHeight = 200;
  const rollWidth = svgWidth * 0.8;
  const rollHeight = svgHeight * 0.6;
  const rollX = (svgWidth - rollWidth) / 2;
  const rollY = (svgHeight - rollHeight) / 2;

  const cutWidthPx = (cutWidth / roll.width) * rollWidth;
  const cutLengthPx = (cutLength * quantity / roll.remaining_length) * rollHeight;
  const wasteWidthPx = rollWidth - cutWidthPx;

  return (
    <div className="w-full max-w-md">
      <svg width="100%" height="200" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="border rounded">
        <rect x={rollX} y={rollY} width={rollWidth} height={rollHeight}
              fill="#f3f4f6" stroke="#d1d5db" strokeWidth="2" rx="4" />
        <rect x={rollX} y={rollY} width={cutWidthPx} height={cutLengthPx}
              fill="#22c55e" fillOpacity="0.7" stroke="#16a34a" strokeWidth="1" />
        {wasteWidthPx > 0 && (
          <rect x={rollX + cutWidthPx} y={rollY} width={wasteWidthPx} height={cutLengthPx}
                fill="#ef4444" fillOpacity="0.5" stroke="#dc2626" strokeWidth="1" strokeDasharray="5,5" />
        )}
        <text x={svgWidth / 2} y={rollY - 10} textAnchor="middle" className="text-xs font-medium fill-current">
          Roll: {roll.width}" × {roll.remaining_length}" ({roll.location})
        </text>
        <text x={rollX + cutWidthPx / 2} y={rollY + cutLengthPx / 2} textAnchor="middle" className="text-xs font-medium fill-white">
          Cut: {cutWidth}" × {cutLength}" × {quantity}
        </text>
        {wasteWidthPx > 5 && (
          <text x={rollX + cutWidthPx + wasteWidthPx / 2} y={rollY + cutLengthPx / 2} textAnchor="middle" className="text-xs font-medium fill-white">
            Waste
          </text>
        )}
      </svg>
    </div>
  );
}

export default function CutPlannerPage() {

  // ── useRole — must be called before any other hooks ──────────────────────
  const { can, roles, fullName } = useRole();

  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [rollRanges, setRollRanges] = useState<{ minWidth: number; maxWidth: number; minLength: number; maxLength: number; minThickness: number; maxThickness: number } | null>(null);
  const [recommendations, setRecommendations] = useState<CutRecommendation[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState<CutRecommendation | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const form = useForm<CutRequest>({
    defaultValues: {
      materialType: "",
      width: undefined as unknown as number,
      length: undefined as unknown as number,
      quantity: 1,
      thickness: undefined,
    },
  });

  // Load material types and roll ranges
  useEffect(() => {
    const load = async () => {
      try {
        const [types, activeRolls] = await Promise.all([
          rollService.getMaterialTypes(),
          rollService.getActiveRolls(),
        ]);
        setMaterialTypes(types);
        if (activeRolls.length > 0) {
          setRollRanges({
            minWidth: Math.min(...activeRolls.map(r => r.width)),
            maxWidth: Math.max(...activeRolls.map(r => r.width)),
            minLength: Math.min(...activeRolls.map(r => r.remaining_length)),
            maxLength: Math.max(...activeRolls.map(r => r.remaining_length)),
            minThickness: Math.min(...activeRolls.map(r => r.thickness)),
            maxThickness: Math.max(...activeRolls.map(r => r.thickness)),
          });
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        toast.error("Failed to load material types");
      }
    };
    load();
  }, []);

  // Handle cut request optimization
  const onOptimize = async (data: CutRequest) => {
    if (!data.materialType || !data.width || !data.length || !data.quantity) {
      toast.error("Please fill in all required fields with valid values");
      return;
    }

    setIsOptimizing(true);
    try {
      const result = await cutService.optimizeCut({
        materialType: data.materialType,
        width: data.width,
        length: data.length,
        quantity: data.quantity,
        thickness: data.thickness,
      });

      if (result.recommendations.length === 0) {
        toast.warning("No suitable rolls found for this cut request");
        setRecommendations([]);
      } else {
        setRecommendations(result.recommendations);
        toast.success(`Found ${result.recommendations.length} cutting options`);
      }
    } catch (error) {
      console.error("Optimization failed:", error);
      toast.error("Failed to optimize cut");
      setRecommendations([]);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Handle recommendation selection — blocked for non-cutters
  const handleSelectRecommendation = (recommendation: CutRecommendation) => {
    if (!can("createCut")) {
      toast.error("Permission denied — Cutter role required", {
        description: `Your current roles: ${roles.length > 0 ? roles.join(", ") : "none"}. Ask your administrator to assign you the Cutter role.`,
        duration: 6000,
        icon: <ShieldX className="h-4 w-4" />,
      });
      return;
    }
    setSelectedRecommendation(recommendation);
    setShowConfirmDialog(true);
  };

  // Confirm cut execution — second permission check at execution time
  const handleConfirmCut = async () => {
    // Safety check — prevents execution even if dialog was opened another way
    if (!can("createCut")) {
      toast.error("Permission denied — Cutter role required to confirm cuts.");
      setShowConfirmDialog(false);
      return;
    }

    if (!selectedRecommendation) return;

    const formData = form.getValues();
    setIsConfirming(true);

    try {
      await cutService.recordCut({
        roll_id: selectedRecommendation.roll.id,
        cut_width: formData.width,
        cut_length: formData.length,
        quantity: formData.quantity,
        waste_sqft: selectedRecommendation.waste_sqft,
        waste_percentage: selectedRecommendation.waste_percentage,
        total_sqft_used: selectedRecommendation.material_used_sqft + selectedRecommendation.waste_sqft,
        job_reference: "",
        cut_by: fullName ?? "Unknown",
        notes: "",
      });

      toast.success("Cut recorded successfully! Inventory has been updated.");

      form.reset();
      setRecommendations([]);
      setShowConfirmDialog(false);
      setSelectedRecommendation(null);
    } catch (error) {
      console.error("Failed to record cut:", error);
      toast.error("Failed to record cut");
    } finally {
      setIsConfirming(false);
    }
  };

  // Get color coding for waste percentage
  const getWasteColor = (percentage: number, rank: number) => {
    if (rank === 0) return "text-green-600 bg-green-50";
    if (rank === 1) return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };

  // Get waste icon
  const getWasteIcon = (percentage: number, rank: number) => {
    if (rank === 0) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (rank === 1) return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cut Planner</h1>
          <p className="text-muted-foreground">
            Optimize material cuts to minimize waste
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.href = '/dashboard/cut-planner/batch'}>
          <Package className="mr-2 h-4 w-4" />
          Batch Mode
        </Button>
      </div>

      {/* Cut Request Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Cut Request
          </CardTitle>
          <CardDescription>
            Enter your cutting requirements to get optimized recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onOptimize)} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <FormField
                control={form.control}
                name="materialType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select material" />
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

              <FormField
                control={form.control}
                name="width"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Width Needed (in) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={rollRanges ? `e.g. ${rollRanges.minWidth}–${rollRanges.maxWidth}` : "0.00"}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Length Needed (in) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={rollRanges ? `e.g. up to ${rollRanges.maxLength}` : "0.00"}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="thickness"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thickness (in)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={rollRanges ? `e.g. ${rollRanges.minThickness}–${rollRanges.maxThickness}` : "Optional"}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="md:col-span-2 lg:col-span-5">
                <Button type="submit" disabled={isOptimizing} className="w-full sm:w-auto">
                  <Calculator className="h-4 w-4 mr-2" />
                  {isOptimizing ? "Optimizing..." : "Find Best Cuts"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Cutting Options</CardTitle>
            <CardDescription className="flex items-center gap-2 flex-wrap">
              Choose the best option based on waste percentage and remaining value
              {/* Subtle warning for users who can view but not cut */}
              {!can("createCut") && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <ShieldX className="h-3 w-3" />
                  View only — Cutter role required to confirm
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Table View */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Roll Location</TableHead>
                      <TableHead>Roll Size</TableHead>
                      <TableHead>Waste %</TableHead>
                      <TableHead>Material Used</TableHead>
                      <TableHead>Remaining After</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recommendations.map((rec, index) => (
                      <TableRow key={rec.roll.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getWasteIcon(rec.waste_percentage, index)}
                            <span className="font-medium">#{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {rec.roll.location || 'No location'}
                        </TableCell>
                        <TableCell>
                          {rec.roll.width}" × {rec.roll.remaining_length}" × {rec.roll.thickness}"
                        </TableCell>
                        <TableCell>
                          <Badge className={getWasteColor(rec.waste_percentage, index)}>
                            {rec.waste_percentage.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rec.material_used_sqft.toFixed(2)} sq ft
                        </TableCell>
                        <TableCell>
                          {rec.remaining_length_after.toFixed(1)}"
                          <div className="text-xs text-muted-foreground">
                            ${rec.remaining_value_after.toFixed(2)} value
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleSelectRecommendation(rec)}
                            variant={index === 0 ? "default" : "outline"}
                          >
                            {index === 0 ? "Select Best" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Visual Diagram for Best Option */}
              {recommendations[0] && (
                <div className="border rounded-lg p-4">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Best Option Visualization
                  </h3>
                  <div className="flex flex-col md:flex-row gap-4 items-center">
                    <CutDiagram
                      roll={recommendations[0].roll}
                      cutWidth={form.getValues().width}
                      cutLength={form.getValues().length}
                      quantity={form.getValues().quantity}
                    />
                    <div className="flex-1 text-sm space-y-2">
                      <div><strong>Material:</strong> {recommendations[0].roll.material_type}</div>
                      <div><strong>Total Length Needed:</strong> {recommendations[0].total_length_needed}"</div>
                      <div><strong>Waste:</strong> {recommendations[0].waste_sqft.toFixed(2)} sq ft ({recommendations[0].waste_percentage.toFixed(1)}%)</div>
                      <div><strong>Remaining After Cut:</strong> {recommendations[0].remaining_length_after.toFixed(1)}"</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cut</DialogTitle>
            <DialogDescription>
              Are you sure you want to proceed with this cut? This will update the inventory.
            </DialogDescription>
          </DialogHeader>

          {selectedRecommendation && (
            <div className="py-4 space-y-3 text-sm">
              <div><strong>Material:</strong> {selectedRecommendation.roll.material_type}</div>
              <div><strong>Roll Location:</strong> {selectedRecommendation.roll.location}</div>
              <div><strong>Cut:</strong> {form.getValues().width}" × {form.getValues().length}" × {form.getValues().quantity} pieces</div>
              <div><strong>Waste:</strong> {selectedRecommendation.waste_percentage.toFixed(1)}%</div>
              <div><strong>Remaining After:</strong> {selectedRecommendation.remaining_length_after.toFixed(1)}"</div>
              <div><strong>Cut by:</strong> {fullName ?? "Unknown"}</div>
            </div>
          )}

          {/* Permission warning inside dialog — shown if role check fails */}
          {!can("createCut") && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg
                            bg-red-50 border border-red-200 text-red-700 text-sm">
              <ShieldX className="h-4 w-4 flex-shrink-0" />
              <span>
                You don't have the <strong>Cutter</strong> role required to confirm this cut.
              </span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCut}
              disabled={isConfirming || !can("createCut")}
              title={!can("createCut") ? "Cutter role required" : undefined}
            >
              {isConfirming ? "Recording..." : "Confirm Cut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}