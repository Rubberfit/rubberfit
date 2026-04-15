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

interface MonthlyCosts {
  period: string
  cutCost: number
  reusableCost: number
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
        <CardDescription>Detailed monthly analysis of material costs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Cut Value</TableHead>
                <TableHead>Reusable Value</TableHead>
                <TableHead>Waste Cost</TableHead>
                <TableHead>Cuts</TableHead>
                <TableHead>Avg Cost/Cut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((month) => {
                const avgCostPerCut = month.cuts > 0 ? month.totalCost / month.cuts : 0

                return (
                  <TableRow key={month.period}>
                    <TableCell className="font-medium">{month.period}</TableCell>
                    <TableCell className="font-mono font-medium">
                      ${month.totalCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono">${month.cutCost.toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${month.reusableCost.toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${month.wasteCost.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{month.cuts}</TableCell>
                    <TableCell className="font-mono">${avgCostPerCut.toFixed(2)}</TableCell>
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
