"use client"

import { User, Camera } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { getInitials } from "@/lib/utils"

interface ProfileCardProps {
  user: { name?: string | null; email: string; avatar?: string | null; id: string }
  avatarUrl: string
  profileData: { name: string; email: string }
  isLoading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onProfileDataChange: (data: { name: string; email: string }) => void
  onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onProfileSave: () => void
}

export function ProfileCard({
  user,
  avatarUrl,
  profileData,
  isLoading,
  fileInputRef,
  onProfileDataChange,
  onAvatarUpload,
  onProfileSave,
}: ProfileCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
        <CardDescription>Update your personal information and preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl} alt={user.name || user.email} />
            <AvatarFallback className="text-lg">
              {getInitials(user.name || user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onAvatarUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              {isLoading ? "Uploading..." : "Change Photo"}
            </Button>
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF or WEBP. Max 5MB.</p>
          </div>
        </div>

        <Separator />

        {/* Profile Form */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={profileData.name}
              onChange={(e) =>
                onProfileDataChange({
                  ...profileData,
                  name: e.target.value,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={profileData.email}
              disabled
              className="bg-muted"
            />
            <p className="text-sm text-muted-foreground">
              Email changes require verification (coming soon)
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={onProfileSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
