"use client"

import { Calculator, CheckCircle, Clock, ShoppingCart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  handleCreatePO,
  handleCreateIndividualPOs,
  handleCreateBulkPO,
} from "./reorder-po-handlers"
import type { ReorderSuggestion } from "./reorder-suggestions"
import type { ReorderRuleWithDetails } from "@/lib/supabase"

function getUrgencyBadge(level: string) {
  switch (level) {
    case "critical":
      return <Badge variant="destructive">Critical</Badge>
    case "high":
      return <Badge className="bg-orange-500 hover:bg-orange-600">High</Badge>
    case "medium":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>
    case "low":
      return <Badge variant="secondary">Low</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

interface POCallbacks {
  fetchData: () => Promise<void>
  routerPush: (url: string) => void
  reorderRules: ReorderRuleWithDetails[]
  suggestions: ReorderSuggestion[]
  selectedSuggestions: Set<string>
  setCreatingPOFor: (id: string | null) => void
  setCreatingIndividualPOs: (value: boolean) => void
  setCreatingBulkPO: (value: boolean) => void
  setSelectedSuggestions: (value: Set<string>) => void
}

interface ReorderSuggestionsTableProps {
  suggestions: ReorderSuggestion[]
  selectedSuggestions: Set<string>
  setSelectedSuggestions: (value: Set<string>) => void
  creatingPOFor: string | null
  creatingIndividualPOs: boolean
  creatingBulkPO: boolean
  poCallbacks: POCallbacks
}

export function ReorderSuggestionsTable({
  suggestions,
  selectedSuggestions,
  setSelectedSuggestions,
  creatingPOFor,
  creatingIndividualPOs,
  creatingBulkPO,
  poCallbacks,
}: ReorderSuggestionsTableProps) {
  const toggleSuggestionSelection = (materialTypeId: string) => {
    const newSelection = new Set(selectedSuggestions)
    if (newSelection.has(materialTypeId)) {
      newSelection.delete(materialTypeId)
    } else {
      newSelection.add(materialTypeId)
    }
    setSelectedSuggestions(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedSuggestions.size === suggestions.length) {
      setSelectedSuggestions(new Set())
    } else {
      setSelectedSuggestions(new Set(suggestions.map((s) => s.materialTypeId)))
    }
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-medium">All Stock Levels OK</h3>
            <p className="text-muted-foreground">No materials currently require reordering</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
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
              $
              {suggestions
                .reduce((sum, s) => sum + s.estimatedCost, 0)
                .toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Critical Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {suggestions.filter((s) => s.urgencyLevel === "critical").length}
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
                onClick={() => handleCreateIndividualPOs(poCallbacks)}
                disabled={creatingIndividualPOs || selectedSuggestions.size === 0}
              >
                {creatingIndividualPOs ? <>Creating...</> : <>Create Individual POs</>}
              </Button>
              <Button
                onClick={() => handleCreateBulkPO(poCallbacks)}
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
                      checked={
                        selectedSuggestions.size === suggestions.length && suggestions.length > 0
                      }
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
                  <SuggestionRow
                    key={suggestion.materialTypeId}
                    suggestion={suggestion}
                    isSelected={selectedSuggestions.has(suggestion.materialTypeId)}
                    onToggle={() => toggleSuggestionSelection(suggestion.materialTypeId)}
                    creatingPOFor={creatingPOFor}
                    poCallbacks={poCallbacks}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function SuggestionRow({
  suggestion,
  isSelected,
  onToggle,
  creatingPOFor,
  poCallbacks,
}: {
  suggestion: ReorderSuggestion
  isSelected: boolean
  onToggle: () => void
  creatingPOFor: string | null
  poCallbacks: POCallbacks
}) {
  return (
    <TableRow>
      <TableCell>
        <input type="checkbox" className="rounded" checked={isSelected} onChange={onToggle} />
      </TableCell>
      <TableCell className="font-medium">{suggestion.materialName}</TableCell>
      <TableCell>
        <div>
          <span className="font-mono">{suggestion.currentStock.toFixed(0)} sq ft</span>
          {suggestion.pendingQuantity && suggestion.pendingQuantity > 0 && (
            <div className="text-xs text-green-600 mt-1">
              +{suggestion.pendingQuantity.toFixed(0)} pending
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className="font-mono">{suggestion.reorderPoint.toFixed(0)} sq ft</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold">{suggestion.suggestedQuantity} sq ft</span>
          <Calculator className="h-3 w-3 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>{suggestion.supplierName || "\u2014"}</TableCell>
      <TableCell>
        <span className="font-mono">
          ${suggestion.estimatedCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </span>
      </TableCell>
      <TableCell>{getUrgencyBadge(suggestion.urgencyLevel)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span
            className={
              suggestion.daysUntilStockout <= 2
                ? "text-red-600 font-semibold"
                : suggestion.daysUntilStockout <= 5
                  ? "text-orange-600"
                  : ""
            }
          >
            {suggestion.daysUntilStockout} days
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Button
          className="min-h-[44px]"
          variant="outline"
          onClick={() => handleCreatePO(suggestion, poCallbacks)}
          disabled={creatingPOFor === suggestion.materialTypeId}
        >
          {creatingPOFor === suggestion.materialTypeId ? "Creating..." : "Create PO"}
        </Button>
      </TableCell>
    </TableRow>
  )
}
