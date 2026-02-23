"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, AlertCircle, Calculator } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

import { type Cut, type Roll } from "@/lib/supabase";
import { cutService } from "@/services/cutService";
import { exportService } from "@/services/exportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CostTrendChart } from "./_components/cost-trend-chart";
import { CostBreakdownChart } from "./_components/cost-breakdown-chart";

interface MonthlyCosts {
  period: string;
  materialCost: number;
  wasteCost: number;
  totalCost: number;
  cuts: number;
}

interface MaterialCost {
  materialType: string;
  totalCost: number;
  wasteCost: number;
  utilizationCost: number;
  cuts: number;
  avgCostPerCut: number;
}

export default function CostReportsPage() {
  const [monthlyCosts, setMonthlyCosts] = useState<MonthlyCosts[]>([]);
  const [materialCosts, setMaterialCosts] = useState<MaterialCost[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [loading, setLoading] = useState(true);

  const fetchCostData = async () => {
    setLoading(true);
    try {
      const monthsBack = selectedPeriod === "12months" ? 12 : 6;
      const startDate = subMonths(new Date(), monthsBack);

      // Fetch cuts with roll data
      const cuts = await cutService.getCutsByDateRangeWithRolls(startDate);

      const cutsData = cuts || [];

      // Calculate monthly costs
      const monthlyData: MonthlyCosts[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(subMonths(new Date(), i));

        const monthCuts = cutsData.filter(cut => {
          const cutDate = new Date(cut.created_at);
          return cutDate >= monthStart && cutDate <= monthEnd;
        });

        const materialCost = monthCuts.reduce((sum, cut) => {
          const costPerSqft = cut.roll?.cost_per_sqft || 2.5;
          return sum + (cut.total_sqft_used || 0) * costPerSqft;
        }, 0);

        const wasteCost = monthCuts.reduce((sum, cut) => {
          const costPerSqft = cut.roll?.cost_per_sqft || 2.5;
          return sum + (cut.waste_sqft || 0) * costPerSqft;
        }, 0);

        monthlyData.push({
          period: format(monthStart, "MMM yyyy"),
          materialCost,
          wasteCost,
          totalCost: materialCost + wasteCost,
          cuts: monthCuts.length,
        });
      }

      setMonthlyCosts(monthlyData);

      // Calculate material costs
      const materialStats = cutsData.reduce((acc, cut) => {
        const material = cut.roll?.material_type || "Unknown";
        const costPerSqft = cut.roll?.cost_per_sqft || 2.5;

        if (!acc[material]) {
          acc[material] = {
            materialType: material,
            totalCost: 0,
            wasteCost: 0,
            cuts: 0,
          };
        }

        acc[material].totalCost += (cut.total_sqft_used || 0) * costPerSqft;
        acc[material].wasteCost += (cut.waste_sqft || 0) * costPerSqft;
        acc[material].cuts += 1;

        return acc;
      }, {} as Record<string, {
        materialType: string;
        totalCost: number;
        wasteCost: number;
        cuts: number;
      }>);

      const materialCostData: MaterialCost[] = Object.values(materialStats).map((stat: any) => ({
        materialType: stat.materialType,
        totalCost: stat.totalCost,
        wasteCost: stat.wasteCost,
        cuts: stat.cuts,
        utilizationCost: stat.totalCost - stat.wasteCost,
        avgCostPerCut: stat.cuts > 0 ? stat.totalCost / stat.cuts : 0,
      })).sort((a, b) => b.totalCost - a.totalCost);

      setMaterialCosts(materialCostData);
    } catch (error) {
      console.error("Error fetching cost data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCostData();
  }, [selectedPeriod]);

  const totalCost = monthlyCosts.reduce((sum, month) => sum + month.totalCost, 0);
  const totalWasteCost = monthlyCosts.reduce((sum, month) => sum + month.wasteCost, 0);
  const totalUtilizationCost = totalCost - totalWasteCost;
  const wastePercentage = totalCost > 0 ? (totalWasteCost / totalCost) * 100 : 0;

  const exportReport = () => {
    const reportData = {
      reportDate: new Date().toISOString(),
      period: selectedPeriod,
      summary: {
        totalCost: totalCost.toFixed(2),
        utilizationCost: totalUtilizationCost.toFixed(2),
        wasteCost: totalWasteCost.toFixed(2),
        wastePercentage: wastePercentage.toFixed(2),
      },
      monthlyBreakdown: monthlyCosts,
      materialBreakdown: materialCosts,
    };

    // Export as CSV
    const headers = ['Period', 'Material Type', 'Total Cost', 'Utilization Cost', 'Waste Cost', 'Waste %'];
    const rows = [];

    // Add monthly data
    monthlyCosts.forEach((month: any) => {
      rows.push([
        month.month || month.period,
        'All Materials',
        `$${month.totalCost.toFixed(2)}`,
        `$${(month.utilizationCost || (month.totalCost - month.wasteCost)).toFixed(2)}`,
        `$${month.wasteCost.toFixed(2)}`,
        `${(month.wastePercentage || ((month.wasteCost / month.totalCost) * 100)).toFixed(1)}%`
      ]);
    });

    // Add material breakdown
    rows.push(['', '', '', '', '', '']); // Empty row
    rows.push(['Material Breakdown', '', '', '', '', '']);
    Object.entries(materialCosts).forEach(([material, data]: [string, any]) => {
      rows.push([
        'Current Period',
        material,
        `$${data.totalCost.toFixed(2)}`,
        `$${data.utilizationCost.toFixed(2)}`,
        `$${data.wasteCost.toFixed(2)}`,
        `${data.wastePercentage.toFixed(1)}%`
      ]);
    });

    exportService.exportToCSV({
      headers,
      rows,
      filename: 'cost-report'
    });
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cost Reports</h1>
          <p className="text-muted-foreground">
            Analyze material costs, waste expenses, and spending patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="12months">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportReport} variant="outline">
            Export Report
          </Button>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Material + waste costs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilization Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalUtilizationCost.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Productive material usage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waste Cost</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalWasteCost.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Material wasted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waste Impact</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wastePercentage.toFixed(1)}%</div>
            <p className={`text-xs ${wastePercentage <= 10 ? 'text-green-600' : wastePercentage <= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
              {wastePercentage <= 10 ? 'Excellent' : wastePercentage <= 20 ? 'Good' : 'Needs improvement'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <CostTrendChart data={monthlyCosts} />
        <CostBreakdownChart data={materialCosts} />
      </div>

      {/* Monthly Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cost Breakdown</CardTitle>
          <CardDescription>
            Detailed monthly analysis of material and waste costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Material Cost</TableHead>
                  <TableHead>Waste Cost</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Cuts</TableHead>
                  <TableHead>Avg Cost/Cut</TableHead>
                  <TableHead>Waste %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyCosts.map((month) => {
                  const wastePercentage = month.totalCost > 0
                    ? (month.wasteCost / month.totalCost) * 100
                    : 0;
                  const avgCostPerCut = month.cuts > 0 ? month.totalCost / month.cuts : 0;

                  return (
                    <TableRow key={month.period}>
                      <TableCell className="font-medium">
                        {month.period}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${(month.totalCost - month.wasteCost).toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${month.wasteCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        ${month.totalCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {month.cuts}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${avgCostPerCut.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={wastePercentage <= 10 ? "default" :
                                  wastePercentage <= 20 ? "secondary" : "destructive"}
                        >
                          {wastePercentage.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Material Cost Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Cost by Material Type</CardTitle>
          <CardDescription>
            Break down costs by material type to identify spending patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Type</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Utilization Cost</TableHead>
                  <TableHead>Waste Cost</TableHead>
                  <TableHead>Cuts</TableHead>
                  <TableHead>Avg Cost/Cut</TableHead>
                  <TableHead>Waste Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialCosts.map((material) => {
                  const wasteImpact = material.totalCost > 0
                    ? (material.wasteCost / material.totalCost) * 100
                    : 0;

                  return (
                    <TableRow key={material.materialType}>
                      <TableCell className="font-medium">
                        {material.materialType}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        ${material.totalCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${material.utilizationCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${material.wasteCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {material.cuts}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${material.avgCostPerCut.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={wasteImpact <= 10 ? "default" :
                                  wasteImpact <= 20 ? "secondary" : "destructive"}
                        >
                          {wasteImpact.toFixed(1)}%
                        </Badge>
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
  );
}