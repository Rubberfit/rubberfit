"use client";

import { useEffect, useState } from "react";
import { BarChart3, Package, TrendingUp, Activity } from "lucide-react";
import { format, subMonths } from "date-fns";

import { type Cut, type Roll } from "@/lib/supabase";
import { cutService } from "@/services/cutService";
import { rollService } from "@/services/rollService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { UsageTrendChart } from "./_components/usage-trend-chart";
import { MaterialDistributionChart } from "./_components/material-distribution-chart";

interface MaterialUsage {
  materialType: string;
  totalSqftUsed: number;
  totalCuts: number;
  averageUtilization: number;
  totalValue: number;
  rollsUsed: number;
}

interface UsageData {
  period: string;
  totalUsage: number;
  cuts: number;
}

export default function MaterialUsagePage() {
  const [materialUsage, setMaterialUsage] = useState<MaterialUsage[]>([]);
  const [usageTrend, setUsageTrend] = useState<UsageData[]>([]);
  const [recentActivity, setRecentActivity] = useState<(Cut & { roll?: { material_type: string; location: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch cuts from last 6 months
      const sixMonthsAgo = subMonths(new Date(), 6);

      const cuts = await cutService.getCutsByDateRangeWithRolls(sixMonthsAgo);

      const cutsData = cuts || [];

      // Get recent activity (last 20 cuts)
      setRecentActivity(cutsData.slice(0, 20));

      // Calculate material usage
      const materialStats = cutsData.reduce((acc, cut) => {
        const material = cut.roll?.material_type || "Unknown";
        if (!acc[material]) {
          acc[material] = {
            materialType: material,
            totalSqftUsed: 0,
            totalCuts: 0,
            rollsUsed: new Set(),
            totalValue: 0,
          };
        }

        acc[material].totalSqftUsed += cut.total_sqft_used || 0;
        acc[material].totalCuts += 1;
        if (cut.roll_id) {
          acc[material].rollsUsed.add(cut.roll_id);
        }

        const costPerSqft = cut.roll?.cost_per_sqft || 2.5;
        acc[material].totalValue += (cut.total_sqft_used || 0) * costPerSqft;

        return acc;
      }, {} as Record<string, {
        materialType: string;
        totalSqftUsed: number;
        totalCuts: number;
        rollsUsed: Set<string>;
        totalValue: number;
      }>);

      // Fetch all rolls to calculate utilization
      const rolls = await rollService.getAllRolls();

      const rollsData = rolls || [];

      const materialUsageData: MaterialUsage[] = Object.values(materialStats).map((stat: any) => {
        const materialRolls = rollsData.filter(roll => roll.material_type === stat.materialType);
        const totalOriginalSqft = materialRolls.reduce((sum, roll) =>
          sum + (roll.width * roll.length) / 144, 0
        );

        return {
          ...stat,
          rollsUsed: stat.rollsUsed.size,
          averageUtilization: totalOriginalSqft > 0 ? (stat.totalSqftUsed / totalOriginalSqft) * 100 : 0,
        };
      }).sort((a, b) => b.totalSqftUsed - a.totalSqftUsed);

      setMaterialUsage(materialUsageData);

      // Generate monthly usage trend
      const trendData: UsageData[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = subMonths(new Date(), i + 1);
        const monthEnd = subMonths(new Date(), i);

        const monthCuts = cutsData.filter(cut => {
          const cutDate = new Date(cut.created_at);
          return cutDate >= monthStart && cutDate < monthEnd;
        });

        const totalUsage = monthCuts.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0);

        trendData.push({
          period: format(monthStart, "MMM yyyy"),
          totalUsage,
          cuts: monthCuts.length,
        });
      }

      setUsageTrend(trendData);
    } catch (error) {
      console.error("Error fetching usage data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalSqftUsed = materialUsage.reduce((sum, m) => sum + m.totalSqftUsed, 0);
  const totalValue = materialUsage.reduce((sum, m) => sum + m.totalValue, 0);
  const totalCuts = materialUsage.reduce((sum, m) => sum + m.totalCuts, 0);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading usage data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Material Usage</h1>
        <p className="text-muted-foreground">
          Track material consumption patterns and utilization efficiency
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Material Used</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSqftUsed.toFixed(0)} sq ft</div>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Material Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Worth of material consumed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cuts</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCuts}</div>
            <p className="text-xs text-muted-foreground">Cutting operations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Material Types</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{materialUsage.length}</div>
            <p className="text-xs text-muted-foreground">Types in use</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <UsageTrendChart data={usageTrend} />
        <MaterialDistributionChart data={materialUsage} />
      </div>

      {/* Material Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle>Material Usage by Type</CardTitle>
          <CardDescription>
            Detailed breakdown of material consumption over the last 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Type</TableHead>
                  <TableHead>Total Used (sq ft)</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Cuts</TableHead>
                  <TableHead>Rolls Used</TableHead>
                  <TableHead>Utilization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialUsage.map((material) => (
                  <TableRow key={material.materialType}>
                    <TableCell className="font-medium">
                      {material.materialType}
                    </TableCell>
                    <TableCell className="font-mono">
                      {material.totalSqftUsed.toFixed(1)}
                    </TableCell>
                    <TableCell className="font-mono">
                      ${material.totalValue.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {material.totalCuts}
                    </TableCell>
                    <TableCell className="text-center">
                      {material.rollsUsed}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={material.averageUtilization} className="w-20" />
                        <Badge variant={material.averageUtilization >= 80 ? "default" : "secondary"}>
                          {material.averageUtilization.toFixed(1)}%
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Material Usage</CardTitle>
          <CardDescription>Last 20 cutting operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Material Used</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.map((cut) => (
                  <TableRow key={cut.id}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(cut.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>{cut.roll?.material_type || "Unknown"}</TableCell>
                    <TableCell className="font-mono">
                      {cut.cut_width}" × {cut.cut_length}"
                    </TableCell>
                    <TableCell className="text-center">{cut.quantity}</TableCell>
                    <TableCell className="font-mono">
                      {cut.total_sqft_used?.toFixed(2) || "N/A"} sq ft
                    </TableCell>
                    <TableCell>{cut.roll?.location || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}