"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { FileSpreadsheet } from "lucide-react"

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
        <CardTitle>Step 2: Upload CSV File</CardTitle>
        <CardDescription>Select your CSV file with inventory data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csv-file">CSV File</Label>
          <Input id="csv-file" type="file" accept=".csv" onChange={onFileChange} />
        </div>

        {file && (
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="text-sm">{file.name}</span>
              <Badge variant="outline">{(file.size / 1024).toFixed(2)} KB</Badge>
            </div>
            <Button onClick={onParse} disabled={parsing}>
              {parsing ? "Parsing..." : "Parse File"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
