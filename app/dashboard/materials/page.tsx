"use client"

import { useEffect, useState } from "react"
import { Database, Package, DollarSign, TrendingUp } from "lucide-react"
import Link from "next/link"

import { type MaterialType } from "@/src/entities"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Badge } from "@/app/components/ui/badge"

import { MaterialTypesOverview } from "./_components/material-types-overview"
import { SupplierOverview } from "./_components/supplier-overview"
import { PricingTrends } from "./_components/pricing-trends"

export default function MaterialsPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [_loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMaterialTypes = async () => {
      setLoading(true)
      try {
        const data = await materialTypeService.getAll()
        setMaterialTypes(data)
      } catch (error) {
        console.error("Error fetching material types:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMaterialTypes()
  }, [])

  const totalMaterialTypes = materialTypes.length
  const averageCost =
    materialTypes.length > 0
      ? materialTypes.reduce((sum, m) => sum + (m.default_cost || 0), 0) / materialTypes.length
      : 0
  const totalAlertThreshold = materialTypes.reduce((sum, m) => sum + (m.min_stock_alert || 0), 0)

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Materials Management</h1>
          <p className="text-muted-foreground">
            Manage material types, suppliers, and pricing information
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Material Types</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMaterialTypes}</div>
            <p className="text-xs text-muted-foreground">Active material types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averageCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per square foot</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alert Thresholds</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlertThreshold.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Combined alert levels</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Range</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {materialTypes.length > 0 ? (
                <>
                  ${Math.min(...materialTypes.map((m) => m.default_cost || 0)).toFixed(2)} - $
                  {Math.max(...materialTypes.map((m) => m.default_cost || 0)).toFixed(2)}
                </>
              ) : (
                "N/A"
              )}
            </div>
            <p className="text-xs text-muted-foreground">Price variation</p>
          </CardContent>
        </Card>
      </div>

      {/* Management Sections */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Material Types
            </CardTitle>
            <CardDescription>Manage rubber material categories and specifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Types</span>
                <Badge variant="outline">{totalMaterialTypes}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Avg Cost</span>
                <span className="font-mono">${averageCost.toFixed(2)}/sq ft</span>
              </div>
            </div>
            <Button asChild className="w-full">
              <Link href="/dashboard/materials/types">Manage Types</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Suppliers
            </CardTitle>
            <CardDescription>Manage supplier information and relationships</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Active Suppliers</span>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Delivery Options</span>
                <span className="text-muted-foreground">Multiple</span>
              </div>
            </div>
            <Button asChild className="w-full" variant="outline">
              <Link href="/dashboard/materials/suppliers">Manage Suppliers</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pricing
            </CardTitle>
            <CardDescription>Track pricing changes and cost analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Price Tracking</span>
                <Badge variant="outline">Active</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Cost Alerts</span>
                <span className="text-muted-foreground">Enabled</span>
              </div>
            </div>
            <Button asChild className="w-full" variant="outline">
              <Link href="/dashboard/materials/pricing">View Pricing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Overview Sections */}
      <div className="grid gap-4 md:grid-cols-2">
        <MaterialTypesOverview />
        <SupplierOverview />
      </div>

      <PricingTrends />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common material management tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/materials/types">Add New Material Type</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/materials/suppliers">Register Supplier</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/materials/pricing">Update Pricing</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/crm">View Inventory</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
