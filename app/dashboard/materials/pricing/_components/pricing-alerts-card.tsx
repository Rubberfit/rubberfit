"use client"

import { AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert"
import type { PriceAlert } from "./pricing-types"

interface PricingAlertsCardProps {
  priceAlerts: PriceAlert[]
  dateRange: string
}

export function PricingAlertsCard({ priceAlerts, dateRange }: PricingAlertsCardProps) {
  if (priceAlerts.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Recent Price Changes
        </CardTitle>
        <CardDescription>Significant price changes in the last {dateRange} days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {priceAlerts.slice(0, 3).map((alert) => (
            <Alert
              key={alert.id}
              className={alert.type === "increase" ? "border-orange-200" : "border-green-200"}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {alert.type === "increase" ? (
                    <ArrowUpRight className="h-4 w-4 text-orange-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-green-600" />
                  )}
                  <div>
                    <AlertTitle className="text-sm font-medium">
                      {alert.materialName} - {alert.supplierName}
                    </AlertTitle>
                    <AlertDescription className="text-xs">
                      ${alert.oldPrice.toFixed(2)} → ${alert.newPrice.toFixed(2)}(
                      {alert.type === "increase" ? "+" : ""}
                      {alert.changePercentage.toFixed(1)}%)
                    </AlertDescription>
                  </div>
                </div>
                <Badge variant={alert.type === "increase" ? "destructive" : "default"}>
                  {alert.type === "increase" ? "Price Up" : "Price Down"}
                </Badge>
              </div>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
