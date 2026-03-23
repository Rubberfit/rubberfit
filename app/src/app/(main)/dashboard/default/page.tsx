"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Package, Scissors, AlertTriangle, DollarSign, Plus, Eye, RotateCcw, Clock } from "lucide-react";
import { type Roll, type Cut, type MaterialType } from "@/lib/supabase";
import { rollService } from "@/services/rollService";
import { cutService } from "@/services/cutService";
import { materialTypeService } from "@/services/materialTypeService";
import { MaterialSummaryChart } from "../_components/material-summary-chart";
import { WasteTrendChart } from "../_components/waste-trend-chart";
import { useRole } from "@/services/useRole";

interface DashboardData {
  totalActiveRolls: number;
  inventoryValue: number;
  cutsThisWeek: number;
  wastePercentage: number;
  lowStockMaterials: Array<{ materialType: string; currentStock: number; threshold: number }>;
  recentActivity: Array<{ type: "cut" | "roll_added" | "roll_depleted"; description: string; timestamp: string }>;
  materialSummary: Array<{ name: string; sqft: number; rolls: number }>;
  wasteTrend: Array<{ period: string; wastePercentage: number }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({
    totalActiveRolls: 0,
    inventoryValue: 0,
    cutsThisWeek: 0,
    wastePercentage: 0,
    lowStockMaterials: [],
    recentActivity: [],
    materialSummary: [],
    wasteTrend: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch all data via service layer (parallel where possible)
      const [
        activeRolls,
        cutsThisWeekData,
        monthWasteData,
        materialTypes,
        recentCutsData,
        recentRollsData,
        wasteTrendData,
      ] = await Promise.all([
        rollService.getActiveRolls().catch((err) => {
          console.error("Error fetching rolls:", err);
          return [] as Roll[];
        }),
        cutService.getCutsThisWeek().catch((err) => {
          console.error("Error fetching cuts:", err);
          return [] as Cut[];
        }),
        cutService.getMonthlyWastePercentages().catch((err) => {
          console.error("Error fetching month cuts:", err);
          return [] as { waste_percentage: number }[];
        }),
        materialTypeService.getAll().catch((err) => {
          console.error("Error fetching material types:", err);
          return [] as MaterialType[];
        }),
        cutService.getRecentCutsWithRolls(5).catch((err) => {
          console.error("Error fetching recent cuts:", err);
          return [] as any[];
        }),
        rollService.getRecentRolls(5).catch((err) => {
          console.error("Error fetching recent rolls:", err);
          return [] as Roll[];
        }),
        cutService.getWasteTrendByWeek(8).catch((err) => {
          console.error("Error fetching waste trend:", err);
          return [] as { period: string; wastePercentage: number }[];
        }),
      ]);

      // Calculate metrics
      const totalActiveRolls = activeRolls.length;

      // Calculate inventory value: Sum(remaining_length x width x cost_per_sqft / 144)
      const inventoryValue = activeRolls.reduce((total, roll) => {
        const sqft = (roll.remaining_length * roll.width) / 144;
        const value = sqft * (roll.cost_per_sqft || 0);
        return total + value;
      }, 0);

      const cutsThisWeek = cutsThisWeekData.length;

      // Calculate average waste percentage from this month
      const wastePercentage =
        monthWasteData.length > 0
          ? monthWasteData.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / monthWasteData.length
          : 0;

      // Calculate low stock materials
      const lowStockMaterials: Array<{ materialType: string; currentStock: number; threshold: number }> = [];

      if (materialTypes.length > 0 && activeRolls.length > 0) {
        for (const materialType of materialTypes) {
          const materialRolls = activeRolls.filter((roll) => roll.material_type === materialType.name);
          const currentStock = materialRolls.reduce((total, roll) => {
            return total + (roll.remaining_length * roll.width) / 144;
          }, 0);

          if (currentStock < (materialType.min_stock_alert || 0)) {
            lowStockMaterials.push({
              materialType: materialType.name,
              currentStock,
              threshold: materialType.min_stock_alert || 0,
            });
          }
        }
      }

      // Build recent activity feed
      const activity: Array<{ type: "cut" | "roll_added" | "roll_depleted"; description: string; timestamp: string }> =
        [];

      // Add recent cuts
      if (recentCutsData) {
        recentCutsData.forEach((cut: any) => {
          const rollInfo = cut.roll as any;
          activity.push({
            type: "cut",
            description: `Cut ${cut.cut_width}" × ${cut.cut_length}" × ${cut.quantity} from ${rollInfo?.material_type || "Unknown"} roll`,
            timestamp: cut.created_at,
          });
        });
      }

      // Add recent rolls
      if (recentRollsData) {
        recentRollsData.forEach((roll) => {
          activity.push({
            type: roll.status === "depleted" ? "roll_depleted" : "roll_added",
            description: `${roll.status === "depleted" ? "Depleted" : "Added"} ${roll.material_type} roll ${roll.width}" × ${roll.length}"`,
            timestamp: roll.created_at,
          });
        });
      }

      // Sort activity by timestamp and take top 10
      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const recentActivity = activity.slice(0, 10);

      // Calculate material summary for chart
      const materialSummary: Array<{ name: string; sqft: number; rolls: number }> = [];

      if (materialTypes.length > 0 && activeRolls.length > 0) {
        for (const materialType of materialTypes) {
          const materialRolls = activeRolls.filter((roll) => roll.material_type === materialType.name);
          if (materialRolls.length > 0) {
            const totalSqft = materialRolls.reduce((total, roll) => {
              return total + (roll.remaining_length * roll.width) / 144;
            }, 0);

            materialSummary.push({
              name: materialType.name,
              sqft: totalSqft,
              rolls: materialRolls.length,
            });
          }
        }
      }

      // Sort by sqft descending
      materialSummary.sort((a, b) => b.sqft - a.sqft);

      // Filter waste trend to only include weeks with data (match original behavior)
      const wasteTrend = wasteTrendData.filter((w) => w.wastePercentage > 0);

      setData({
        totalActiveRolls,
        inventoryValue,
        cutsThisWeek,
        wastePercentage,
        lowStockMaterials,
        recentActivity,
        materialSummary,
        wasteTrend,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const { can } = useRole();
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">RubberFit Pro Operations Overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Rolls</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "-" : data.totalActiveRolls}</div>
            <p className="text-xs text-muted-foreground">In inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuts This Week</CardTitle>
            <Scissors className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "-" : data.cutsThisWeek}</div>
            <p className="text-xs text-muted-foreground">Completed cuts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waste %</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "-" : `${data.wastePercentage.toFixed(1)}%`}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "-" : formatCurrency(data.inventoryValue)}</div>
            <p className="text-xs text-muted-foreground">Total value</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Low Stock Alerts */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Low Stock Alerts</h2>
          {loading ? (
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Loading...</div>
              </CardContent>
            </Card>
          ) : data.lowStockMaterials.length > 0 ? (
            <div className="space-y-2">
              {data.lowStockMaterials.map((material, index) => (
                <Alert key={index} variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{material.materialType}</AlertTitle>
                  <AlertDescription>
                    Stock: {material.currentStock.toFixed(1)} sqft (threshold: {material.threshold} sqft)
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          ) : (
            <Alert>
              <Package className="h-4 w-4" />
              <AlertTitle>All Good</AlertTitle>
              <AlertDescription>All materials are above minimum stock levels.</AlertDescription>
            </Alert>
          )}

          {/* Quick Action Buttons */}
          <div className="space-y-2">
            <h3 className="text-md font-medium">Quick Actions</h3>
            <div className="flex flex-col gap-2">
              {/* New Cut */}
              {can("createCut") && (
                <Button
                  className="justify-start"
                  variant="outline"
                  onClick={() => router.push("/dashboard/cut-planner")}
                >
                  <Scissors className="h-4 w-4" />
                  New Cut
                </Button>
              )}

              {/* Add Roll — admin and manager only */}
              {can("manageRolls") && (
                <Button className="justify-start" variant="outline" onClick={() => router.push("/dashboard/inventory")}>
                  <Plus className="h-4 w-4" />
                  Add Roll
                </Button>
              )}

              {/* View Inventory — everyone */}
              {can("viewInventory") && (
                <Button className="justify-start" variant="outline" onClick={() => router.push("/dashboard/inventory")}>
                  <Eye className="h-4 w-4" />
                  View Inventory
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          {loading ? (
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Loading...</div>
              </CardContent>
            </Card>
          ) : data.recentActivity.length > 0 ? (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {data.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {activity.type === "cut" && <Scissors className="h-4 w-4 text-blue-500" />}
                        {activity.type === "roll_added" && <Plus className="h-4 w-4 text-green-500" />}
                        {activity.type === "roll_depleted" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(activity.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">No recent activity</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <MaterialSummaryChart data={data.materialSummary} />
        <WasteTrendChart data={data.wasteTrend} />
      </div>
    </div>
  );
}
