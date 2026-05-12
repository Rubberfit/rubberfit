"use client"

import { FileSpreadsheet } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"

import { StepBadge } from "./step-badge"

interface ImportUploadCardProps {
  file: File | null
  parsing: boolean
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onParse: () => void
}

export function ImportUploadCard({ file, parsing, onFileChange, onParse }: ImportUploadCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <StepBadge step={2} />
          <div className="space-y-1">
            <CardTitle>Upload CSV file</CardTitle>
            <CardDescription>Select your CSV file with inventory data.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csv-file">CSV file</Label>
          <Input id="csv-file" type="file" accept=".csv" onChange={onFileChange} />
        </div>

        {file && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              <span className="text-sm">{file.name}</span>
              <Badge variant="outline" className="font-mono tabular-nums">
                {(file.size / 1024).toFixed(2)} KB
              </Badge>
            </div>
            <Button onClick={onParse} disabled={parsing}>
              {parsing ? "Parsing…" : "Parse file"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
