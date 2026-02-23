"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { format, subDays, subMonths } from "date-fns";

import { type Cut } from "@/lib/supabase";
import { cutService } from "@/services/cutService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WasteTrendChart } from "./_components/waste-trend-chart";
import { MaterialWasteChart } from "./_components/material-waste-chart";
import { WasteMetrics } from "./_components/waste-metrics";

interface CutWithRoll extends Cut {
  roll?: {
    material_type: string;
    location: string;
    cost_per_sqft?: number;
  };
}

interface WasteAnalysis {
  period: string;
  totalWaste: number;
  wasteValue: number;
  averageWaste: number;
  cuts: number;
}

export default function WasteAnalysisPage() {
  const [cuts, setCuts] = useState<CutWithRoll[]>([]);
  const [wasteAnalysis, setWasteAnalysis] = useState<WasteAnalysis[]>([]);
  const [highWasteCuts, setHighWasteCuts] = useState<CutWithRoll[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch cuts from last 3 months with roll data
      const threeMonthsAgo = subMonths(new Date(), 3);

      const cutsData = await cutService.getCutsByDateRangeWithRolls(threeMonthsAgo);

      const cutsWithRoll = cutsData || [];
      setCuts(cutsWithRoll);

      // Find high waste cuts (>20% waste)
      const highWaste = cutsWithRoll.filter(cut => (cut.waste_percentage || 0) > 20);
      setHighWasteCuts(highWaste);

      // Generate weekly waste analysis
      const analysis: WasteAnalysis[] = [];
      for (let i = 0; i < 12; i++) {
        const weekStart = subDays(new Date(), i * 7);
        const weekEnd = subDays(new Date(), (i - 1) * 7);

        const weekCuts = cutsWithRoll.filter(cut => {
          const cutDate = new Date(cut.created_at);
          return cutDate >= weekStart && cutDate <= weekEnd;
        });

        if (weekCuts.length > 0) {
          const totalWaste = weekCuts.reduce((sum, cut) => sum + (cut.waste_sqft || 0), 0);
          const averageWaste = weekCuts.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / weekCuts.length;
          const wasteValue = weekCuts.reduce((sum, cut) => {
            const costPerSqft = cut.roll?.cost_per_sqft || 2.5;
            return sum + (cut.waste_sqft || 0) * costPerSqft;
          }, 0);

          analysis.push({
            period: format(weekStart, "MMM d"),
            totalWaste,
            wasteValue,
            averageWaste,
            cuts: weekCuts.length,
          });
        }
      }

      setWasteAnalysis(analysis.reverse());
    } catch (error) {
      console.error("Error fetching waste data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getWasteSeverity = (percentage: number) => {
    if (percentage <= 5) return { label: "Excellent", color: "default" as const };
    if (percentage <= 15) return { label: "Good", color: "secondary" as const };
    if (percentage <= 25) return { label: "Moderate", color: "outline" as const };
    return { label: "High", color: "destructive" as const };
  };

  const calculateWasteValue = (wasteSqft: number, costPerSqft?: number) => {
    return wasteSqft * (costPerSqft || 2.5);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading waste analysis...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Waste Analysis</h1>
        <p className="text-muted-foreground">
          Monitor material waste patterns and identify optimization opportunities
        </p>
      </div>

      {/* Waste Metrics */}
      <WasteMetrics cuts={cuts} />

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <WasteTrendChart data={wasteAnalysis} />
        <MaterialWasteChart cuts={cuts} />
      </div>

      {/* High Waste Alert */}
      {highWasteCuts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">High Waste Alert</CardTitle>
            </div>
            <CardDescription>
              {highWasteCuts.length} cuts in the last 3 months have exceeded 20% waste
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>Waste %</TableHead>
                    <TableHead>Waste Value</TableHead>
                    <TableHead>Job Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {highWasteCuts.slice(0, 10).map((cut) => {
                    const severity = getWasteSeverity(cut.waste_percentage || 0);
                    const wasteValue = calculateWasteValue(
                      cut.waste_sqft || 0,
                      cut.roll?.cost_per_sqft
                    );

                    return (
                      <TableRow key={cut.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(cut.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          {cut.roll?.material_type || "Unknown"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {cut.cut_width}" × {cut.cut_length}"
                        </TableCell>
                        <TableCell>
                          <Badge variant={severity.color}>
                            {(cut.waste_percentage || 0).toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          ${wasteValue.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {cut.job_reference || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {highWasteCuts.length > 10 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Showing 10 of {highWasteCuts.length} high-waste cuts
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Waste Reduction Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle>Waste Reduction Opportunities</CardTitle>
          <CardDescription>
            Recommendations based on your cutting patterns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-green-50 p-4 text-green-800 dark:bg-green-950 dark:text-green-300">
            <h4 className="font-medium">Consider Roll Selection Optimization</h4>
            <p className="text-sm mt-1">
              High waste cuts often result from suboptimal roll selection. Review the Cut Planner recommendations more carefully.
            </p>
          </div>

          <div className="rounded-lg border bg-blue-50 p-4 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <h4 className="font-medium">Batch Similar Cuts</h4>
            <p className="text-sm mt-1">
              Grouping similar-sized cuts can reduce setup waste and improve material utilization efficiency.
            </p>
          </div>

          <div className="rounded-lg border bg-amber-50 p-4 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <h4 className="font-medium">Review Cutting Methods</h4>
            <p className="text-sm mt-1">
              For cuts with consistently high waste, consider alternative cutting approaches or tooling adjustments.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}