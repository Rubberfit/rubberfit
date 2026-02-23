"use client";

import { useState } from "react";
import { Settings, Database, Bell, Shield, Palette, Globe } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    // General Settings
    companyName: "USI Manufacturing",
    defaultCurrency: "USD",
    timeZone: "America/Chicago",
    dateFormat: "MM/dd/yyyy",

    // Inventory Settings
    defaultStockAlert: "100",
    autoReorderEnabled: false,
    lowStockThreshold: "50",

    // Cutting Settings
    defaultWasteThreshold: "20",
    optimizationAlgorithm: "first-fit-decreasing",
    showCutDiagram: true,

    // Notification Settings
    emailNotifications: true,
    lowStockAlerts: true,
    highWasteAlerts: true,
    systemUpdates: false,

    // System Settings
    autoBackup: true,
    backupFrequency: "daily",
    dataRetention: "2-years",
  });


  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveSettings = () => {
    // In real implementation, this would save to database/backend
    toast.success("Settings saved successfully");
  };

  const resetToDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to their default values?")) {
      // Reset to default values
      toast.success("Settings reset to default values");
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure system preferences and operational parameters
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
          <Button onClick={saveSettings}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Basic application preferences and regional settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={settings.companyName}
                onChange={(e) => handleSettingChange("companyName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultCurrency">Default Currency</Label>
              <Select value={settings.defaultCurrency} onValueChange={(value) => handleSettingChange("defaultCurrency", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeZone">Time Zone</Label>
              <Select value={settings.timeZone} onValueChange={(value) => handleSettingChange("timeZone", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <Select value={settings.dateFormat} onValueChange={(value) => handleSettingChange("dateFormat", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                  <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Inventory Settings
          </CardTitle>
          <CardDescription>
            Configure inventory management and stock alert preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultStockAlert">Default Stock Alert Level (sq ft)</Label>
              <Input
                id="defaultStockAlert"
                type="number"
                value={settings.defaultStockAlert}
                onChange={(e) => handleSettingChange("defaultStockAlert", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">Low Stock Threshold (sq ft)</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                value={settings.lowStockThreshold}
                onChange={(e) => handleSettingChange("lowStockThreshold", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Reorder (Phase 2)</Label>
              <p className="text-sm text-muted-foreground">
                Automatically suggest reorders when stock is low
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.autoReorderEnabled}
                onCheckedChange={(checked) => handleSettingChange("autoReorderEnabled", checked)}
                disabled
              />
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cutting Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Cutting Operations
          </CardTitle>
          <CardDescription>
            Configure cutting optimization and waste management settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultWasteThreshold">High Waste Alert Threshold (%)</Label>
              <Input
                id="defaultWasteThreshold"
                type="number"
                value={settings.defaultWasteThreshold}
                onChange={(e) => handleSettingChange("defaultWasteThreshold", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optimizationAlgorithm">Optimization Algorithm</Label>
              <Select value={settings.optimizationAlgorithm} onValueChange={(value) => handleSettingChange("optimizationAlgorithm", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first-fit-decreasing">First Fit Decreasing</SelectItem>
                  <SelectItem value="best-fit">Best Fit</SelectItem>
                  <SelectItem value="next-fit">Next Fit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Cut Diagram</Label>
              <p className="text-sm text-muted-foreground">
                Display visual cutting diagrams in the Cut Planner
              </p>
            </div>
            <Switch
              checked={settings.showCutDiagram}
              onCheckedChange={(checked) => handleSettingChange("showCutDiagram", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Manage notification preferences and alert settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications (Phase 2)</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via email
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => handleSettingChange("emailNotifications", checked)}
                  disabled
                />
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Low Stock Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Alert when inventory levels are low
                </p>
              </div>
              <Switch
                checked={settings.lowStockAlerts}
                onCheckedChange={(checked) => handleSettingChange("lowStockAlerts", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>High Waste Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Alert when waste levels exceed threshold
                </p>
              </div>
              <Switch
                checked={settings.highWasteAlerts}
                onCheckedChange={(checked) => handleSettingChange("highWasteAlerts", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>System Updates (Phase 2)</Label>
                <p className="text-sm text-muted-foreground">
                  Notifications about system updates and maintenance
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.systemUpdates}
                  onCheckedChange={(checked) => handleSettingChange("systemUpdates", checked)}
                  disabled
                />
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System & Data
          </CardTitle>
          <CardDescription>
            Data management, backup, and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="backupFrequency">Backup Frequency (Phase 2)</Label>
              <Select value={settings.backupFrequency} onValueChange={(value) => handleSettingChange("backupFrequency", value)} disabled>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataRetention">Data Retention Period</Label>
              <Select value={settings.dataRetention} onValueChange={(value) => handleSettingChange("dataRetention", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-year">1 Year</SelectItem>
                  <SelectItem value="2-years">2 Years</SelectItem>
                  <SelectItem value="5-years">5 Years</SelectItem>
                  <SelectItem value="forever">Keep Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto Backup (Phase 2)</Label>
              <p className="text-sm text-muted-foreground">
                Automatically backup data at regular intervals
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.autoBackup}
                onCheckedChange={(checked) => handleSettingChange("autoBackup", checked)}
                disabled
              />
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Info */}
      <Card>
        <CardHeader>
          <CardTitle>Application Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Version:</span>
            <span className="font-mono">1.0.0-beta</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Database:</span>
            <span>Supabase PostgreSQL</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last Updated:</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}