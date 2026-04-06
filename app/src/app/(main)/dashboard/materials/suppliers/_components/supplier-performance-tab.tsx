"use client"

import { TrendingUp, Calendar, Package, DollarSign } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function SupplierPerformanceTab() {
  return (
    <div className="grid gap-6">
      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>Supplier performance and order history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Total Orders</p>
              </div>
              <p className="text-2xl font-bold">&mdash;</p>
              <p className="text-xs text-muted-foreground">Phase 2</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">On-Time Delivery</p>
              </div>
              <p className="text-2xl font-bold">&mdash;</p>
              <p className="text-xs text-muted-foreground">Phase 2</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Quality Score</p>
              </div>
              <p className="text-2xl font-bold">&mdash;</p>
              <p className="text-xs text-muted-foreground">Phase 2</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Total Spent</p>
              </div>
              <p className="text-2xl font-bold">&mdash;</p>
              <p className="text-xs text-muted-foreground">Phase 2</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order History Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>Recent purchase orders from this supplier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Order history will be available in Phase 2</p>
            <p className="text-sm text-muted-foreground mt-2">
              Track purchase orders, deliveries, and payment status
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
