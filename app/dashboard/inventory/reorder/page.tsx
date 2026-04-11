"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ShoppingCart, Truck, Activity } from "lucide-react"

import { type MaterialType, type ReorderRuleWithDetails, type Supplier } from "@/app/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { Progress } from "@/app/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Plus } from "lucide-react"
import { ReorderRuleModal } from "./_components/reorder-rule-modal"
import type { ReorderSuggestion } from "./_components/reorder-suggestions"
import { ReorderRulesTable, type EditableRule } from "./_components/reorder-rules-table"
import { ReorderSuggestionsTable } from "./_components/reorder-suggestions-table"
import { fetchReorderData } from "./_components/reorder-data-fetcher"

export default function ReorderRulesPage() {
  const router = useRouter()
  const [reorderRules, setReorderRules] = useState<ReorderRuleWithDetails[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRules, setEditingRules] = useState<Record<string, EditableRule>>({})
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all")
  const [activeTab, setActiveTab] = useState("rules")
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<ReorderRuleWithDetails | null>(null)
  const [creatingIndividualPOs, setCreatingIndividualPOs] = useState(false)
  const [creatingBulkPO, setCreatingBulkPO] = useState(false)
  const [creatingPOFor, setCreatingPOFor] = useState<string | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchReorderData()
      setReorderRules(data.reorderRules)
      setMaterialTypes(data.materialTypes)
      setSuppliers(data.suppliers)
      setSuggestions(data.suggestions)
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter rules
  const filteredRules = useMemo(() => {
    if (selectedMaterial === "all") return reorderRules
    return reorderRules.filter((r) => r.material_type_id === selectedMaterial)
  }, [reorderRules, selectedMaterial])

  // PO handler callbacks
  const poCallbacks = useMemo(
    () => ({
      fetchData,
      routerPush: (url: string) => router.push(url),
      reorderRules,
      suggestions,
      selectedSuggestions,
      setCreatingPOFor,
      setCreatingIndividualPOs,
      setCreatingBulkPO,
      setSelectedSuggestions,
    }),
    [fetchData, router, reorderRules, suggestions, selectedSuggestions]
  )

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Auto-Reorder Management</h1>
        <p className="text-muted-foreground">
          Configure automatic reorder rules and manage stock levels
        </p>
      </div>

      <ReorderQuickStats reorderRules={reorderRules} suggestions={suggestions} />

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
                    {materialTypes.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    setSelectedRule(null)
                    setIsRuleModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            </CardContent>
          </Card>

          <ReorderRulesTable
            loading={loading}
            filteredRules={filteredRules}
            editingRules={editingRules}
            setEditingRules={setEditingRules}
            setReorderRules={setReorderRules}
          />
        </TabsContent>

        {/* Reorder Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-4">
          <ReorderSuggestionsTable
            suggestions={suggestions}
            selectedSuggestions={selectedSuggestions}
            setSelectedSuggestions={setSelectedSuggestions}
            creatingPOFor={creatingPOFor}
            creatingIndividualPOs={creatingIndividualPOs}
            creatingBulkPO={creatingBulkPO}
            poCallbacks={poCallbacks}
          />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsSection reorderRules={reorderRules} />
        </TabsContent>
      </Tabs>

      <ReorderRuleModal
        open={isRuleModalOpen}
        onOpenChange={setIsRuleModalOpen}
        rule={selectedRule}
        materialTypes={materialTypes}
        suppliers={suppliers}
        onSuccess={() => {
          fetchData()
          setIsRuleModalOpen(false)
        }}
      />
    </div>
  )
}

function ReorderQuickStats({
  reorderRules,
  suggestions,
}: {
  reorderRules: ReorderRuleWithDetails[]
  suggestions: ReorderSuggestion[]
}) {
  const criticalCount = suggestions.filter((s) => s.urgencyLevel === "critical").length

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Rules</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reorderRules.filter((r) => r.active).length}</div>
            <p className="text-xs text-muted-foreground">
              {reorderRules.filter((r) => r.auto_reorder).length} auto-enabled
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
            <p className="text-xs text-muted-foreground">{criticalCount} critical</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Order Value</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {suggestions
                .reduce((sum, s) => sum + s.estimatedCost, 0)
                .toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">For {suggestions.length} items</p>
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
                ? Math.round(
                    reorderRules.reduce((sum, r) => sum + r.lead_time_days, 0) / reorderRules.length
                  )
                : 0}{" "}
              days
            </div>
            <p className="text-xs text-muted-foreground">Across all materials</p>
          </CardContent>
        </Card>
      </div>

      {criticalCount > 0 && (
        <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Stock Levels</AlertTitle>
          <AlertDescription>
            {criticalCount} material(s) require immediate reordering. Expected stockout within 2
            days if not actioned.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

function AnalyticsSection({ reorderRules }: { reorderRules: ReorderRuleWithDetails[] }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reorder Performance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Track reorder efficiency and optimization
            </p>
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
            <p className="text-sm text-muted-foreground">Savings from EOQ and bulk ordering</p>
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
          <p className="text-sm text-muted-foreground">
            Materials at risk of stockout in the next 30 days
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {reorderRules.slice(0, 5).map((rule) => {
              const currentStock = rule.current_stock ?? 0
              const reorderPoint = rule.reorder_point ?? 0
              const risk =
                reorderPoint > 0
                  ? Math.max(
                      0,
                      Math.min(100, ((reorderPoint - currentStock) / reorderPoint) * 100 + 50)
                    )
                  : 0
              return (
                <div key={rule.id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">{rule.material_type?.name || "Unknown"}</span>
                    <span
                      className={`text-sm font-medium ${
                        risk > 70
                          ? "text-red-600"
                          : risk > 40
                            ? "text-yellow-600"
                            : "text-green-600"
                      }`}
                    >
                      {risk.toFixed(0)}% risk
                    </span>
                  </div>
                  <Progress
                    value={risk}
                    className={`h-2 ${
                      risk > 70 ? "[&>div]:bg-red-500" : risk > 40 ? "[&>div]:bg-yellow-500" : ""
                    }`}
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
