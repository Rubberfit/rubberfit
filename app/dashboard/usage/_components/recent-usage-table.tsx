"use client"

import { format } from "date-fns"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

interface RecentUsageTableProps {
  data: CutHistory[]
}

export function RecentUsageTable({ data }: RecentUsageTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Material Usage</CardTitle>
        <CardDescription>Last 20 cutting operations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Material Used</TableHead>
                <TableHead>Fab Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cut) => (
                <TableRow key={cut.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(cut.cut_date), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell>{cut.stock_label || "Unknown"}</TableCell>
                  <TableCell className="font-mono">
                    {cut.cut_width}&quot; × {cut.cut_length}&quot;
                  </TableCell>
                  <TableCell className="text-center">{cut.cut_amount}</TableCell>
                  <TableCell className="font-mono">
                    {cut.material_used_sqft.toFixed(2)} sq ft
                  </TableCell>
                  <TableCell className="font-mono">
                    {Math.round(cut.fab_score * 100)}%
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
