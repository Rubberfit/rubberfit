"use client"

import { format } from "date-fns"

import { type Cut } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface RecentUsageTableProps {
  data: (Cut & { roll?: { material_type: string; location: string } })[]
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
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cut) => (
                <TableRow key={cut.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(cut.created_at), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell>{cut.roll?.material_type || "Unknown"}</TableCell>
                  <TableCell className="font-mono">
                    {cut.cut_width}" × {cut.cut_length}"
                  </TableCell>
                  <TableCell className="text-center">{cut.quantity}</TableCell>
                  <TableCell className="font-mono">
                    {cut.total_sqft_used?.toFixed(2) || "N/A"} sq ft
                  </TableCell>
                  <TableCell>{cut.roll?.location || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
