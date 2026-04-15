"use client"

import { DollarSign, Layers, Building2, AlertTriangle } from "lucide-react"

import type { MaterialType, MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import type { PriceAlert } from "./pricing-types"

interface PricingStatsCardsProps {
  materialTypes: MaterialType[]
  suppliers: { length: number }
  materialSuppliers: MaterialSupplierWithDetails[]
  priceAlerts: PriceAlert[]
}

export function PricingStatsCards({
  materialTypes,
  suppliers,
  materialSuppliers,
  priceAlerts,
}: PricingStatsCardsProps) {
  const withCost = materialTypes.filter((mt) => mt.default_cost != null)
  const avgCost =
    withCost.length > 0
      ? withCost.reduce((sum, mt) => sum + (mt.default_cost ?? 0), 0) / withCost.length
      : 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Material Types</CardTitle>
          <Layers className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{materialTypes.length}</div>
          <p className="text-xs text-muted-foreground">
            {withCost.length} with costs set
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Cost</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            ${avgCost > 0 ? avgCost.toFixed(2) : "0.00"}
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
            {priceAlerts.filter((a) => a.type === "increase").length} increases
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{suppliers.length}</div>
          <p className="text-xs text-muted-foreground">
            {materialSuppliers.filter((ms) => ms.preferred_supplier).length} preferred
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
