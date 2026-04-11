"use client"

import { Download, Search, CheckCircle2 } from "lucide-react"

import type { MaterialType, Supplier } from "@/app/lib/supabase"
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
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { exportService } from "@/src/infrastructure/services/exportService"
import { toast } from "sonner"
import type { PriceComparisonData } from "./pricing-types"

interface PricingComparisonTableProps {
  loading: boolean
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  selectedMaterial: string
  setSelectedMaterial: (value: string) => void
  selectedSupplier: string
  setSelectedSupplier: (value: string) => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  filteredComparisonData: PriceComparisonData[]
}

export function PricingComparisonTable({
  loading,
  materialTypes,
  suppliers,
  selectedMaterial,
  setSelectedMaterial,
  selectedSupplier,
  setSelectedSupplier,
  searchQuery,
  setSearchQuery,
  filteredComparisonData,
}: PricingComparisonTableProps) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10"
              />
            </div>
            <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
              <SelectTrigger className="w-[200px]">
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
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Material Price Comparison</CardTitle>
              <CardDescription>Compare prices from different suppliers</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (filteredComparisonData.length === 0) {
                  toast.error("No price data to export")
                  return
                }
                const rows = filteredComparisonData.flatMap((item) =>
                  item.suppliers.map((s) => [
                    item.materialName,
                    s.supplierName,
                    s.currentPrice.toFixed(2),
                    item.bestPrice.toFixed(2),
                    item.avgPrice.toFixed(2),
                    s.leadTime,
                    s.minOrder,
                    s.isPreferred ? "Yes" : "No",
                  ])
                )
                exportService.exportToCSV({
                  headers: [
                    "Material",
                    "Supplier",
                    "Price ($/sqft)",
                    "Best Price",
                    "Avg Price",
                    "Lead Time (days)",
                    "Min Order (sqft)",
                    "Preferred",
                  ],
                  rows,
                  filename: "price_comparison",
                })
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Best Price</TableHead>
                  <TableHead>Avg Price</TableHead>
                  <TableHead>Price Range</TableHead>
                  <TableHead>Best Supplier</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Min Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading price comparison data...
                    </TableCell>
                  </TableRow>
                ) : filteredComparisonData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      No price comparison data available
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredComparisonData.map((item) => {
                    const bestSupplier = item.suppliers.find(
                      (s) => s.currentPrice === item.bestPrice
                    )
                    const savings =
                      ((item.priceRange.max - item.priceRange.min) / item.priceRange.max) * 100

                    return (
                      <TableRow key={item.materialTypeId}>
                        <TableCell className="font-medium">{item.materialName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-green-600">
                              ${item.bestPrice.toFixed(2)}
                            </span>
                            {savings > 10 && (
                              <Badge variant="secondary" className="text-xs">
                                Save {savings.toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">${item.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-sm">
                          ${item.priceRange.min.toFixed(2)} - ${item.priceRange.max.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {bestSupplier?.supplierName}
                            {bestSupplier?.isPreferred && (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{bestSupplier?.leadTime || 0} days</Badge>
                        </TableCell>
                        <TableCell>{bestSupplier?.minOrder || 0} sq ft</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost">
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
