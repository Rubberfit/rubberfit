"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Package, Scissors, Info, CheckCircle } from "lucide-react";
import { rollService } from "@/services/rollService";
import { cutService } from "@/services/cutService";
import type { Roll } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CutRequest {
  width: number;
  length: number;
  quantity: number;
}

export default function ManualCutPlannerPage() {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [selectedRoll, setSelectedRoll] = useState<Roll | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wasteCalculation, setWasteCalculation] = useState<any>(null);

  const [rollRanges, setRollRanges] = useState<{ minWidth: number; maxWidth: number; maxLength: number } | null>(null);

  const form = useForm<CutRequest>({
    defaultValues: {
      width: undefined as unknown as number,
      length: undefined as unknown as number,
      quantity: 1,
    },
  });

  useEffect(() => {
    fetchRolls();
  }, []);

  const fetchRolls = async () => {
    try {
      setLoading(true);
      const activeRolls = await rollService.getActiveRolls();
      setRolls(activeRolls);
      if (activeRolls.length > 0) {
        setRollRanges({
          minWidth: Math.min(...activeRolls.map(r => r.width)),
          maxWidth: Math.max(...activeRolls.map(r => r.width)),
          maxLength: Math.max(...activeRolls.map(r => r.remaining_length)),
        });
      }
    } catch (error) {
      console.error('Error fetching rolls:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const selectRoll = (roll: Roll) => {
    setSelectedRoll(roll);
    calculateWaste(roll);
  };

  const calculateWaste = (roll: Roll) => {
    const values = form.getValues();
    if (values.width && values.length && values.quantity) {
      const totalLengthNeeded = values.length * values.quantity;
      const materialUsedSqft = (values.width * totalLengthNeeded) / 144;
      const totalConsumedSqft = (roll.width * totalLengthNeeded) / 144;
      const wasteSqft = totalConsumedSqft - materialUsedSqft;
      const wastePercentage = totalConsumedSqft > 0
        ? (wasteSqft / totalConsumedSqft) * 100
        : 0;

      setWasteCalculation({
        totalLengthNeeded,
        materialUsedSqft,
        totalConsumedSqft,
        wasteSqft,
        wastePercentage,
        remainingAfter: roll.remaining_length - totalLengthNeeded,
        canFit: roll.width >= values.width && roll.remaining_length >= totalLengthNeeded,
      });
    }
  };

  const onSubmit = (data: CutRequest) => {
    if (!selectedRoll) {
      toast.error('Please select a roll first');
      return;
    }

    const totalLengthNeeded = data.length * data.quantity;

    // Validate the cut can be made
    if (selectedRoll.width < data.width) {
      toast.error(`Roll width (${selectedRoll.width}") is less than requested width (${data.width}")`);
      return;
    }

    if (selectedRoll.remaining_length < totalLengthNeeded) {
      toast.error(`Not enough material. Need ${totalLengthNeeded}", but only ${selectedRoll.remaining_length}" available`);
      return;
    }

    // Recalculate waste for confirmation
    calculateWaste(selectedRoll);
    setConfirmDialog(true);
  };

  const confirmCut = async () => {
    if (!selectedRoll || !wasteCalculation) return;

    setProcessing(true);
    try {
      const formData = form.getValues();

      await cutService.recordCut({
        roll_id: selectedRoll.id,
        cut_width: formData.width,
        cut_length: formData.length,
        quantity: formData.quantity,
        waste_sqft: wasteCalculation.wasteSqft,
        waste_percentage: wasteCalculation.wastePercentage,
        total_sqft_used: wasteCalculation.totalConsumedSqft,
        job_reference: 'MANUAL',
        cut_by: 'Current User',
        notes: 'Manual roll selection',
      });

      toast.success('Cut recorded successfully! Inventory has been updated.');

      // Reset everything
      form.reset();
      setSelectedRoll(null);
      setWasteCalculation(null);
      setConfirmDialog(false);
      fetchRolls(); // Refresh inventory
    } catch (error) {
      console.error('Failed to record cut:', error);
      toast.error('Failed to record cut');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">Manual Roll Selection</h1>
          <p className="text-muted-foreground">
            Select a specific roll for your cut
          </p>
        </div>
        <div className="text-center py-12">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Manual Roll Selection</h1>
        <p className="text-muted-foreground">
          Select a specific roll for your cut instead of using optimization
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cut Requirements Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Cut Requirements
            </CardTitle>
            <CardDescription>
              Enter your cutting requirements first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="width"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Width Needed (inches)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.001"
                          placeholder={rollRanges ? `e.g. ${rollRanges.minWidth}–${rollRanges.maxWidth}` : "12"}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            field.onChange(e.target.value ? parseFloat(e.target.value) : undefined);
                            if (selectedRoll) calculateWaste(selectedRoll);
                          }}
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
                      <FormLabel>Length Needed (inches)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.001"
                          placeholder={rollRanges ? `e.g. up to ${rollRanges.maxLength}` : "24"}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            field.onChange(e.target.value ? parseFloat(e.target.value) : undefined);
                            if (selectedRoll) calculateWaste(selectedRoll);
                          }}
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
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="1"
                          {...field}
                          onChange={(e) => {
                            field.onChange(parseInt(e.target.value) || 1);
                            if (selectedRoll) calculateWaste(selectedRoll);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedRoll && wasteCalculation && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="font-medium">Selected Roll</div>
                    <div className="text-sm space-y-1">
                      <div>{selectedRoll.material_type}</div>
                      <div>{selectedRoll.width}" × {selectedRoll.remaining_length}"</div>
                      <div>Location: {selectedRoll.location || 'Unknown'}</div>
                    </div>

                    {wasteCalculation.canFit ? (
                      <>
                        <div className="text-sm space-y-1 pt-2 border-t">
                          <div>Waste: {wasteCalculation.wastePercentage.toFixed(1)}%</div>
                          <div>Remaining: {wasteCalculation.remainingAfter.toFixed(1)}"</div>
                        </div>
                        <Button type="submit" className="w-full">
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Confirm Cut
                        </Button>
                      </>
                    ) : (
                      <div className="text-destructive text-sm font-medium pt-2 border-t">
                        Roll cannot accommodate this cut
                      </div>
                    )}
                  </div>
                )}

                {!selectedRoll && (
                  <div className="p-4 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
                    Select a roll from the inventory list
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Roll Selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Available Rolls
            </CardTitle>
            <CardDescription>
              Click on a roll to select it for your cut
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolls.map((roll) => {
                    const isSelected = selectedRoll?.id === roll.id;
                    return (
                      <TableRow
                        key={roll.id}
                        className={isSelected ? 'bg-blue-50' : ''}
                      >
                        <TableCell>{roll.material_type}</TableCell>
                        <TableCell>
                          {roll.width}" × {roll.length}" × {roll.thickness}"
                        </TableCell>
                        <TableCell>
                          <Badge variant={roll.remaining_length < 50 ? "destructive" : "default"}>
                            {roll.remaining_length}"
                          </Badge>
                        </TableCell>
                        <TableCell>{roll.location || '-'}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() => selectRoll(roll)}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Manual Cut</DialogTitle>
            <DialogDescription>
              Please review the cut details before confirming
            </DialogDescription>
          </DialogHeader>

          {selectedRoll && wasteCalculation && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Roll:</span>
                  <span className="text-sm font-medium">
                    {selectedRoll.material_type} ({selectedRoll.location || 'No location'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Cut Size:</span>
                  <span className="text-sm font-medium">
                    {form.getValues().width}" × {form.getValues().length}" × {form.getValues().quantity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Material Used:</span>
                  <span className="text-sm font-medium">
                    {wasteCalculation.materialUsedSqft.toFixed(2)} sqft
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Waste:</span>
                  <span className="text-sm font-medium text-destructive">
                    {wasteCalculation.wastePercentage.toFixed(1)}% ({wasteCalculation.wasteSqft.toFixed(2)} sqft)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Remaining After:</span>
                  <span className="text-sm font-medium">
                    {wasteCalculation.remainingAfter.toFixed(1)}"
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    This is a manual selection. The system optimization might have found a more efficient option.
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={confirmCut} disabled={processing}>
              {processing ? 'Processing...' : 'Confirm Cut'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}