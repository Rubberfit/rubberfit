"use client"

import { Calendar } from "lucide-react"

import type { AuthUser } from "@/src/infrastructure/services/authService"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Label } from "@/app/components/ui/label"
import { Badge } from "@/app/components/ui/badge"

interface AccountInfoCardProps {
  user: Pick<AuthUser, "id" | "authProvider" | "createdAt">
}

export function AccountInfoCard({ user }: AccountInfoCardProps) {
  const provider = user.authProvider
  const signInMethod =
    provider === "google"
      ? "Google OAuth"
      : provider === "email"
        ? "Email & Password"
        : provider
          ? provider
              .split(/[_-]/)
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(" ")
          : "Unavailable"
  const memberSince = user.createdAt ? new Date(user.createdAt) : null
  const memberSinceLabel =
    memberSince && !Number.isNaN(memberSince.getTime()) ? memberSince.toLocaleDateString() : null

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
            <p className="text-sm mt-1">{signInMethod}</p>
          </div>
          {memberSinceLabel && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Member Since</Label>
              <p className="text-sm mt-1">{memberSinceLabel}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
