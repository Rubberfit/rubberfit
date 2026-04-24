"use client"

import { Building } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

export function SupplierOverview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8">
          <Building className="h-10 w-10 mb-4 opacity-50" />
          <p className="text-sm font-medium text-center">No Suppliers Yet</p>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Supplier management features will be available in Phase 2
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
