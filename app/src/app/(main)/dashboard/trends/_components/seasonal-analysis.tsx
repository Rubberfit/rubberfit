"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, getDay, getMonth, getWeek } from "date-fns";

interface TrendData {
  date: string;
  cuts: number;
  materialUsed: number;
  wastePercentage: number;
  efficiency: number;
  cost: number;
}

interface SeasonalAnalysisProps {
  data: TrendData[];
  timeframe: string;
}

export function SeasonalAnalysis({ data, timeframe }: SeasonalAnalysisProps) {
  if (data.length < 7) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Seasonal Patterns</CardTitle>
          <CardDescription>Not enough data for pattern analysis</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Group data by day of week, month, or other patterns
  const analyzePatterns = () => {
    if (timeframe === "12months") {
      // Monthly patterns
      const monthlyData: Record<number, TrendData[]> = {};
      data.forEach(item => {
        const month = getMonth(new Date(item.date));
        if (!monthlyData[month]) monthlyData[month] = [];
        monthlyData[month].push(item);
      });

      const monthlyAverages = Object.entries(monthlyData).map(([month, items]) => ({
        period: format(new Date(2024, parseInt(month), 1), "MMMM"),
        avgCuts: items.reduce((sum, item) => sum + item.cuts, 0) / items.length,
        avgWaste: items.reduce((sum, item) => sum + item.wastePercentage, 0) / items.length,
        avgEfficiency: items.reduce((sum, item) => sum + item.efficiency, 0) / items.length,
        count: items.length,
      }));

      return {
        type: "Monthly",
        patterns: monthlyAverages,
      };
    } else if (timeframe === "12weeks" || timeframe === "30days") {
      // Weekly day patterns
      const weeklyData: Record<number, TrendData[]> = {};
      data.forEach(item => {
        const dayOfWeek = getDay(new Date(item.date));
        if (!weeklyData[dayOfWeek]) weeklyData[dayOfWeek] = [];
        weeklyData[dayOfWeek].push(item);
      });

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const weeklyAverages = Object.entries(weeklyData).map(([day, items]) => ({
        period: dayNames[parseInt(day)],
        avgCuts: items.reduce((sum, item) => sum + item.cuts, 0) / items.length,
        avgWaste: items.reduce((sum, item) => sum + item.wastePercentage, 0) / items.length,
        avgEfficiency: items.reduce((sum, item) => sum + item.efficiency, 0) / items.length,
        count: items.length,
      })).filter(item => item.count > 0);

      return {
        type: "Weekly",
        patterns: weeklyAverages,
      };
    }

    return {
      type: "General",
      patterns: [],
    };
  };

  const { type, patterns } = analyzePatterns();

  const findPeakPeriod = () => {
    if (patterns.length === 0) return null;
    return patterns.reduce((peak, current) =>
      current.avgCuts > peak.avgCuts ? current : peak
    );
  };

  const findBestEfficiency = () => {
    if (patterns.length === 0) return null;
    return patterns.reduce((best, current) =>
      current.avgEfficiency > best.avgEfficiency ? current : best
    );
  };

  const findWorstWaste = () => {
    if (patterns.length === 0) return null;
    return patterns.reduce((worst, current) =>
      current.avgWaste > worst.avgWaste ? current : worst
    );
  };

  const peakPeriod = findPeakPeriod();
  const bestEfficiencyPeriod = findBestEfficiency();
  const worstWastePeriod = findWorstWaste();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seasonal Patterns</CardTitle>
        <CardDescription>
          {type} activity patterns and performance variations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough data for meaningful pattern analysis
          </p>
        ) : (
          <div className="space-y-6">
            {/* Key Findings */}
            <div className="space-y-3">
              {peakPeriod && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Peak Activity</p>
                    <p className="text-xs text-muted-foreground">
                      Highest cutting volume
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">{peakPeriod.period}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {peakPeriod.avgCuts.toFixed(1)} cuts avg
                    </p>
                  </div>
                </div>
              )}

              {bestEfficiencyPeriod && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Best Efficiency</p>
                    <p className="text-xs text-muted-foreground">
                      Highest material utilization
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="default">{bestEfficiencyPeriod.period}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {bestEfficiencyPeriod.avgEfficiency.toFixed(1)}% efficiency
                    </p>
                  </div>
                </div>
              )}

              {worstWastePeriod && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Attention Needed</p>
                    <p className="text-xs text-muted-foreground">
                      Highest waste period
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="destructive">{worstWastePeriod.period}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {worstWastePeriod.avgWaste.toFixed(1)}% waste
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* All Periods */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">{type} Performance</h4>
              <div className="space-y-2">
                {patterns
                  .sort((a, b) => b.avgCuts - a.avgCuts)
                  .map((pattern, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{pattern.period}</span>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{pattern.avgCuts.toFixed(1)} cuts</span>
                        <span>{pattern.avgEfficiency.toFixed(1)}% eff</span>
                        <span>{pattern.avgWaste.toFixed(1)}% waste</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Recommendations */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Recommendations</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                {peakPeriod && bestEfficiencyPeriod && peakPeriod.period === bestEfficiencyPeriod.period && (
                  <p>✓ {peakPeriod.period} shows both high activity and efficiency - optimal timing</p>
                )}
                {worstWastePeriod && (
                  <p>⚠ Consider additional training or process review for {worstWastePeriod.period} operations</p>
                )}
                {patterns.some(p => p.count < 3) && (
                  <p>📊 Some periods have limited data - patterns will improve with more historical data</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}