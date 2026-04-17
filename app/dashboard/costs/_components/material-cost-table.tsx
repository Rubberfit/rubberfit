"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

interface MaterialCost {
  materialType: string
  totalCost: number
  cutCost: number
  reusableCost: number
  wasteCost: number
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
                <TableHead>Cut Value</TableHead>
                <TableHead>Reusable Value</TableHead>
                <TableHead>Waste Cost</TableHead>
                <TableHead>Cuts</TableHead>
                <TableHead>Avg Cost/Cut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((material) => (
                <TableRow key={material.materialType}>
                  <TableCell className="font-medium">{material.materialType}</TableCell>
                  <TableCell className="font-mono font-medium">
                    ${material.totalCost.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono">${material.cutCost.toFixed(2)}</TableCell>
                  <TableCell className="font-mono">${material.reusableCost.toFixed(2)}</TableCell>
                  <TableCell className="font-mono">${material.wasteCost.toFixed(2)}</TableCell>
                  <TableCell className="text-center">{material.cuts}</TableCell>
                  <TableCell className="font-mono">${material.avgCostPerCut.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
