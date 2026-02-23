"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, BarChart3, Activity } from "lucide-react";
import { format, subDays, subWeeks, subMonths } from "date-fns";

import { type Cut } from "@/lib/supabase";
import { cutService } from "@/services/cutService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { MultiMetricChart } from "./_components/multi-metric-chart";
import { TrendAnalysis } from "./_components/trend-analysis";
import { SeasonalAnalysis } from "./_components/seasonal-analysis";

interface TrendData {
  date: string;
  cuts: number;
  materialUsed: number;
  wastePercentage: number;
  efficiency: number;
  cost: number;
}

interface TrendMetrics {
  cutsChange: number;
  materialUsageChange: number;
  wasteChange: number;
  efficiencyChange: number;
  costChange: number;
}

export default function TrendsPage() {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [trendMetrics, setTrendMetrics] = useState<TrendMetrics | null>(null);
  const [timeframe, setTimeframe] = useState("30days");
  const [loading, setLoading] = useState(true);

  const fetchTrendData = async () => {
    setLoading(true);
    try {
      let startDate: Date;
      let groupBy: "day" | "week" | "month";

      switch (timeframe) {
        case "7days":
          startDate = subDays(new Date(), 7);
          groupBy = "day";
          break;
        case "30days":
          startDate = subDays(new Date(), 30);
          groupBy = "day";
          break;
        case "12weeks":
          startDate = subWeeks(new Date(), 12);
          groupBy = "week";
          break;
        case "12months":
          startDate = subMonths(new Date(), 12);
          groupBy = "month";
          break;
        default:
          startDate = subDays(new Date(), 30);
          groupBy = "day";
      }

      const cuts = await cutService.getCutsByDateRangeWithRolls(startDate, undefined, { ascending: true });

      const cutsData = cuts || [];

      // Group data by time period
      const groupedData: Record<string, {
        cuts: number;
        totalMaterialUsed: number;
        totalWaste: number;
        totalCost: number;
        validWasteCuts: number;
      }> = {};

      cutsData.forEach(cut => {
        const cutDate = new Date(cut.created_at);
        let periodKey: string;

        if (groupBy === "day") {
          periodKey = format(cutDate, "yyyy-MM-dd");
        } else if (groupBy === "week") {
          const weekStart = new Date(cutDate);
          weekStart.setDate(cutDate.getDate() - cutDate.getDay());
          periodKey = format(weekStart, "yyyy-MM-dd");
        } else {
          periodKey = format(cutDate, "yyyy-MM");
        }

        if (!groupedData[periodKey]) {
          groupedData[periodKey] = {
            cuts: 0,
            totalMaterialUsed: 0,
            totalWaste: 0,
            totalCost: 0,
            validWasteCuts: 0,
          };
        }

        groupedData[periodKey].cuts += 1;
        groupedData[periodKey].totalMaterialUsed += cut.total_sqft_used || 0;

        if (cut.waste_percentage !== null) {
          groupedData[periodKey].totalWaste += cut.waste_percentage || 0;
          groupedData[periodKey].validWasteCuts += 1;
        }

        const costPerSqft = cut.roll?.cost_per_sqft || 2.5;
        groupedData[periodKey].totalCost += (cut.total_sqft_used || 0) * costPerSqft;
      });

      // Convert to trend data
      const trends: TrendData[] = Object.entries(groupedData)
        .map(([date, data]) => {
          const averageWaste = data.validWasteCuts > 0
            ? data.totalWaste / data.validWasteCuts
            : 0;
          const efficiency = 100 - averageWaste;

          return {
            date: groupBy === "month" ? `${date}-01` : date,
            cuts: data.cuts,
            materialUsed: data.totalMaterialUsed,
            wastePercentage: averageWaste,
            efficiency,
            cost: data.totalCost,
          };
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setTrendData(trends);

      // Calculate period-over-period changes
      if (trends.length >= 2) {
        const recent = trends.slice(-7); // Last 7 periods
        const previous = trends.slice(-14, -7); // Previous 7 periods

        if (previous.length > 0) {
          const recentAvg = {
            cuts: recent.reduce((sum, item) => sum + item.cuts, 0) / recent.length,
            materialUsed: recent.reduce((sum, item) => sum + item.materialUsed, 0) / recent.length,
            wastePercentage: recent.reduce((sum, item) => sum + item.wastePercentage, 0) / recent.length,
            efficiency: recent.reduce((sum, item) => sum + item.efficiency, 0) / recent.length,
            cost: recent.reduce((sum, item) => sum + item.cost, 0) / recent.length,
          };

          const previousAvg = {
            cuts: previous.reduce((sum, item) => sum + item.cuts, 0) / previous.length,
            materialUsed: previous.reduce((sum, item) => sum + item.materialUsed, 0) / previous.length,
            wastePercentage: previous.reduce((sum, item) => sum + item.wastePercentage, 0) / previous.length,
            efficiency: previous.reduce((sum, item) => sum + item.efficiency, 0) / previous.length,
            cost: previous.reduce((sum, item) => sum + item.cost, 0) / previous.length,
          };

          const calculateChange = (current: number, previous: number) =>
            previous !== 0 ? ((current - previous) / previous) * 100 : 0;

          setTrendMetrics({
            cutsChange: calculateChange(recentAvg.cuts, previousAvg.cuts),
            materialUsageChange: calculateChange(recentAvg.materialUsed, previousAvg.materialUsed),
            wasteChange: calculateChange(recentAvg.wastePercentage, previousAvg.wastePercentage),
            efficiencyChange: calculateChange(recentAvg.efficiency, previousAvg.efficiency),
            costChange: calculateChange(recentAvg.cost, previousAvg.cost),
          });
        }
      }
    } catch (error) {
      console.error("Error fetching trend data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrendData();
  }, [timeframe]);

  const formatTrendValue = (value: number, showSign = true) => {
    const sign = showSign && value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  const getTrendColor = (value: number, inverse = false) => {
    const isPositive = inverse ? value < 0 : value > 0;
    return isPositive ? "text-green-600" : "text-red-600";
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading trend analysis...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trends</h1>
          <p className="text-muted-foreground">
            Analyze performance trends and identify patterns over time
          </p>
        </div>
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="12weeks">Last 12 Weeks</SelectItem>
            <SelectItem value="12months">Last 12 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trend Metrics */}
      {trendMetrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cuts Volume</CardTitle>
              {trendMetrics.cutsChange >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getTrendColor(trendMetrics.cutsChange)}`}>
                {formatTrendValue(trendMetrics.cutsChange)}
              </div>
              <p className="text-xs text-muted-foreground">vs previous period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Material Usage</CardTitle>
              {trendMetrics.materialUsageChange >= 0 ? (
                <TrendingUp className="h-4 w-4 text-blue-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-blue-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getTrendColor(trendMetrics.materialUsageChange)}`}>
                {formatTrendValue(trendMetrics.materialUsageChange)}
              </div>
              <p className="text-xs text-muted-foreground">Material consumption</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Waste Level</CardTitle>
              {trendMetrics.wasteChange <= 0 ? (
                <TrendingDown className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getTrendColor(trendMetrics.wasteChange, true)}`}>
                {formatTrendValue(trendMetrics.wasteChange)}
              </div>
              <p className="text-xs text-muted-foreground">Waste percentage</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
              {trendMetrics.efficiencyChange >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getTrendColor(trendMetrics.efficiencyChange)}`}>
                {formatTrendValue(trendMetrics.efficiencyChange)}
              </div>
              <p className="text-xs text-muted-foreground">Material efficiency</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costs</CardTitle>
              {trendMetrics.costChange <= 0 ? (
                <TrendingDown className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getTrendColor(trendMetrics.costChange, true)}`}>
                {formatTrendValue(trendMetrics.costChange)}
              </div>
              <p className="text-xs text-muted-foreground">Material costs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Multi-Metric Chart */}
      <MultiMetricChart data={trendData} timeframe={timeframe} />

      {/* Analysis Components */}
      <div className="grid gap-4 md:grid-cols-2">
        <TrendAnalysis data={trendData} />
        <SeasonalAnalysis data={trendData} timeframe={timeframe} />
      </div>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
          <CardDescription>
            Automated analysis of your operational trends
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {trendMetrics && (
            <>
              {trendMetrics.efficiencyChange > 5 && (
                <div className="rounded-lg border bg-green-50 p-4 text-green-800 dark:bg-green-950 dark:text-green-300">
                  <h4 className="font-medium">Efficiency Improving</h4>
                  <p className="text-sm mt-1">
                    Material efficiency has improved by {formatTrendValue(trendMetrics.efficiencyChange, false)} -
                    great work on waste reduction!
                  </p>
                </div>
              )}

              {trendMetrics.wasteChange > 10 && (
                <div className="rounded-lg border bg-amber-50 p-4 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <h4 className="font-medium">Waste Increase Detected</h4>
                  <p className="text-sm mt-1">
                    Waste levels have increased by {formatTrendValue(trendMetrics.wasteChange, false)}.
                    Review recent cutting operations and roll selection processes.
                  </p>
                </div>
              )}

              {trendMetrics.cutsChange > 20 && (
                <div className="rounded-lg border bg-blue-50 p-4 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  <h4 className="font-medium">High Activity Period</h4>
                  <p className="text-sm mt-1">
                    Cutting volume has increased by {formatTrendValue(trendMetrics.cutsChange, false)}.
                    Monitor inventory levels and consider bulk ordering.
                  </p>
                </div>
              )}

              {Math.abs(trendMetrics.cutsChange) < 5 && Math.abs(trendMetrics.wasteChange) < 5 && (
                <div className="rounded-lg border bg-gray-50 p-4 text-gray-800 dark:bg-gray-950 dark:text-gray-300">
                  <h4 className="font-medium">Stable Operations</h4>
                  <p className="text-sm mt-1">
                    Operations are stable with consistent cutting volume and waste levels.
                    Good operational control maintained.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}