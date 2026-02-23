"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type MaterialType } from "@/lib/supabase";
import { materialTypeService } from "@/services/materialTypeService";

export function MaterialTypesOverview() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMaterialTypes = async () => {
    try {
      const data = await materialTypeService.getAll();
      setMaterialTypes(data);
    } catch (error) {
      console.error("Error fetching material types:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterialTypes();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Material Types Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading material types...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Types Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {materialTypes.slice(0, 6).map((material) => (
            <div key={material.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{material.name}</p>
                <p className="text-xs text-muted-foreground">
                  {material.description || "No description"}
                </p>
              </div>
              <div className="text-right">
                <Badge variant="outline">
                  ${material.default_cost?.toFixed(2) || "N/A"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Alert: {material.min_stock_alert || 0} sq ft
                </p>
              </div>
            </div>
          ))}
          {materialTypes.length > 6 && (
            <p className="text-xs text-muted-foreground text-center pt-2 border-t">
              And {materialTypes.length - 6} more material types
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}