"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Download } from "lucide-react";
import { rollService } from "@/services/rollService";
import { materialTypeService } from "@/services/materialTypeService";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CSVRow {
  material_type: string;
  width: number;
  length: number;
  thickness: number;
  color?: string;
  location?: string;
  date_received?: string;
  supplier?: string;
  cost_per_sqft?: number;
  remaining_length?: number;
  notes?: string;
}

export default function CSVImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState<CSVRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const router = useRouter();

  const downloadTemplate = () => {
    const template = `material_type,width,length,thickness,color,location,date_received,supplier,cost_per_sqft,remaining_length,notes
Neoprene,48,120,0.25,Black,Rack A1,2024-01-15,ABC Rubber Co,2.50,120,Good condition
EPDM,36,96,0.125,Red,Rack B2,2024-02-01,XYZ Supplies,3.00,96,UV resistant
Nitrile,60,144,0.375,Blue,Rack C3,2024-02-10,Rubber Direct,2.75,144,Oil resistant`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rubberfit_inventory_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Template downloaded successfully");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setParsedData([]);
      setErrors([]);
    } else {
      toast.error("Please select a valid CSV file");
    }
  };

  const parseCSV = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setParsing(true);
    setErrors([]);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        toast.error("CSV file must have a header row and at least one data row");
        setParsing(false);
        return;
      }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['material_type', 'width', 'length', 'thickness'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

      if (missingHeaders.length > 0) {
        setErrors([`Missing required columns: ${missingHeaders.join(', ')}`]);
        setParsing(false);
        return;
      }

      // Parse data rows
      const data: CSVRow[] = [];
      const parseErrors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());

        if (values.length !== headers.length) {
          parseErrors.push(`Row ${i + 1}: Column count mismatch`);
          continue;
        }

        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index];

          // Convert numeric fields
          if (['width', 'length', 'thickness', 'cost_per_sqft', 'remaining_length'].includes(header)) {
            row[header] = value ? parseFloat(value) : null;
            if (value && isNaN(row[header])) {
              parseErrors.push(`Row ${i + 1}: Invalid number for ${header}`);
            }
          } else {
            row[header] = value || null;
          }
        });

        // Validate required fields
        if (!row.material_type || !row.width || !row.length || !row.thickness) {
          parseErrors.push(`Row ${i + 1}: Missing required fields`);
          continue;
        }

        // Set remaining_length to length if not provided
        if (!row.remaining_length) {
          row.remaining_length = row.length;
        }

        data.push(row as CSVRow);
      }

      if (parseErrors.length > 0) {
        setErrors(parseErrors);
      }

      if (data.length === 0) {
        toast.error("No valid data rows found");
      } else {
        setParsedData(data);
        toast.success(`Parsed ${data.length} valid rows`);
      }

    } catch (error) {
      console.error("Error parsing CSV:", error);
      toast.error("Failed to parse CSV file");
    } finally {
      setParsing(false);
    }
  };

  const importData = async () => {
    if (parsedData.length === 0) {
      toast.error("No data to import");
      return;
    }

    setImporting(true);

    try {
      // Auto-create any material types that don't exist yet
      const uniqueMaterialTypes = [...new Set(parsedData.map(r => r.material_type).filter(Boolean))];
      if (uniqueMaterialTypes.length > 0) {
        const existingTypes = await materialTypeService.getAll();
        const existingNames = new Set(existingTypes.map(t => t.name));
        const newTypes = uniqueMaterialTypes.filter(name => !existingNames.has(name));

        for (const name of newTypes) {
          await materialTypeService.create({ name, description: '', default_cost: 0, min_stock_alert: 0 });
        }
        if (newTypes.length > 0) {
          toast.info(`Created ${newTypes.length} new material type${newTypes.length > 1 ? 's' : ''}`);
        }
      }

      // Prepare data for import via rollService
      const rollsToImport = parsedData.map(row => ({
        ...row,
        remaining_length: row.remaining_length ?? row.length,
        status: 'active' as const,
      }));

      const { imported, total } = await rollService.bulkAddRolls(rollsToImport);

      if (imported === total) {
        toast.success(`Successfully imported ${imported} rolls!`);
        setTimeout(() => {
          router.push('/dashboard/inventory');
        }, 2000);
      } else {
        toast.warning(`Imported ${imported} of ${total} rolls`);
      }

    } catch (error) {
      console.error("Error importing data:", error);
      toast.error(`Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Import Inventory from CSV</h1>
        <p className="text-muted-foreground">
          Upload a CSV file to bulk import inventory data
        </p>
      </div>

      {/* Download Template */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Download Template</CardTitle>
          <CardDescription>
            Start with our CSV template to ensure proper formatting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download CSV Template
          </Button>
        </CardContent>
      </Card>

      {/* Upload File */}
      <Card>
        <CardHeader>
          <CardTitle>Step 2: Upload CSV File</CardTitle>
          <CardDescription>
            Select your CSV file with inventory data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>

          {file && (
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm">{file.name}</span>
                <Badge variant="outline">{(file.size / 1024).toFixed(2)} KB</Badge>
              </div>
              <Button onClick={parseCSV} disabled={parsing}>
                {parsing ? "Parsing..." : "Parse File"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parse Results */}
      {(parsedData.length > 0 || errors.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 3: Review & Import</CardTitle>
                <CardDescription>
                  Review the parsed data before importing
                </CardDescription>
              </div>
              {parsedData.length > 0 && (
                <Button onClick={importData} disabled={importing}>
                  <Upload className="mr-2 h-4 w-4" />
                  {importing ? "Importing..." : `Import ${parsedData.length} Rolls`}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Errors */}
            {errors.length > 0 && (
              <div className="mb-4 p-3 border border-destructive/20 rounded-lg bg-destructive/10">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="font-medium">Parse Errors</span>
                </div>
                <ul className="text-sm space-y-1">
                  {errors.slice(0, 10).map((error, index) => (
                    <li key={index} className="text-destructive">• {error}</li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-destructive">... and {errors.length - 10} more errors</li>
                  )}
                </ul>
              </div>
            )}

            {/* Preview Table */}
            {parsedData.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Dimensions</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Cost/sqft</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.material_type}</TableCell>
                        <TableCell>
                          {row.width}" × {row.length}" × {row.thickness}"
                        </TableCell>
                        <TableCell>{row.location || "-"}</TableCell>
                        <TableCell>{row.supplier || "-"}</TableCell>
                        <TableCell>${row.cost_per_sqft || "0.00"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedData.length > 10 && (
                  <div className="p-3 text-center text-sm text-muted-foreground border-t">
                    ... and {parsedData.length - 10} more rows
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}