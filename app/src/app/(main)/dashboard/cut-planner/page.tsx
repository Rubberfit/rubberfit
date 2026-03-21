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
import { Scissors, Calculator, CheckCircle, AlertCircle, XCircle, Package, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { rollService } from "@/services/rollService";
import { cutService } from "@/services/cutService";
import type { MaterialType, Roll } from "@/lib/supabase";
import PresetDimensionSelector from "./_components/PresetDimensionSelector";
import NestingVisualizer from "./_components/NestingVisualizer";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CutRequest {
  materialType: string;
  width:        number;
  length:       number;
  quantity:     number;
  thickness?:   number;
}

interface CutRecommendation {
  roll:                   Roll;
  total_length_needed:    number;
  material_used_sqft:     number;
  waste_sqft:             number;
  waste_percentage:       number;
  remaining_length_after: number;
  remaining_value_after:  number;
  score:                  number;
}

// ─── Simple overview diagram (kept for the "Best Option" summary box) ─────────
function CutDiagram({
  roll, cutWidth, cutLength, quantity,
}: {
  roll: Roll; cutWidth: number; cutLength: number; quantity: number;
}) {
  const svgWidth   = 460;
  const svgHeight  = 220;
  const rollWidth  = svgWidth * 0.78;
  const rollHeight = svgHeight * 0.62;
  const rollX      = (svgWidth - rollWidth) / 2;
  const rollY      = (svgHeight - rollHeight) / 2 + 10;
  const cutWidthPx  = (cutWidth  / roll.width)                        * rollWidth;
  const cutLengthPx = ((cutLength * quantity) / roll.remaining_length) * rollHeight;
  const wasteWidthPx = rollWidth - cutWidthPx;
  const isPortrait   = cutLength >= cutWidth;

  return (
    <div className="w-full max-w-lg">
      <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
           className="rounded-lg border border-slate-200 bg-slate-50">
        <defs>
          <marker id="arrowEnd" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="white" />
          </marker>
          <marker id="arrowStart" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 Z" fill="white" />
          </marker>
        </defs>
        <rect x={rollX} y={rollY} width={rollWidth} height={rollHeight}
              fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" rx="4" />
        <rect x={rollX} y={rollY}
              width={Math.min(cutWidthPx, rollWidth)} height={Math.min(cutLengthPx, rollHeight)}
              fill="#22c55e" fillOpacity="0.75" stroke="#16a34a" strokeWidth="1" rx="2" />
        {wasteWidthPx > 2 && (
          <rect x={rollX + cutWidthPx} y={rollY}
                width={wasteWidthPx} height={Math.min(cutLengthPx, rollHeight)}
                fill="#ef4444" fillOpacity="0.35" stroke="#dc2626" strokeWidth="1"
                strokeDasharray="5,4" rx="2" />
        )}
        <g opacity="0.9">
          {isPortrait ? (
            <>
              <line x1={rollX + cutWidthPx / 2} y1={rollY + 8}
                    x2={rollX + cutWidthPx / 2} y2={rollY + cutLengthPx - 8}
                    stroke="white" strokeWidth="2"
                    markerEnd="url(#arrowEnd)" markerStart="url(#arrowStart)" />
              <text x={rollX + cutWidthPx / 2 + 7} y={rollY + cutLengthPx / 2}
                    fill="white" fontSize="9" fontWeight="700" dominantBaseline="middle">
                PORTRAIT
              </text>
            </>
          ) : (
            <>
              <line x1={rollX + 8} y1={rollY + cutLengthPx / 2}
                    x2={rollX + cutWidthPx - 8} y2={rollY + cutLengthPx / 2}
                    stroke="white" strokeWidth="2"
                    markerEnd="url(#arrowEnd)" markerStart="url(#arrowStart)" />
              <text x={rollX + cutWidthPx / 2} y={rollY + cutLengthPx / 2 - 8}
                    textAnchor="middle" fill="white" fontSize="9" fontWeight="700">
                LANDSCAPE
              </text>
            </>
          )}
        </g>
        <text x={rollX + Math.min(cutWidthPx, rollWidth) / 2}
              y={rollY + Math.min(cutLengthPx, rollHeight) / 2 + (isPortrait ? 14 : 8)}
              textAnchor="middle" fill="white" fontSize="10" fontWeight="600">
          {cutWidth}" × {cutLength}" × {quantity}
        </text>
        {wasteWidthPx > 18 && (
          <text x={rollX + cutWidthPx + wasteWidthPx / 2}
                y={rollY + Math.min(cutLengthPx, rollHeight) / 2}
                textAnchor="middle" fill="#dc2626" fontSize="8" fontWeight="600">
            waste
          </text>
        )}
        <text x={svgWidth / 2} y={rollY - 8} textAnchor="middle"
              fill="#64748b" fontSize="9" fontWeight="500">
          Roll: {roll.width}" × {roll.remaining_length}" · {roll.location}
        </text>
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CutPlannerPage() {
  const [materialTypes, setMaterialTypes]           = useState<MaterialType[]>([]);
  const [rollRanges,    setRollRanges]               = useState<{
    minWidth: number; maxWidth: number;
    minLength: number; maxLength: number;
    minThickness: number; maxThickness: number;
  } | null>(null);
  const [activeRolls,          setActiveRolls]          = useState<Roll[]>([]);
  const [recommendations,      setRecommendations]      = useState<CutRecommendation[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState<CutRecommendation | null>(null);
  const [showConfirmDialog,    setShowConfirmDialog]    = useState(false);
  const [isOptimizing,         setIsOptimizing]         = useState(false);
  const [isConfirming,         setIsConfirming]         = useState(false);

  // ── NEW: track which recommendation is driving the NestingVisualizer ────────
  // Updates whenever the user clicks "Select Best" / "Select" on any row,
  // OR automatically when recommendations first arrive (defaults to #1).
  const [vizRoll, setVizRoll] = useState<Roll | null>(null);

  const form = useForm<CutRequest>({
    defaultValues: {
      materialType: "",
      width:        undefined as unknown as number,
      length:       undefined as unknown as number,
      quantity:     1,
      thickness:    undefined,
    },
  });

  // ── load material types + active rolls ───────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [types, rolls] = await Promise.all([
          rollService.getMaterialTypes(),
          rollService.getActiveRolls(),
        ]);
        setMaterialTypes(types);
        setActiveRolls(rolls);
        if (rolls.length > 0) {
          setRollRanges({
            minWidth:     Math.min(...rolls.map(r => r.width)),
            maxWidth:     Math.max(...rolls.map(r => r.width)),
            minLength:    Math.min(...rolls.map(r => r.remaining_length)),
            maxLength:    Math.max(...rolls.map(r => r.remaining_length)),
            minThickness: Math.min(...rolls.map(r => r.thickness)),
            maxThickness: Math.max(...rolls.map(r => r.thickness)),
          });
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        toast.error("Failed to load material types");
      }
    };
    load();
  }, []);

  // ── optimize ─────────────────────────────────────────────────────────────
  const onOptimize = async (data: CutRequest) => {
    if (!data.materialType || !data.width || !data.length || !data.quantity) {
      toast.error("Please fill in all required fields with valid values");
      return;
    }
    setIsOptimizing(true);
    try {
      const result = await cutService.optimizeCut({
        materialType: data.materialType,
        width:        data.width,
        length:       data.length,
        quantity:     data.quantity,
        thickness:    data.thickness,
      });
      if (result.recommendations.length === 0) {
        toast.warning("No suitable rolls found for this cut request");
        setRecommendations([]);
        setVizRoll(null);
      } else {
        setRecommendations(result.recommendations);
        // auto-seed the visualizer with the top-ranked roll
        setVizRoll(result.recommendations[0].roll);
        toast.success(`Found ${result.recommendations.length} cutting options`);
      }
    } catch (error) {
      console.error("Optimization failed:", error);
      toast.error("Failed to optimize cut");
      setRecommendations([]);
      setVizRoll(null);
    } finally {
      setIsOptimizing(false);
    }
  };

  // ── select recommendation → also updates visualizer roll ─────────────────
  const handleSelectRecommendation = (rec: CutRecommendation) => {
    setSelectedRecommendation(rec);
    setVizRoll(rec.roll);          // ← keeps NestingVisualizer in sync
    setShowConfirmDialog(true);
  };

  // ── confirm cut ───────────────────────────────────────────────────────────
  const handleConfirmCut = async () => {
    if (!selectedRecommendation) return;
    const formData = form.getValues();
    setIsConfirming(true);
    try {
      await cutService.recordCut({
        roll_id:          selectedRecommendation.roll.id,
        cut_width:        formData.width,
        cut_length:       formData.length,
        quantity:         formData.quantity,
        waste_sqft:       selectedRecommendation.waste_sqft,
        waste_percentage: selectedRecommendation.waste_percentage,
        total_sqft_used:  selectedRecommendation.material_used_sqft + selectedRecommendation.waste_sqft,
        job_reference:    "",
        cut_by:           "Current User",
        notes:            "",
      });
      toast.success("Cut recorded successfully! Inventory has been updated.");
      form.reset();
      setRecommendations([]);
      setVizRoll(null);
      setShowConfirmDialog(false);
      setSelectedRecommendation(null);
    } catch (error) {
      console.error("Failed to record cut:", error);
      toast.error("Failed to record cut");
    } finally {
      setIsConfirming(false);
    }
  };

  // ── helpers ───────────────────────────────────────────────────────────────
  const getWasteColor = (_: number, rank: number) => {
    if (rank === 0) return "text-green-600 bg-green-50";
    if (rank === 1) return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };
  const getWasteIcon = (_: number, rank: number) => {
    if (rank === 0) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (rank === 1) return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  const bestRollWidth  = activeRolls.length > 0 ? Math.max(...activeRolls.map(r => r.width))            : 72;
  const bestRollLength = activeRolls.length > 0 ? Math.max(...activeRolls.map(r => r.remaining_length)) : 144;

  // snapshot of the form values used to drive the visualizer
  const fv = form.watch();

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 md:gap-6">

      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cut Planner</h1>
          <p className="text-muted-foreground">Optimize material cuts to minimize waste</p>
        </div>
        <Button variant="outline" onClick={() => (window.location.href = "/dashboard/cut-planner/batch")}>
          <Package className="mr-2 h-4 w-4" />
          Batch Mode
        </Button>
      </div>

      {/* ── 1. Preset dimension selector ── */}
      <PresetDimensionSelector
        rollWidth={bestRollWidth}
        rollLength={bestRollLength}
        onApply={({ width, length, quantity }) => {
          form.setValue("width",    width);
          form.setValue("length",   length);
          form.setValue("quantity", quantity);
          toast.info(`Preset applied: ${width}" × ${length}" × ${quantity}`);
        }}
      />

      {/* ── 2. Cut request form ── */}
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
            <form
              onSubmit={form.handleSubmit(onOptimize)}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
            >
              <FormField control={form.control} name="materialType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Material Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {materialTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="width" render={({ field }) => (
                <FormItem>
                  <FormLabel>Width Needed (in) *</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0"
                      placeholder={rollRanges ? `e.g. ${rollRanges.minWidth}–${rollRanges.maxWidth}` : "0.00"}
                      {...field} value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="length" render={({ field }) => (
                <FormItem>
                  <FormLabel>Length Needed (in) *</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0"
                      placeholder={rollRanges ? `e.g. up to ${rollRanges.maxLength}` : "0.00"}
                      {...field} value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity *</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" placeholder="1"
                      {...field} onChange={e => field.onChange(parseInt(e.target.value) || 1)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="thickness" render={({ field }) => (
                <FormItem>
                  <FormLabel>Thickness (in)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0"
                      placeholder={rollRanges ? `e.g. ${rollRanges.minThickness}–${rollRanges.maxThickness}` : "Optional"}
                      {...field} value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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

      {/* ── 3. Recommendations ── */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Cutting Options</CardTitle>
            <CardDescription>
              Choose the best option based on waste percentage and remaining value.
              Selecting a roll below updates the cut strategy guide automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">

              {/* Rankings table */}
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
                      <TableRow
                        key={rec.roll.id}
                        className={vizRoll?.id === rec.roll.id ? "bg-muted/40" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getWasteIcon(rec.waste_percentage, index)}
                            <span className="font-medium">#{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{rec.roll.location || "No location"}</TableCell>
                        <TableCell>{rec.roll.width}" × {rec.roll.remaining_length}" × {rec.roll.thickness}"</TableCell>
                        <TableCell>
                          <Badge className={getWasteColor(rec.waste_percentage, index)}>
                            {rec.waste_percentage.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>{rec.material_used_sqft.toFixed(2)} sq ft</TableCell>
                        <TableCell>
                          {rec.remaining_length_after.toFixed(1)}"
                          <div className="text-xs text-muted-foreground">
                            ${rec.remaining_value_after.toFixed(2)} value
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* preview roll in visualizer without confirming */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setVizRoll(rec.roll)}
                              className="text-xs"
                              title="Preview cut strategy for this roll"
                            >
                              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant={index === 0 ? "default" : "outline"}
                              onClick={() => handleSelectRecommendation(rec)}
                            >
                              {index === 0 ? "Select Best" : "Select"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Simple best-option summary (kept compact — full detail is in the visualizer below) */}
              {recommendations[0] && (
                <div className="border rounded-lg p-4">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Best Option Summary
                  </h3>
                  <div className="flex flex-col md:flex-row gap-4 items-start">
                    <CutDiagram
                      roll={recommendations[0].roll}
                      cutWidth={fv.width}
                      cutLength={fv.length}
                      quantity={fv.quantity}
                    />
                    <div className="flex-1 text-sm space-y-2">
                      <div><strong>Material:</strong> {recommendations[0].roll.material_type}</div>
                      <div><strong>Roll:</strong> {recommendations[0].roll.location}</div>
                      <div><strong>Total length needed:</strong> {recommendations[0].total_length_needed}"</div>
                      <div><strong>Waste:</strong> {recommendations[0].waste_sqft.toFixed(2)} sq ft ({recommendations[0].waste_percentage.toFixed(1)}%)</div>
                      <div><strong>Remaining after cut:</strong> {recommendations[0].remaining_length_after.toFixed(1)}"</div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {fv.length >= fv.width ? "↕ Portrait orientation" : "↔ Landscape orientation"}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 4. NestingVisualizer — full cut strategy guide ─────────────
                   Rendered whenever a roll has been selected or previewed.
                   Props are live-bound to the active roll and current form values
                   so the 6 strategy cards and step-by-step diagram always reflect
                   exactly what the worker is about to cut.
              ────────────────────────────────────────────────────────────────── */}
              {vizRoll && fv.width > 0 && fv.length > 0 && (
                <div>
                  {/* Section label */}
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Cut Strategy Guide
                      {vizRoll.id !== recommendations[0]?.roll.id && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          (previewing roll at {vizRoll.location})
                        </span>
                      )}
                    </span>
                  </div>

                  {/*
                    NestingVisualizer receives:
                      defaultRollWidth  → actual roll width from inventory
                      defaultRollLength → remaining length on that specific roll
                      defaultCutWidth   → width the user typed in the form
                      defaultCutHeight  → length the user typed in the form

                    The component internally computes all 6 strategies, scores them
                    against grain/feed/yield, and renders the interactive step-by-step
                    diagram.  Workers can click any strategy card to see its cut order.
                  */}
                  <NestingVisualizer
                    defaultRollWidth={vizRoll.width}
                    defaultRollLength={vizRoll.remaining_length}
                    defaultCutWidth={fv.width}
                    defaultCutHeight={fv.length}
                  />
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Confirm dialog ── */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cut</DialogTitle>
            <DialogDescription>
              Are you sure you want to proceed? This will update the inventory.
            </DialogDescription>
          </DialogHeader>
          {selectedRecommendation && (
            <div className="py-4 space-y-3 text-sm">
              <div><strong>Material:</strong> {selectedRecommendation.roll.material_type}</div>
              <div><strong>Roll location:</strong> {selectedRecommendation.roll.location}</div>
              <div><strong>Cut:</strong> {fv.width}" × {fv.length}" × {fv.quantity} pieces</div>
              <div><strong>Waste:</strong> {selectedRecommendation.waste_percentage.toFixed(1)}%</div>
              <div><strong>Remaining after:</strong> {selectedRecommendation.remaining_length_after.toFixed(1)}"</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmCut} disabled={isConfirming}>
              {isConfirming ? "Recording..." : "Confirm Cut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
