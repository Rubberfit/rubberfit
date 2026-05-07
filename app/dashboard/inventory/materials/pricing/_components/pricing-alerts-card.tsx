"use client"

import { AlertCircle, ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert"
import { Badge } from "@/app/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

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
          <AlertCircle className="size-4" aria-hidden="true" />
          Recent price changes
        </CardTitle>
        <CardDescription>Significant price changes in the last {dateRange} days.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {priceAlerts.slice(0, 3).map((alert) => (
            <Alert
              key={alert.id}
              className={cn(
                alert.type === "increase"
                  ? "border-[color:var(--warning)]/40"
                  : "border-[color:var(--success)]/40"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {alert.type === "increase" ? (
                    <ArrowUpRight
                      className="size-4 text-[color:var(--warning)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowDownRight
                      className="size-4 text-[color:var(--success)]"
                      aria-hidden="true"
                    />
                  )}
                  <div>
                    <AlertTitle className="text-sm font-medium">
                      {alert.materialName} · {alert.supplierName}
                    </AlertTitle>
                    <AlertDescription className="font-mono text-xs tabular-nums">
                      ${alert.oldPrice.toFixed(2)} → ${alert.newPrice.toFixed(2)} (
                      {alert.type === "increase" ? "+" : ""}
                      {alert.changePercentage.toFixed(1)}%)
                    </AlertDescription>
                  </div>
                </div>
                <Badge variant={alert.type === "increase" ? "destructive" : "default"}>
                  {alert.type === "increase" ? "Price up" : "Price down"}
                </Badge>
              </div>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
