"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  ShoppingCart,
  Edit2,
  Save,
  X,
  Plus,
  Calculator,
  Truck,
  AlertCircle,
  Activity,
  BarChart3
} from "lucide-react";

import {
  supabase,
  type MaterialType,
  type ReorderRule,
  type ReorderRuleWithDetails,
  type Supplier
} from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reorderService } from "@/services/reorderService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { supplierService } from "@/services/supplierService";
import { ReorderRuleModal } from "./_components/reorder-rule-modal";
import { toast } from "sonner";

interface EditableRule {
  id: string;
  reorderPoint: number;
  reorderQuantity: number;
  maxStockLevel: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
  autoReorder: boolean;
}

interface ReorderSuggestion {
  materialTypeId: string;
  materialName: string;
  currentStock: number;
  reorderPoint: number;
  suggestedQuantity: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  daysUntilStockout: number;
  supplierId?: string;
  supplierName?: string;
  estimatedCost: number;
  pendingQuantity?: number;
}

export default function ReorderRulesPage() {
  const router = useRouter();
  const [reorderRules, setReorderRules] = useState<ReorderRuleWithDetails[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRules, setEditingRules] = useState<{ [key: string]: EditableRule }>({});
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("rules");
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ReorderRuleWithDetails | null>(null);
  const [creatingIndividualPOs, setCreatingIndividualPOs] = useState(false);
  const [creatingBulkPO, setCreatingBulkPO] = useState(false);
  const [creatingPOFor, setCreatingPOFor] = useState<string | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch reorder rules with details
      const rulesResponse = await reorderService.getAllReorderRules();
      let rulesWithStock: any[] = [];

      if (rulesResponse) {
        // Calculate real current stock for each rule from active rolls
        rulesWithStock = await Promise.all(
          rulesResponse.map(async (rule) => {
            const currentStock = await reorderService.calculateCurrentStock(rule.material_type_id);
            return {
              ...rule,
              current_stock: currentStock,
              stock_status: 'ok' as const
            };
          })
        );
        setReorderRules(rulesWithStock as ReorderRuleWithDetails[]);
      }

      // Fetch material types
      const { data: materials, error: materialsError } = await supabase
        .from("material_types")
        .select("*")
        .order("name");

      if (materialsError) throw materialsError;
      setMaterialTypes(materials || []);

      // Fetch suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("name");

      if (suppliersError) throw suppliersError;
      setSuppliers(suppliersData || []);

      // Fetch pending purchase orders to consider in reorder suggestions
      const { data: pendingPOs, error: poError } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          items:purchase_order_items(
            material_type_id,
            quantity_sqft
          )
        `)
        .in("status", ["draft", "pending", "approved", "ordered"])
        .order("created_at", { ascending: false });

      if (poError) console.error("Error fetching pending POs:", poError);

      // Generate suggestions
      if (rulesWithStock.length > 0) {
        await generateReorderSuggestions(rulesWithStock as ReorderRuleWithDetails[], materials || [], pendingPOs || []);
      }

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Generate reorder suggestions
  const generateReorderSuggestions = async (rules: ReorderRuleWithDetails[], materials: MaterialType[], pendingPOs: any[] = []) => {
    const newSuggestions: ReorderSuggestion[] = [];

    // Calculate pending quantities per material type
    const pendingQuantities: Record<string, number> = {};
    pendingPOs.forEach(po => {
      if (po.items) {
        po.items.forEach((item: any) => {
          if (item.material_type_id) {
            pendingQuantities[item.material_type_id] = (pendingQuantities[item.material_type_id] || 0) + item.quantity_sqft;
          }
        });
      }
    });

    for (const rule of rules) {
      if (rule.current_stock == null || !rule.material_type) continue;

      const currentStock = rule.current_stock;
      const pendingQty = pendingQuantities[rule.material_type_id] || 0;
      const effectiveStock = currentStock + pendingQty; // Consider pending orders
      const reorderPoint = rule.reorder_point;

      // Only suggest reorder if effective stock (including pending orders) is still below reorder point
      if (effectiveStock <= reorderPoint) {
        // Calculate urgency based on current physical stock
        const dailyUsage = 10; // Mock daily usage
        const daysUntilStockout = Math.max(0, Math.floor(currentStock / dailyUsage));

        let urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
        if (daysUntilStockout <= 2) urgencyLevel = 'critical';
        else if (daysUntilStockout <= 5) urgencyLevel = 'high';
        else if (daysUntilStockout <= 10) urgencyLevel = 'medium';
        else urgencyLevel = 'low';

        // Calculate EOQ (simplified)
        const annualDemand = dailyUsage * 365;
        const orderingCost = 50; // Mock ordering cost
        const holdingCost = (rule.material_type.default_cost || 5) * 0.2; // 20% of item cost
        const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);

        // Adjust suggested quantity based on pending orders
        const baseQuantity = Math.max(rule.reorder_quantity, Math.round(eoq));
        const suggestedQuantity = Math.max(0, baseQuantity - pendingQty);

        // Resolve supplier: rule's supplier_id first, then fall back to preferred supplier from material_suppliers
        let supplierId = rule.supplier_id;
        let supplierName = rule.supplier?.name;

        if (!supplierId) {
          try {
            const preferred = await supplierService.getPreferredSupplierForMaterial(rule.material_type_id);
            if (preferred) {
              supplierId = preferred.supplier_id;
              supplierName = preferred.supplier?.name;
            }
          } catch {
            // Ignore — supplier just won't be set
          }
        }

        if (suggestedQuantity > 0) {
          newSuggestions.push({
            materialTypeId: rule.material_type_id,
            materialName: rule.material_type.name,
            currentStock,
            reorderPoint,
            suggestedQuantity,
            urgencyLevel,
            daysUntilStockout,
            supplierId,
            supplierName,
            estimatedCost: suggestedQuantity * (rule.material_type.default_cost || 5),
            pendingQuantity: pendingQty
          });
        }
      }
    }

    setSuggestions(newSuggestions.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout));
  };

  // Start editing a rule
  const startEditingRule = (rule: ReorderRuleWithDetails) => {
    setEditingRules({
      ...editingRules,
      [rule.id]: {
        id: rule.id,
        reorderPoint: rule.reorder_point,
        reorderQuantity: rule.reorder_quantity,
        maxStockLevel: rule.max_stock_level ?? null,
        leadTimeDays: rule.lead_time_days,
        safetyStockDays: rule.safety_stock_days,
        autoReorder: rule.auto_reorder
      }
    });
  };

  // Cancel editing
  const cancelEditing = (ruleId: string) => {
    const newEditing = { ...editingRules };
    delete newEditing[ruleId];
    setEditingRules(newEditing);
  };

  // Save edited rule
  const saveRule = async (ruleId: string) => {
    const editedRule = editingRules[ruleId];
    if (!editedRule) return;

    // Client-side validation matching DB constraints
    const maxStock = editedRule.maxStockLevel;
    if (maxStock !== null && maxStock !== undefined) {
      if (maxStock < editedRule.reorderQuantity) {
        toast.error("Max stock level must be greater than or equal to reorder quantity");
        return;
      }
      if (maxStock <= editedRule.reorderPoint) {
        toast.error("Max stock level must be greater than reorder point");
        return;
      }
    }

    try {
      const response = await reorderService.updateReorderRule(ruleId, {
        reorder_point: editedRule.reorderPoint,
        reorder_quantity: editedRule.reorderQuantity,
        max_stock_level: maxStock || undefined,
        lead_time_days: editedRule.leadTimeDays,
        safety_stock_days: editedRule.safetyStockDays,
        auto_reorder: editedRule.autoReorder
      } as any);

      if (!response) throw new Error('Failed to update reorder rule');

      // Update local state with snake_case keys matching the DB schema
      setReorderRules(rules =>
        rules.map(r => r.id === ruleId ? {
          ...r,
          reorder_point: editedRule.reorderPoint,
          reorder_quantity: editedRule.reorderQuantity,
          max_stock_level: editedRule.maxStockLevel ?? undefined,
          lead_time_days: editedRule.leadTimeDays,
          safety_stock_days: editedRule.safetyStockDays,
          auto_reorder: editedRule.autoReorder,
        } : r)
      );

      // Clear editing state
      cancelEditing(ruleId);
    } catch (error: any) {
      console.error("Error saving rule:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      toast.error("Failed to save rule", {
        description: error?.message || "An unexpected error occurred",
      });
    }
  };

  // Toggle rule active state
  const toggleRuleActive = async (ruleId: string, active: boolean) => {
    try {
      const response = await reorderService.updateReorderRule(ruleId, { active });
      if (!response) throw new Error('Failed to update reorder rule');

      setReorderRules(rules =>
        rules.map(r => r.id === ruleId ? { ...r, active } : r)
      );
    } catch (error: any) {
      console.error("Error toggling rule:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      toast.error("Failed to toggle rule", {
        description: error?.message || "An unexpected error occurred",
      });
    }
  };

  // Get urgency badge
  const getUrgencyBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 hover:bg-orange-600">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Get stock status
  const getStockStatus = (current: number, reorderPoint: number, max: number) => {
    const percentage = (current / max) * 100;
    if (current <= reorderPoint) return { status: 'low', color: 'bg-red-500' };
    if (percentage < 50) return { status: 'medium', color: 'bg-yellow-500' };
    return { status: 'ok', color: 'bg-green-500' };
  };

  // Filter rules
  const filteredRules = useMemo(() => {
    if (selectedMaterial === "all") return reorderRules;
    return reorderRules.filter(r => r.material_type_id === selectedMaterial);
  }, [reorderRules, selectedMaterial]);

  // Build supplier address string from supplier details
  const buildSupplierAddress = (s: any): string => {
    const parts = [s.address, s.city, s.state, s.zip_code, s.country].filter(Boolean);
    return parts.join(", ");
  };

  // Fetch supplier details and build PO fields
  const buildPOSupplierFields = async (supplierId: string) => {
    try {
      const supplier = await supplierService.getSupplierById(supplierId);
      if (!supplier) return {};

      const address = buildSupplierAddress(supplier);
      return {
        order_date: new Date().toISOString(),
        payment_terms: supplier.payment_terms || undefined,
        shipping_address: address || undefined,
        billing_address: address || undefined,
      };
    } catch {
      return { order_date: new Date().toISOString() };
    }
  };

  // Create PO for a single material
  const handleCreatePO = async (suggestion: ReorderSuggestion) => {
    try {
      setCreatingPOFor(suggestion.materialTypeId);

      if (!suggestion.supplierId) {
        toast.error("No supplier configured", {
          description: "Please configure a supplier for this material in the reorder rules."
        });
        return;
      }

      // Fetch supplier details for PO fields
      const supplierFields = await buildPOSupplierFields(suggestion.supplierId);

      // Create the purchase order
      const po = await purchaseOrderService.createPurchaseOrder({
        supplier_id: suggestion.supplierId,
        status: 'draft',
        ...supplierFields,
        requested_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: `Reorder for ${suggestion.materialName} - ${suggestion.urgencyLevel} priority`,
        subtotal: suggestion.estimatedCost,
        tax_amount: suggestion.estimatedCost * 0.08,
        shipping_cost: 0,
        total_amount: suggestion.estimatedCost * 1.08,
        auto_generated: false
      });

      if (!po) throw new Error('Failed to create purchase order');

      // Add the item to the PO
      await purchaseOrderService.addItemToPurchaseOrder({
        purchase_order_id: po.id,
        material_type_id: suggestion.materialTypeId,
        description: suggestion.materialName,
        quantity_sqft: suggestion.suggestedQuantity,
        unit_cost: suggestion.estimatedCost / suggestion.suggestedQuantity,
        width: 60,
        thickness: 0.125
      });

      // Mark reorder rule as last ordered
      const rule = reorderRules.find(r => r.material_type_id === suggestion.materialTypeId);
      if (rule) {
        await reorderService.updateReorderRule(rule.id, {
          last_triggered_at: new Date().toISOString()
        });
      }

      toast.success("Purchase order created", {
        description: `PO ${po.po_number} created for ${suggestion.materialName}. Redirecting...`
      });

      // Refresh data
      await fetchData();

      // Navigate to purchase orders page with the new PO highlighted and view dialog open
      setTimeout(() => {
        router.push(`/dashboard/inventory/purchase-orders?view=${po.id}`);
      }, 1500);
    } catch (error) {
      console.error("Error creating PO:", error);
      toast.error("Failed to create purchase order", {
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      });
    } finally {
      setCreatingPOFor(null);
    }
  };

  // Create individual POs for selected materials
  const handleCreateIndividualPOs = async () => {
    try {
      setCreatingIndividualPOs(true);

      const selectedItems = suggestions.filter(s => selectedSuggestions.has(s.materialTypeId));

      if (selectedItems.length === 0) {
        toast.error("No items selected", {
          description: "Please select at least one material to create purchase orders."
        });
        return;
      }

      let successCount = 0;
      let failCount = 0;
      let firstPOId: string | null = null;

      for (const suggestion of selectedItems) {
        try {
          if (!suggestion.supplierId) {
            failCount++;
            toast.error(`No supplier for ${suggestion.materialName}`, {
              description: "Skipping this material - no supplier configured"
            });
            continue;
          }

          const supplierFields = await buildPOSupplierFields(suggestion.supplierId);

          const po = await purchaseOrderService.createPurchaseOrder({
            supplier_id: suggestion.supplierId,
            status: 'draft',
            ...supplierFields,
            requested_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            notes: `Reorder for ${suggestion.materialName} - ${suggestion.urgencyLevel} priority`,
            subtotal: suggestion.estimatedCost,
            tax_amount: suggestion.estimatedCost * 0.08,
            shipping_cost: 0,
            total_amount: suggestion.estimatedCost * 1.08,
            auto_generated: false
          });

          if (!po) throw new Error('Failed to create purchase order');

          await purchaseOrderService.addItemToPurchaseOrder({
            purchase_order_id: po.id,
            material_type_id: suggestion.materialTypeId,
            description: suggestion.materialName,
            quantity_sqft: suggestion.suggestedQuantity,
            unit_cost: suggestion.estimatedCost / suggestion.suggestedQuantity,
            width: 60,
            thickness: 0.125
          });

          // Mark reorder rule as last ordered
          const rule = reorderRules.find(r => r.material_type_id === suggestion.materialTypeId);
          if (rule) {
            await reorderService.updateReorderRule(rule.id, {
              last_triggered_at: new Date().toISOString()
            });
          }

          // Track the first PO created for navigation
          if (!firstPOId) {
            firstPOId = po.id;
          }

          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Error creating PO for ${suggestion.materialName}:`, error);
        }
      }

      if (successCount > 0) {
        toast.success(`Created ${successCount} purchase order${successCount > 1 ? 's' : ''}`, {
          description: failCount > 0 ? `${failCount} failed - check supplier configuration. Redirecting...` : "Redirecting to Purchase Orders..."
        });

        // Clear selection and refresh data
        setSelectedSuggestions(new Set());
        await fetchData();

        // Navigate to purchase orders page with the first PO highlighted
        setTimeout(() => {
          if (firstPOId) {
            router.push(`/dashboard/inventory/purchase-orders?view=${firstPOId}`);
          } else {
            router.push('/dashboard/inventory/purchase-orders');
          }
        }, 2000);
      } else {
        toast.error("Failed to create purchase orders", {
          description: "Check supplier configuration for selected materials"
        });
      }
    } catch (error) {
      console.error("Error creating individual POs:", error);
      toast.error("Failed to create purchase orders", {
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      });
    } finally {
      setCreatingIndividualPOs(false);
    }
  };

  // Create bulk PO for selected materials from same supplier
  const handleCreateBulkPO = async () => {
    try {
      setCreatingBulkPO(true);

      const selectedItems = suggestions.filter(s => selectedSuggestions.has(s.materialTypeId));

      if (selectedItems.length === 0) {
        toast.error("No items selected", {
          description: "Please select at least one material to create a bulk purchase order."
        });
        return;
      }

      // Group by supplier
      const supplierGroups = new Map<string, ReorderSuggestion[]>();
      const noSupplierItems: ReorderSuggestion[] = [];

      selectedItems.forEach(item => {
        if (item.supplierId) {
          const existing = supplierGroups.get(item.supplierId) || [];
          existing.push(item);
          supplierGroups.set(item.supplierId, existing);
        } else {
          noSupplierItems.push(item);
        }
      });

      if (noSupplierItems.length > 0) {
        toast.warning(`${noSupplierItems.length} item${noSupplierItems.length > 1 ? 's' : ''} skipped`, {
          description: "Some materials have no supplier configured"
        });
      }

      if (supplierGroups.size === 0) {
        toast.error("No valid suppliers", {
          description: "None of the selected materials have suppliers configured"
        });
        return;
      }

      let poCount = 0;
      let firstPOId: string | null = null;

      // Create one PO per supplier
      for (const [supplierId, items] of supplierGroups) {
        try {
          const totalCost = items.reduce((sum, item) => sum + item.estimatedCost, 0);
          const supplierName = items[0].supplierName || 'Unknown Supplier';

          const supplierFields = await buildPOSupplierFields(supplierId);

          const po = await purchaseOrderService.createPurchaseOrder({
            supplier_id: supplierId,
            status: 'draft',
            ...supplierFields,
            requested_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            notes: `Bulk reorder for ${items.length} material${items.length > 1 ? 's' : ''}`,
            subtotal: totalCost,
            tax_amount: totalCost * 0.08,
            shipping_cost: 0,
            total_amount: totalCost * 1.08,
            auto_generated: false
          });

          if (!po) throw new Error('Failed to create purchase order');

          // Add all items to the PO
          for (const item of items) {
            await purchaseOrderService.addItemToPurchaseOrder({
              purchase_order_id: po.id,
              material_type_id: item.materialTypeId,
              description: item.materialName,
              quantity_sqft: item.suggestedQuantity,
              unit_cost: item.estimatedCost / item.suggestedQuantity,
              width: 60,
              thickness: 0.125
            });

            // Mark reorder rule as last ordered
            const rule = reorderRules.find(r => r.material_type_id === item.materialTypeId);
            if (rule) {
              await reorderService.updateReorderRule(rule.id, {
                last_triggered_at: new Date().toISOString()
              });
            }
          }

          // Track the first PO created for navigation
          if (!firstPOId) {
            firstPOId = po.id;
          }

          poCount++;
          toast.success(`PO ${po.po_number} created`, {
            description: `${items.length} item${items.length > 1 ? 's' : ''} for ${supplierName}`
          });
        } catch (error) {
          console.error(`Error creating bulk PO for supplier ${supplierId}:`, error);
          toast.error("Failed to create purchase order", {
            description: `Error creating PO for supplier ${items[0].supplierName}`
          });
        }
      }

      if (poCount > 0) {
        toast.success(`Created ${poCount} purchase order${poCount > 1 ? 's' : ''}`, {
          description: supplierGroups.size > 1 ? "One PO per supplier. Redirecting..." : "Redirecting to Purchase Orders..."
        });

        // Clear selection and refresh data
        setSelectedSuggestions(new Set());
        await fetchData();

        // Navigate to purchase orders page with the first PO highlighted
        setTimeout(() => {
          if (firstPOId) {
            router.push(`/dashboard/inventory/purchase-orders?view=${firstPOId}`);
          } else {
            router.push('/dashboard/inventory/purchase-orders');
          }
        }, 2000);
      }
    } catch (error) {
      console.error("Error creating bulk PO:", error);
      toast.error("Failed to create bulk purchase order", {
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      });
    } finally {
      setCreatingBulkPO(false);
    }
  };

  // Toggle suggestion selection
  const toggleSuggestionSelection = (materialTypeId: string) => {
    const newSelection = new Set(selectedSuggestions);
    if (newSelection.has(materialTypeId)) {
      newSelection.delete(materialTypeId);
    } else {
      newSelection.add(materialTypeId);
    }
    setSelectedSuggestions(newSelection);
  };

  // Select/deselect all suggestions
  const toggleSelectAll = () => {
    if (selectedSuggestions.size === suggestions.length) {
      setSelectedSuggestions(new Set());
    } else {
      setSelectedSuggestions(new Set(suggestions.map(s => s.materialTypeId)));
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Auto-Reorder Management</h1>
        <p className="text-muted-foreground">
          Configure automatic reorder rules and manage stock levels
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Rules</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reorderRules.filter(r => r.active).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {reorderRules.filter(r => r.auto_reorder).length} auto-enabled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reorder Needed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suggestions.length}</div>
            <p className="text-xs text-muted-foreground">
              {suggestions.filter(s => s.urgencyLevel === 'critical').length} critical
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Order Value</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${suggestions.reduce((sum, s) => sum + s.estimatedCost, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">
              For {suggestions.length} items
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reorderRules.length > 0
                ? Math.round(reorderRules.reduce((sum, r) => sum + r.lead_time_days, 0) / reorderRules.length)
                : 0} days
            </div>
            <p className="text-xs text-muted-foreground">
              Across all materials
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {suggestions.filter(s => s.urgencyLevel === 'critical').length > 0 && (
        <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Stock Levels</AlertTitle>
          <AlertDescription>
            {suggestions.filter(s => s.urgencyLevel === 'critical').length} material(s) require immediate reordering.
            Expected stockout within 2 days if not actioned.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rules">Reorder Rules</TabsTrigger>
          <TabsTrigger value="suggestions">
            Reorder Suggestions
            {suggestions.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {suggestions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Reorder Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="All Materials" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Materials</SelectItem>
                    {materialTypes.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => {
                  setSelectedRule(null);
                  setIsRuleModalOpen(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rules Table */}
          <Card>
            <CardHeader>
              <CardTitle>Reorder Rules Configuration</CardTitle>
              <CardDescription>
                Set min/max stock levels and reorder parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Reorder Point</TableHead>
                      <TableHead>Reorder Qty</TableHead>
                      <TableHead>Max Stock</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Safety Stock</TableHead>
                      <TableHead>Auto-Reorder</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          Loading reorder rules...
                        </TableCell>
                      </TableRow>
                    ) : filteredRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          No reorder rules configured
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRules.map((rule) => {
                        const isEditing = !!editingRules[rule.id];
                        const editedRule = editingRules[rule.id];
                        const currentStock = rule.current_stock || 0;
                        const maxStock = rule.max_stock_level || 1000;
                        const stockStatus = getStockStatus(currentStock, rule.reorder_point, maxStock);

                        return (
                          <TableRow key={rule.id}>
                            <TableCell className="font-medium">
                              {rule.material_type?.name || "Unknown"}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <span className="font-mono">
                                  {currentStock.toFixed(0)} sq ft
                                </span>
                                <Progress
                                  value={(currentStock / maxStock) * 100}
                                  className="h-2"
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editedRule.reorderPoint}
                                  onChange={(e) => setEditingRules({
                                    ...editingRules,
                                    [rule.id]: {
                                      ...editedRule,
                                      reorderPoint: parseInt(e.target.value) || 0
                                    }
                                  })}
                                  className="w-24"
                                />
                              ) : (
                                <span className="font-mono">{rule.reorder_point} sq ft</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editedRule.reorderQuantity}
                                  onChange={(e) => setEditingRules({
                                    ...editingRules,
                                    [rule.id]: {
                                      ...editedRule,
                                      reorderQuantity: parseInt(e.target.value) || 0
                                    }
                                  })}
                                  className="w-24"
                                />
                              ) : (
                                <span className="font-mono">{rule.reorder_quantity} sq ft</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editedRule.maxStockLevel ?? ""}
                                  onChange={(e) => setEditingRules({
                                    ...editingRules,
                                    [rule.id]: {
                                      ...editedRule,
                                      maxStockLevel: e.target.value ? parseInt(e.target.value) : null
                                    }
                                  })}
                                  placeholder="Optional"
                                  className="w-24"
                                />
                              ) : (
                                <span className="font-mono">
                                  {rule.max_stock_level || "—"} sq ft
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editedRule.leadTimeDays}
                                  onChange={(e) => setEditingRules({
                                    ...editingRules,
                                    [rule.id]: {
                                      ...editedRule,
                                      leadTimeDays: parseInt(e.target.value) || 0
                                    }
                                  })}
                                  className="w-20"
                                />
                              ) : (
                                <Badge variant="outline">{rule.lead_time_days} days</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editedRule.safetyStockDays}
                                  onChange={(e) => setEditingRules({
                                    ...editingRules,
                                    [rule.id]: {
                                      ...editedRule,
                                      safetyStockDays: parseInt(e.target.value) || 0
                                    }
                                  })}
                                  className="w-20"
                                />
                              ) : (
                                <span>{rule.safety_stock_days} days</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Switch
                                  checked={editedRule.autoReorder}
                                  onCheckedChange={(checked) => setEditingRules({
                                    ...editingRules,
                                    [rule.id]: {
                                      ...editedRule,
                                      autoReorder: checked
                                    }
                                  })}
                                />
                              ) : (
                                <Switch
                                  checked={rule.auto_reorder}
                                  onCheckedChange={async (checked) => {
                                    try {
                                      const response = await reorderService.updateReorderRule(rule.id, { auto_reorder: checked });
                                      if (!response) throw new Error('Failed to update');
                                      setReorderRules(rules =>
                                        rules.map(r => r.id === rule.id ? { ...r, auto_reorder: checked } : r)
                                      );
                                    } catch (error: any) {
                                      console.error("Error toggling auto-reorder:", error?.message);
                                      toast.error("Failed to toggle auto-reorder");
                                    }
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {currentStock <= rule.reorder_point ? (
                                <Badge variant="destructive">Reorder</Badge>
                              ) : (
                                <Badge variant="default">OK</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <Button
                                    className="min-h-[44px] min-w-[44px]"
                                    variant="ghost"
                                    onClick={() => saveRule(rule.id)}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    className="min-h-[44px] min-w-[44px]"
                                    variant="ghost"
                                    onClick={() => cancelEditing(rule.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  className="min-h-[44px] min-w-[44px]"
                                  variant="ghost"
                                  onClick={() => startEditingRule(rule)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
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

        {/* Reorder Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-4">
          {suggestions.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-medium">All Stock Levels OK</h3>
                  <p className="text-muted-foreground">
                    No materials currently require reordering
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Total Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{suggestions.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Total Cost</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${suggestions.reduce((sum, s) => sum + s.estimatedCost, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Critical Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {suggestions.filter(s => s.urgencyLevel === 'critical').length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Suggestions Table */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Reorder Suggestions</CardTitle>
                      <CardDescription>
                        Materials below reorder point with EOQ recommendations
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleCreateIndividualPOs}
                        disabled={creatingIndividualPOs || selectedSuggestions.size === 0}
                      >
                        {creatingIndividualPOs ? (
                          <>Creating...</>
                        ) : (
                          <>Create Individual POs</>
                        )}
                      </Button>
                      <Button
                        onClick={handleCreateBulkPO}
                        disabled={creatingBulkPO || selectedSuggestions.size === 0}
                      >
                        {creatingBulkPO ? (
                          <>Creating...</>
                        ) : (
                          <>
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Create Bulk PO
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={selectedSuggestions.size === suggestions.length && suggestions.length > 0}
                              onChange={toggleSelectAll}
                            />
                          </TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead>Current Stock</TableHead>
                          <TableHead>Reorder Point</TableHead>
                          <TableHead>Suggested Qty (EOQ)</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Est. Cost</TableHead>
                          <TableHead>Urgency</TableHead>
                          <TableHead>Days to Stockout</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suggestions.map((suggestion) => (
                          <TableRow key={suggestion.materialTypeId}>
                            <TableCell>
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={selectedSuggestions.has(suggestion.materialTypeId)}
                                onChange={() => toggleSuggestionSelection(suggestion.materialTypeId)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {suggestion.materialName}
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-mono">
                                  {suggestion.currentStock.toFixed(0)} sq ft
                                </span>
                                {suggestion.pendingQuantity && suggestion.pendingQuantity > 0 && (
                                  <div className="text-xs text-green-600 mt-1">
                                    +{suggestion.pendingQuantity.toFixed(0)} pending
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono">
                                {suggestion.reorderPoint.toFixed(0)} sq ft
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold">
                                  {suggestion.suggestedQuantity} sq ft
                                </span>
                                <Calculator className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </TableCell>
                            <TableCell>
                              {suggestion.supplierName || "—"}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono">
                                ${suggestion.estimatedCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </TableCell>
                            <TableCell>
                              {getUrgencyBadge(suggestion.urgencyLevel)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className={
                                  suggestion.daysUntilStockout <= 2
                                    ? "text-red-600 font-semibold"
                                    : suggestion.daysUntilStockout <= 5
                                    ? "text-orange-600"
                                    : ""
                                }>
                                  {suggestion.daysUntilStockout} days
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                className="min-h-[44px]"
                                variant="outline"
                                onClick={() => handleCreatePO(suggestion)}
                                disabled={creatingPOFor === suggestion.materialTypeId}
                              >
                                {creatingPOFor === suggestion.materialTypeId ? "Creating..." : "Create PO"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reorder Performance</CardTitle>
                <CardDescription>
                  Track reorder efficiency and optimization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Stock Availability</span>
                      <span className="text-sm font-medium">94%</span>
                    </div>
                    <Progress value={94} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Order Accuracy</span>
                      <span className="text-sm font-medium">88%</span>
                    </div>
                    <Progress value={88} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Lead Time Compliance</span>
                      <span className="text-sm font-medium">76%</span>
                    </div>
                    <Progress value={76} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Optimization</CardTitle>
                <CardDescription>
                  Savings from EOQ and bulk ordering
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Monthly Ordering Cost</span>
                    <span className="text-sm font-medium">$2,450</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">EOQ Savings</span>
                    <span className="text-sm font-medium text-green-600">$340</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Bulk Order Discount</span>
                    <span className="text-sm font-medium text-green-600">$580</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Monthly Savings</span>
                      <span className="font-bold text-green-600">$920</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Stockout Risk Analysis</CardTitle>
              <CardDescription>
                Materials at risk of stockout in the next 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reorderRules.slice(0, 5).map((rule) => {
                  const currentStock = rule.current_stock ?? 0;
                  const reorderPoint = rule.reorder_point ?? 0;
                  // Risk = how close to stockout (100% = at or below reorder point)
                  const risk = reorderPoint > 0
                    ? Math.max(0, Math.min(100, ((reorderPoint - currentStock) / reorderPoint) * 100 + 50))
                    : 0;
                  return (
                    <div key={rule.id}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">{rule.material_type?.name || 'Unknown'}</span>
                        <span className={`text-sm font-medium ${
                          risk > 70 ? 'text-red-600' : risk > 40 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {risk.toFixed(0)}% risk
                        </span>
                      </div>
                      <Progress
                        value={risk}
                        className={`h-2 ${
                          risk > 70 ? '[&>div]:bg-red-500' : risk > 40 ? '[&>div]:bg-yellow-500' : ''
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reorder Rule Modal */}
      <ReorderRuleModal
        open={isRuleModalOpen}
        onOpenChange={setIsRuleModalOpen}
        rule={selectedRule}
        materialTypes={materialTypes}
        suppliers={suppliers}
        onSuccess={() => {
          fetchData();
          setIsRuleModalOpen(false);
        }}
      />
    </div>
  );
}