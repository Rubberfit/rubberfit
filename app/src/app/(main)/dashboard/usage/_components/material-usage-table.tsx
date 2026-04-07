"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface MaterialUsage {
  materialType: string
  totalSqftUsed: number
  totalCuts: number
  averageUtilization: number
  totalValue: number
  rollsUsed: number
}

interface MaterialUsageTableProps {
  data: MaterialUsage[]
}

export function MaterialUsageTable({ data }: MaterialUsageTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Usage by Type</CardTitle>
        <CardDescription>
          Detailed breakdown of material consumption over the last 6 months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material Type</TableHead>
                <TableHead>Total Used (sq ft)</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Cuts</TableHead>
                <TableHead>Rolls Used</TableHead>
                <TableHead>Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((material) => (
                <TableRow key={material.materialType}>
                  <TableCell className="font-medium">{material.materialType}</TableCell>
                  <TableCell className="font-mono">{material.totalSqftUsed.toFixed(1)}</TableCell>
                  <TableCell className="font-mono">${material.totalValue.toFixed(0)}</TableCell>
                  <TableCell className="text-center">{material.totalCuts}</TableCell>
                  <TableCell className="text-center">{material.rollsUsed}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={material.averageUtilization} className="w-20" />
                      <Badge variant={material.averageUtilization >= 80 ? "default" : "secondary"}>
                        {material.averageUtilization.toFixed(1)}%
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
