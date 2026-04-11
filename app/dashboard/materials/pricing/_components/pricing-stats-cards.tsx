"use client"

import { DollarSign, TrendingDown, Building2, AlertTriangle } from "lucide-react"

import type { MaterialSupplierWithDetails } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PriceAlert, PriceComparisonData } from "./pricing-types"

interface PricingStatsCardsProps {
  suppliers: { length: number }
  materialSuppliers: MaterialSupplierWithDetails[]
  priceAlerts: PriceAlert[]
  priceComparisonData: PriceComparisonData[]
}

export function PricingStatsCards({
  suppliers,
  materialSuppliers,
  priceAlerts,
  priceComparisonData,
}: PricingStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Price</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            $
            {materialSuppliers.length > 0
              ? (
                  materialSuppliers.reduce((sum, ms) => sum + ms.cost_per_sqft, 0) /
                  materialSuppliers.length
                ).toFixed(2)
              : "0.00"}
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
          <CardTitle className="text-sm font-medium">Best Savings</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {priceComparisonData.length > 0
              ? Math.max(
                  0,
                  ...priceComparisonData.map((d) =>
                    d.priceRange.max > 0
                      ? ((d.priceRange.max - d.priceRange.min) / d.priceRange.max) * 100
                      : 0
                  )
                ).toFixed(0)
              : "0"}
            %
          </div>
          <p className="text-xs text-muted-foreground">Max potential savings</p>
        </CardContent>
      </Card>
    </div>
  )
}
