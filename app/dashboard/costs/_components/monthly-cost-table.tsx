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

interface MonthlyCosts {
  period: string
  materialCost: number
  wasteCost: number
  totalCost: number
  cuts: number
}

interface MonthlyCostTableProps {
  data: MonthlyCosts[]
}

export function MonthlyCostTable({ data }: MonthlyCostTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Cost Breakdown</CardTitle>
        <CardDescription>Detailed monthly analysis of material and waste costs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Material Cost</TableHead>
                <TableHead>Waste Cost</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Cuts</TableHead>
                <TableHead>Avg Cost/Cut</TableHead>
                <TableHead>Waste %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((month) => {
                const wastePercentage =
                  month.totalCost > 0 ? (month.wasteCost / month.totalCost) * 100 : 0
                const avgCostPerCut = month.cuts > 0 ? month.totalCost / month.cuts : 0

                return (
                  <TableRow key={month.period}>
                    <TableCell className="font-medium">{month.period}</TableCell>
                    <TableCell className="font-mono">${month.materialCost.toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${month.wasteCost.toFixed(2)}</TableCell>
                    <TableCell className="font-mono font-medium">
                      ${month.totalCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">{month.cuts}</TableCell>
                    <TableCell className="font-mono">${avgCostPerCut.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          wastePercentage <= 10
                            ? "default"
                            : wastePercentage <= 20
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {wastePercentage.toFixed(1)}%
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
