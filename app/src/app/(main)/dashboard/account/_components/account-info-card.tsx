"use client"

import { Calendar } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface AccountInfoCardProps {
  user: { id: string; avatar?: string | null }
}

export function AccountInfoCard({ user }: AccountInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Account Information
        </CardTitle>
        <CardDescription>View your account details and status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">User ID</Label>
            <p className="font-mono text-sm mt-1">{user.id}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Account Status</Label>
            <div className="mt-1">
              <Badge variant="default">Active</Badge>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Sign-In Method</Label>
            <p className="text-sm mt-1">
              {user.avatar?.includes("dicebear") ? "Email & Password" : "Google OAuth"}
            </p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Member Since</Label>
            <p className="text-sm mt-1">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
