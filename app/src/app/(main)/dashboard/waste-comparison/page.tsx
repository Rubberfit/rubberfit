"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Minus, Calendar } from "lucide-react";
import { cutService } from "@/services/cutService";
import { rollService } from "@/services/rollService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

interface WasteMetrics {
  period: string;
  avgWaste: number;
  totalCuts: number;
  totalWasteSqft: number;
  totalMaterialUsed: number;
}

interface ComparisonData {
  current: WasteMetrics;
  previous: WasteMetrics;
  improvement: number;
  savingsSqft: number;
  savingsDollars: number;
}

export default function WasteComparisonPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [materialComparison, setMaterialComparison] = useState<any[]>([]);

  useEffect(() => {
    fetchWasteComparison();
  }, [dateRange]);

  const fetchWasteComparison = async () => {
    setLoading(true);
    try {
      const { from, to } = dateRange;
      const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

      // Previous period (same duration before current period)
      const previousFrom = subDays(from, daysDiff);
      const previousTo = subDays(to, daysDiff);

      // Fetch current period cuts
      const currentCuts = await cutService.getCutsByDateRange(from, to);

      // Fetch previous period cuts
      const previousCuts = await cutService.getCutsByDateRange(previousFrom, previousTo);

      // Calculate metrics for both periods
      const currentMetrics = calculateMetrics(currentCuts || [], 'Current Period');
      const previousMetrics = calculateMetrics(previousCuts || [], 'Previous Period');

      // Calculate improvement
      const improvement = previousMetrics.avgWaste > 0
        ? ((previousMetrics.avgWaste - currentMetrics.avgWaste) / previousMetrics.avgWaste) * 100
        : 0;

      const savingsSqft = previousMetrics.totalWasteSqft - currentMetrics.totalWasteSqft;
      const avgCostPerSqft = 2.5; // Default average cost
      const savingsDollars = savingsSqft * avgCostPerSqft;

      setComparison({
        current: currentMetrics,
        previous: previousMetrics,
        improvement,
        savingsSqft: Math.abs(savingsSqft),
        savingsDollars: Math.abs(savingsDollars),
      });

      // Fetch daily trend data
      await fetchTrendData(from, to);

      // Fetch material-specific comparison
      await fetchMaterialComparison(from, to, previousFrom, previousTo);

    } catch (error) {
      console.error('Error fetching waste comparison:', error);
      toast.error('Failed to load waste comparison data');
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (cuts: any[], period: string): WasteMetrics => {
    if (cuts.length === 0) {
      return {
        period,
        avgWaste: 0,
        totalCuts: 0,
        totalWasteSqft: 0,
        totalMaterialUsed: 0,
      };
    }

    const totalWasteSqft = cuts.reduce((sum, cut) => sum + (cut.waste_sqft || 0), 0);
    const totalMaterialUsed = cuts.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0);
    const avgWaste = cuts.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / cuts.length;

    return {
      period,
      avgWaste,
      totalCuts: cuts.length,
      totalWasteSqft,
      totalMaterialUsed,
    };
  };

  const fetchTrendData = async (from: Date, to: Date) => {
    try {
      const cuts = await cutService.getCutsByDateRange(from, to);

      // Group by day
      const dailyData: { [key: string]: { total: number; count: number; waste: number } } = {};

      cuts?.forEach(cut => {
        const day = format(new Date(cut.created_at), 'yyyy-MM-dd');
        if (!dailyData[day]) {
          dailyData[day] = { total: 0, count: 0, waste: 0 };
        }
        dailyData[day].total += cut.waste_percentage || 0;
        dailyData[day].count += 1;
        dailyData[day].waste += cut.waste_sqft || 0;
      });

      const trend = Object.entries(dailyData).map(([date, data]) => ({
        date: format(new Date(date), 'MMM dd'),
        avgWaste: data.count > 0 ? data.total / data.count : 0,
        totalWaste: data.waste,
        cuts: data.count,
      }));

      setTrendData(trend);
    } catch (error) {
      console.error('Error fetching trend data:', error);
    }
  };

  const fetchMaterialComparison = async (from: Date, to: Date, previousFrom: Date, previousTo: Date) => {
    try {
      // Fetch rolls to get material types
      const rollMaterialMap = await rollService.getRollMaterialTypeMap();

      // Create material type map (convert Map to plain object for compatibility)
      const materialMap: { [key: string]: string } = {};
      rollMaterialMap.forEach((materialType, rollId) => {
        materialMap[rollId] = materialType;
      });

      // Fetch current period cuts
      const currentCuts = await cutService.getCutsByDateRange(from, to);

      // Fetch previous period cuts
      const previousCuts = await cutService.getCutsByDateRange(previousFrom, previousTo);

      // Group by material type
      const materialData: { [key: string]: { current: number[]; previous: number[] } } = {};

      currentCuts?.forEach(cut => {
        const material = cut.roll_id ? materialMap[cut.roll_id] || 'Unknown' : 'Unknown';
        if (!materialData[material]) {
          materialData[material] = { current: [], previous: [] };
        }
        materialData[material].current.push(cut.waste_percentage || 0);
      });

      previousCuts?.forEach(cut => {
        const material = cut.roll_id ? materialMap[cut.roll_id] || 'Unknown' : 'Unknown';
        if (!materialData[material]) {
          materialData[material] = { current: [], previous: [] };
        }
        materialData[material].previous.push(cut.waste_percentage || 0);
      });

      const comparison = Object.entries(materialData).map(([material, data]) => ({
        material,
        currentWaste: data.current.length > 0
          ? data.current.reduce((a, b) => a + b, 0) / data.current.length
          : 0,
        previousWaste: data.previous.length > 0
          ? data.previous.reduce((a, b) => a + b, 0) / data.previous.length
          : 0,
      }));

      setMaterialComparison(comparison);
    } catch (error) {
      console.error('Error fetching material comparison:', error);
    }
  };

  const getImprovementColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getImprovementIcon = (value: number) => {
    if (value > 0) return <TrendingDown className="h-4 w-4" />;
    if (value < 0) return <TrendingUp className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">Waste Reduction Metrics</h1>
          <p className="text-muted-foreground">
            Compare waste performance across periods
          </p>
        </div>
        <div className="text-center py-12">Loading comparison data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Waste Reduction Metrics</h1>
          <p className="text-muted-foreground">
            Compare waste performance across periods
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <DatePickerWithRange
            date={dateRange}
            onDateChange={(range) => {
              if (range && range.from && range.to) {
                setDateRange({ from: range.from, to: range.to });
              }
            }}
          />
        </div>
      </div>

      {/* Summary Cards */}
      {comparison && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Current Period Avg</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{comparison.current.avgWaste.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {comparison.current.totalCuts} cuts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Previous Period Avg</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{comparison.previous.avgWaste.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {comparison.previous.totalCuts} cuts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Improvement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold flex items-center gap-2 ${getImprovementColor(comparison.improvement)}`}>
                {getImprovementIcon(comparison.improvement)}
                {Math.abs(comparison.improvement).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {comparison.improvement > 0 ? 'Less waste' : comparison.improvement < 0 ? 'More waste' : 'No change'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Material Saved</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${comparison.savingsDollars.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">
                {comparison.savingsSqft.toFixed(1)} sqft
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Waste Trend</CardTitle>
          <CardDescription>
            Average waste percentage by day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="avgWaste"
                  stroke="#2563EB"
                  fill="#2563EB"
                  fillOpacity={0.2}
                  name="Avg Waste %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Material Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Material Type Comparison</CardTitle>
          <CardDescription>
            Waste performance by material type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={materialComparison}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="material" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="previousWaste" fill="#94A3B8" name="Previous Period" />
                <Bar dataKey="currentWaste" fill="#2563EB" name="Current Period" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}