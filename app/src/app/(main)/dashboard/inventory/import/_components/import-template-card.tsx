"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { toast } from "sonner"

export function ImportTemplateCard() {
  const downloadTemplate = () => {
    const template = `material_type,width,length,thickness,color,location,date_received,supplier,cost_per_sqft,remaining_length,notes
Neoprene,48,120,0.25,Black,Rack A1,2024-01-15,ABC Rubber Co,2.50,120,Good condition
EPDM,36,96,0.125,Red,Rack B2,2024-02-01,XYZ Supplies,3.00,96,UV resistant
Nitrile,60,144,0.375,Blue,Rack C3,2024-02-10,Rubber Direct,2.75,144,Oil resistant`

    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "rubberfit_inventory_template.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success("Template downloaded successfully")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Download Template</CardTitle>
        <CardDescription>Start with our CSV template to ensure proper formatting</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={downloadTemplate} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Download CSV Template
        </Button>
      </CardContent>
    </Card>
  )
}
