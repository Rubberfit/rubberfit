"use client";

import { useEffect, useState, useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Search,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

import {
  supabase,
  type MaterialType,
  type MaterialSupplierWithDetails,
  type PriceHistory,
  type Supplier
} from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { priceHistoryService } from "@/services/priceHistoryService";
import { supplierService } from "@/services/supplierService";
import { exportService } from "@/services/exportService";
import { toast } from "sonner";

interface PriceComparisonData {
  materialTypeId: string;
  materialName: string;
  suppliers: {
    supplierId: string;
    supplierName: string;
    currentPrice: number;
    leadTime: number;
    minOrder: number;
    isPreferred: boolean;
    lastChange?: {
      date: string;
      percentage: number;
    };
    priceHistory: Array<{
      date: string;
      price: number;
    }>;
  }[];
  bestPrice: number;
  avgPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
}

interface PriceAlert {
  id: string;
  materialName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
  changePercentage: number;
  changeDate: string;
  type: 'increase' | 'decrease';
}

export default function PricingPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materialSuppliers, setMaterialSuppliers] = useState<MaterialSupplierWithDetails[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch material types
      const { data: materialsData, error: materialsError } = await supabase
        .from("material_types")
        .select("*")
        .order("name");

      if (materialsError) throw materialsError;
      setMaterialTypes(materialsData || []);

      // Fetch suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("name");

      if (suppliersError) throw suppliersError;
      setSuppliers(suppliersData || []);

      // Fetch material supplier relationships
      const { data: materialSuppliersData, error: materialSuppliersError } = await supabase
        .from("material_suppliers")
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .eq("active", true);

      if (materialSuppliersError) throw materialSuppliersError;
      setMaterialSuppliers(materialSuppliersData || []);

      // Fetch price history
      const startDate = subDays(new Date(), parseInt(dateRange));
      const { data: priceHistoryData, error: priceHistoryError } = await supabase
        .from("price_history")
        .select(`
          *,
          material_supplier:material_suppliers(
            *,
            material_type:material_types(*),
            supplier:suppliers(*)
          )
        `)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false });

      if (priceHistoryError) throw priceHistoryError;
      setPriceHistory(priceHistoryData || []);

      // Generate price alerts
      generatePriceAlerts(priceHistoryData || []);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  // Generate price alerts from recent history
  const generatePriceAlerts = (history: any[]) => {
    const recentChanges = history
      .filter(h => h.price_change_percentage && Math.abs(h.price_change_percentage) > 5)
      .slice(0, 10)
      .map(h => ({
        id: h.id,
        materialName: h.material_supplier?.material_type?.name || "Unknown",
        supplierName: h.material_supplier?.supplier?.name || "Unknown",
        oldPrice: h.old_cost_per_sqft || 0,
        newPrice: h.new_cost_per_sqft,
        changePercentage: h.price_change_percentage,
        changeDate: h.created_at,
        type: h.price_change_percentage > 0 ? 'increase' as const : 'decrease' as const
      }));

    setPriceAlerts(recentChanges);
  };

  const getPriceCategory = (price: number) => {
    if (price <= 3) return { label: "Budget", color: "default" as const };
    if (price <= 6) return { label: "Standard", color: "secondary" as const };
    return { label: "Premium", color: "outline" as const };
  };

  // Prepare price comparison data
  const priceComparisonData = useMemo(() => {
    const comparison: PriceComparisonData[] = [];

    materialTypes.forEach(material => {
      const supplierPrices = materialSuppliers
        .filter(ms => ms.material_type_id === material.id)
        .map(ms => ({
          supplierId: ms.supplier_id,
          supplierName: ms.supplier?.name || "Unknown",
          currentPrice: ms.cost_per_sqft,
          leadTime: ms.lead_time_days || 0,
          minOrder: ms.minimum_order_sqft || 0,
          isPreferred: ms.preferred_supplier,
          lastChange: undefined,
          priceHistory: []
        }));

      if (supplierPrices.length > 0) {
        const prices = supplierPrices.map(s => s.currentPrice);
        comparison.push({
          materialTypeId: material.id,
          materialName: material.name,
          suppliers: supplierPrices,
          bestPrice: Math.min(...prices),
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          priceRange: {
            min: Math.min(...prices),
            max: Math.max(...prices)
          }
        });
      }
    });

    return comparison;
  }, [materialTypes, materialSuppliers]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (selectedMaterial === "all" || !selectedMaterial) return [];

    const material = priceComparisonData.find(m => m.materialTypeId === selectedMaterial);
    if (!material) return [];

    // Group price history by date and supplier
    const dataMap = new Map<string, any>();

    priceHistory
      .filter((h: any) => h.material_supplier?.material_type_id === selectedMaterial)
      .forEach((h: any) => {
        const rawDate = String(h.created_at).replace(" ", "T");
        const date = format(new Date(rawDate), "MMM dd");
        const supplierName = h.material_supplier?.supplier?.name || "Unknown";

        if (!dataMap.has(date)) {
          dataMap.set(date, { date, _sortTs: new Date(rawDate).getTime() });
        }

        const entry = dataMap.get(date);
        entry[supplierName] = h.new_cost_per_sqft;
      });

    return Array.from(dataMap.values()).sort((a, b) =>
      (a._sortTs || 0) - (b._sortTs || 0)
    );
  }, [selectedMaterial, priceHistory, priceComparisonData]);

  // Filter price history based on selected material
  const filteredPriceHistory = useMemo(() => {
    if (selectedMaterial === "all") return priceHistory;
    return priceHistory.filter(
      (h: any) => h.material_supplier?.material_type_id === selectedMaterial
    );
  }, [priceHistory, selectedMaterial]);

  // Filter data based on search
  const filteredComparisonData = useMemo(() => {
    return priceComparisonData.filter(item => {
      if (searchQuery && !item.materialName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (selectedMaterial !== "all" && item.materialTypeId !== selectedMaterial) {
        return false;
      }
      return true;
    });
  }, [priceComparisonData, searchQuery, selectedMaterial]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Pricing Dashboard</h1>
        <p className="text-muted-foreground">
          Compare prices across suppliers and track historical trends
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suppliers.length}</div>
            <p className="text-xs text-muted-foreground">
              {materialSuppliers.filter(ms => ms.preferred_supplier).length} preferred
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${materialSuppliers.length > 0
                ? (materialSuppliers.reduce((sum, ms) => sum + ms.cost_per_sqft, 0) / materialSuppliers.length).toFixed(2)
                : "0.00"
              }
            </div>
            <p className="text-xs text-muted-foreground">Per square foot</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{priceAlerts.length}</div>
            <p className="text-xs text-muted-foreground">
              {priceAlerts.filter(a => a.type === 'increase').length} increases
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Savings</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {priceComparisonData.length > 0
                ? Math.max(0, ...priceComparisonData.map(d =>
                    d.priceRange.max > 0
                      ? ((d.priceRange.max - d.priceRange.min) / d.priceRange.max * 100)
                      : 0
                  )).toFixed(0)
                : "0"}%
            </div>
            <p className="text-xs text-muted-foreground">Max potential savings</p>
          </CardContent>
        </Card>
      </div>

      {/* Price Alerts */}
      {priceAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Recent Price Changes
            </CardTitle>
            <CardDescription>
              Significant price changes in the last {dateRange} days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priceAlerts.slice(0, 3).map(alert => (
                <Alert key={alert.id} className={alert.type === 'increase' ? "border-orange-200" : "border-green-200"}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alert.type === 'increase' ? (
                        <ArrowUpRight className="h-4 w-4 text-orange-600" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-green-600" />
                      )}
                      <div>
                        <AlertTitle className="text-sm font-medium">
                          {alert.materialName} - {alert.supplierName}
                        </AlertTitle>
                        <AlertDescription className="text-xs">
                          ${alert.oldPrice.toFixed(2)} → ${alert.newPrice.toFixed(2)}
                          ({alert.type === 'increase' ? '+' : ''}{alert.changePercentage.toFixed(1)}%)
                        </AlertDescription>
                      </div>
                    </div>
                    <Badge variant={alert.type === 'increase' ? 'destructive' : 'default'}>
                      {alert.type === 'increase' ? 'Price Up' : 'Price Down'}
                    </Badge>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="comparison" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comparison">Price Comparison</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>

        {/* Price Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search materials..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10"
                  />
                </div>
                <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Materials" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Materials</SelectItem>
                    {materialTypes.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Material Price Comparison</CardTitle>
                  <CardDescription>
                    Compare prices from different suppliers
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (filteredComparisonData.length === 0) {
                      toast.error("No price data to export");
                      return;
                    }
                    const rows = filteredComparisonData.flatMap(item =>
                      item.suppliers.map(s => [
                        item.materialName,
                        s.supplierName,
                        s.currentPrice.toFixed(2),
                        item.bestPrice.toFixed(2),
                        item.avgPrice.toFixed(2),
                        s.leadTime,
                        s.minOrder,
                        s.isPreferred ? "Yes" : "No",
                      ])
                    );
                    exportService.exportToCSV({
                      headers: ["Material", "Supplier", "Price ($/sqft)", "Best Price", "Avg Price", "Lead Time (days)", "Min Order (sqft)", "Preferred"],
                      rows,
                      filename: "price_comparison",
                    });
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Best Price</TableHead>
                      <TableHead>Avg Price</TableHead>
                      <TableHead>Price Range</TableHead>
                      <TableHead>Best Supplier</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Min Order</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          Loading price comparison data...
                        </TableCell>
                      </TableRow>
                    ) : filteredComparisonData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          No price comparison data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredComparisonData.map((item) => {
                        const bestSupplier = item.suppliers.find(s => s.currentPrice === item.bestPrice);
                        const savings = ((item.priceRange.max - item.priceRange.min) / item.priceRange.max * 100);

                        return (
                          <TableRow key={item.materialTypeId}>
                            <TableCell className="font-medium">
                              {item.materialName}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-green-600">
                                  ${item.bestPrice.toFixed(2)}
                                </span>
                                {savings > 10 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Save {savings.toFixed(0)}%
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono">
                              ${item.avgPrice.toFixed(2)}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              ${item.priceRange.min.toFixed(2)} - ${item.priceRange.max.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {bestSupplier?.supplierName}
                                {bestSupplier?.isPreferred && (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {bestSupplier?.leadTime || 0} days
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {bestSupplier?.minOrder || 0} sq ft
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost">
                                View Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price History Tab */}
        <TabsContent value="history" className="space-y-4">
          {/* Date Range Selector */}
          <Card>
            <CardHeader>
              <CardTitle>Price History Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select Material" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Materials</SelectItem>
                    {materialTypes.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="180">Last 6 months</SelectItem>
                    <SelectItem value="365">Last year</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const filtered = filteredPriceHistory;
                    if (filtered.length === 0) {
                      toast.error("No price history data to export");
                      return;
                    }
                    const rows = filtered.map((h: any) => {
                      let dateStr = "";
                      try {
                        const raw = h.effective_date || h.created_at;
                        dateStr = raw ? format(new Date(String(raw).replace(" ", "T")), "yyyy-MM-dd") : "";
                      } catch { dateStr = h.effective_date || h.created_at || ""; }
                      return [
                        dateStr,
                        h.material_supplier?.material_type?.name || "Unknown",
                        h.material_supplier?.supplier?.name || "Unknown",
                        h.old_cost_per_sqft != null ? Number(h.old_cost_per_sqft).toFixed(2) : "N/A",
                        h.new_cost_per_sqft != null ? Number(h.new_cost_per_sqft).toFixed(2) : "N/A",
                        h.price_change_percentage != null ? Number(h.price_change_percentage).toFixed(1) : "N/A",
                        h.change_reason || "",
                      ];
                    });
                    exportService.exportToCSV({
                      headers: ["Date", "Material", "Supplier", "Old Price ($/sqft)", "New Price ($/sqft)", "Change %", "Reason"],
                      rows,
                      filename: "price_history",
                    });
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export History
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Price History Chart */}
          {selectedMaterial !== "all" && chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Price Trends</CardTitle>
                <CardDescription>
                  Historical price data for selected material across suppliers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => `$${Number(value).toFixed(2)}/sq ft`}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    {suppliers.map((supplier, index) => (
                      <Line
                        key={supplier.id}
                        type="monotone"
                        dataKey={supplier.name}
                        stroke={`hsl(${index * 360 / suppliers.length}, 70%, 50%)`}
                        strokeWidth={2}
                        dot={{ fill: `hsl(${index * 360 / suppliers.length}, 70%, 50%)`, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {selectedMaterial === "all" && filteredPriceHistory.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Select a specific material to view price history
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Price History Records Table */}
          <Card>
            <CardHeader>
              <CardTitle>Price Change Records</CardTitle>
              <CardDescription>
                {selectedMaterial === "all"
                  ? `All price changes in the last ${dateRange} days`
                  : `Price changes for selected material in the last ${dateRange} days`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Old Price</TableHead>
                      <TableHead>New Price</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          Loading price history...
                        </TableCell>
                      </TableRow>
                    ) : filteredPriceHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          No price history records for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPriceHistory.map((h: any) => {
                        let dateStr = "";
                        try {
                          const raw = h.effective_date || h.created_at;
                          dateStr = raw ? format(new Date(String(raw).replace(" ", "T")), "MMM dd, yyyy") : "";
                        } catch { dateStr = h.effective_date || ""; }

                        const pct = h.price_change_percentage;
                        const isIncrease = pct != null && pct > 0;
                        const isDecrease = pct != null && pct < 0;

                        return (
                          <TableRow key={h.id}>
                            <TableCell className="whitespace-nowrap">{dateStr}</TableCell>
                            <TableCell className="font-medium">
                              {h.material_supplier?.material_type?.name || "Unknown"}
                            </TableCell>
                            <TableCell>
                              {h.material_supplier?.supplier?.name || "Unknown"}
                            </TableCell>
                            <TableCell className="font-mono">
                              {h.old_cost_per_sqft != null
                                ? `$${Number(h.old_cost_per_sqft).toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="font-mono font-semibold">
                              {h.new_cost_per_sqft != null
                                ? `$${Number(h.new_cost_per_sqft).toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {pct != null ? (
                                <div className="flex items-center gap-1">
                                  {isIncrease ? (
                                    <ArrowUpRight className="h-4 w-4 text-orange-600" />
                                  ) : isDecrease ? (
                                    <ArrowDownRight className="h-4 w-4 text-green-600" />
                                  ) : null}
                                  <span className={
                                    isIncrease ? "text-orange-600" :
                                    isDecrease ? "text-green-600" : ""
                                  }>
                                    {isIncrease ? "+" : ""}{Number(pct).toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <Badge variant="secondary">Initial</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                              {h.change_reason || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}