"use client";

import { useState } from "react";
import { Plus, Download, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isRestrictedCutter } from "@/lib/rbac";
import { CSVUpload } from "../_components/csv-upload";
import { InventoryTable } from "../_components/inventory-table";
import { InventorySearch } from "../_components/inventory-search";
import { RollFormDialog } from "../_components/roll-form-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { rollService } from "@/services/rollService";
import { exportService } from "@/services/exportService";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function InventoryPage() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const readOnlyInventory = isRestrictedCutter(user?.roles);

  const handleUploadComplete = () => {
    // Trigger a refresh of the inventory table
    setRefreshKey(prev => prev + 1);
  };

  const handleAddSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleExportCSV = async () => {
    try {
      const rolls = await rollService.getActiveRolls();

      if (rolls && rolls.length > 0) {
        exportService.exportInventory(rolls);
      } else {
        toast.error('No data to export');
      }
    } catch (error) {
      console.error('Error exporting inventory:', error);
      toast.error('Failed to export inventory');
    }
  };

  const handleExportPDF = async () => {
    try {
      const rolls = await rollService.getActiveRolls();

      const summary = {
        totalRolls: rolls?.length || 0,
        activeRolls: rolls?.filter(r => r.status === 'active').length || 0,
        totalValue: rolls?.reduce((sum, roll) =>
          sum + ((roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144), 0) || 0,
        totalSqft: rolls?.reduce((sum, roll) =>
          sum + ((roll.remaining_length * roll.width) / 144), 0) || 0,
      };

      if (rolls && rolls.length > 0) {
        await exportService.generateInventoryReport(rolls, summary);
      } else {
        toast.error('No data to export');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">
            {readOnlyInventory ? "View current rubber roll inventory" : "Manage your rubber roll inventory"}
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className="mr-2 h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="mr-2 h-4 w-4" />
                Generate PDF Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!readOnlyInventory && (
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Roll
            </Button>
          )}
        </div>
      </div>

      {!readOnlyInventory && <CSVUpload onUploadComplete={handleUploadComplete} />}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Current Inventory</CardTitle>
              <CardDescription>
                All rubber rolls in stock
              </CardDescription>
            </div>
            <div className="w-full md:w-96">
              <InventorySearch onSearch={handleSearch} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <InventoryTable
            onRefresh={refreshKey}
            searchQuery={searchQuery}
            readOnly={readOnlyInventory}
          />
        </CardContent>
      </Card>

      {/* Add Roll Dialog */}
      {!readOnlyInventory && (
        <RollFormDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          roll={null}
          onSuccess={handleAddSuccess}
        />
      )}
    </div>
  );
}
