"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface MaterialCost {
  materialType: string
  totalCost: number
  wasteCost: number
  utilizationCost: number
  cuts: number
  avgCostPerCut: number
}

interface MaterialCostTableProps {
  data: MaterialCost[]
}

export function MaterialCostTable({ data }: MaterialCostTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost by Material Type</CardTitle>
        <CardDescription>
          Break down costs by material type to identify spending patterns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material Type</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Utilization Cost</TableHead>
                <TableHead>Waste Cost</TableHead>
                <TableHead>Cuts</TableHead>
                <TableHead>Avg Cost/Cut</TableHead>
                <TableHead>Waste Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((material) => {
                const wasteImpact =
                  material.totalCost > 0 ? (material.wasteCost / material.totalCost) * 100 : 0

                return (
                  <TableRow key={material.materialType}>
                    <TableCell className="font-medium">{material.materialType}</TableCell>
                    <TableCell className="font-mono font-medium">
                      ${material.totalCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono">
                      ${material.utilizationCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono">${material.wasteCost.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{material.cuts}</TableCell>
                    <TableCell className="font-mono">
                      ${material.avgCostPerCut.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          wasteImpact <= 10
                            ? "default"
                            : wasteImpact <= 20
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {wasteImpact.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
