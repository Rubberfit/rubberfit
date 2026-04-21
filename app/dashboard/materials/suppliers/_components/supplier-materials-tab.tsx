"use client"

import { Package } from "lucide-react"

import { type MaterialSupplierWithDetails } from "@/src/infrastructure/models/database.types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

interface SupplierMaterialsTabProps {
  materialSuppliers: MaterialSupplierWithDetails[]
  loadingMaterials: boolean
}

export function SupplierMaterialsTab({
  materialSuppliers,
  loadingMaterials,
}: SupplierMaterialsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplied Materials</CardTitle>
        <CardDescription>Materials and pricing agreements with this supplier</CardDescription>
      </CardHeader>
      <CardContent>
        {loadingMaterials ? (
          <div className="text-center py-8 text-muted-foreground">Loading materials...</div>
        ) : materialSuppliers.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No materials linked to this supplier yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Type</TableHead>
                  <TableHead>Supplier Code</TableHead>
                  <TableHead>Cost/sq ft</TableHead>
                  <TableHead>Min Order</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialSuppliers.map((ms) => (
                  <TableRow key={ms.id}>
                    <TableCell className="font-medium">
                      {ms.material_type?.name || "Unknown"}
                      {ms.preferred_supplier && (
                        <Badge variant="secondary" className="ml-2">
                          Preferred
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{ms.supplier_material_code || "\u2014"}</TableCell>
                    <TableCell>
                      <span className="font-mono">${ms.cost_per_sqft.toFixed(2)}</span>
                    </TableCell>
                    <TableCell>
                      {ms.minimum_order_sqft ? `${ms.minimum_order_sqft} sq ft` : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {ms.lead_time_days ? `${ms.lead_time_days} days` : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ms.active ? "default" : "secondary"}>
                        {ms.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
