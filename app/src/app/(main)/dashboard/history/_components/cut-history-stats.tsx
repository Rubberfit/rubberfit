"use client";

import { Scissors, Zap, TrendingDown, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Cut } from "@/lib/supabase";

interface CutHistoryStatsProps {
  cuts: (Cut & { roll?: { material_type: string; location: string } })[];
}

export function CutHistoryStats({ cuts }: CutHistoryStatsProps) {
  const totalCuts = cuts.length;
  const totalQuantity = cuts.reduce((sum, cut) => sum + cut.quantity, 0);
  const totalSqftUsed = cuts.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0);
  const averageWaste = cuts.length > 0
    ? cuts.filter(cut => cut.waste_percentage !== null)
           .reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / cuts.filter(cut => cut.waste_percentage !== null).length
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Cuts</CardTitle>
          <Scissors className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCuts}</div>
          <p className="text-xs text-muted-foreground">
            Cutting operations logged
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Pieces</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalQuantity}</div>
          <p className="text-xs text-muted-foreground">
            Individual pieces cut
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Material Used</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalSqftUsed.toFixed(1)}</div>
          <p className="text-xs text-muted-foreground">
            Square feet consumed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Waste</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {averageWaste.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            {averageWaste <= 10 ? "Excellent efficiency" : averageWaste <= 20 ? "Good efficiency" : "Review efficiency"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}