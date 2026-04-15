"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Users } from "lucide-react"

interface User {
  id: string
  full_name: string | null
  email: string | null
}

interface UserSelectProps {
  users: User[]
  selectedUserId: string | null
  currentUserId: string | null
  onUserChange: (userId: string | null) => void
}

function truncateEmail(email: string | null, maxLen = 24): string {
  if (!email) return ""
  return email.length > maxLen ? email.slice(0, maxLen - 1) + "…" : email
}

export function UserSelect({
  users,
  selectedUserId,
  currentUserId,
  onUserChange,
}: UserSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select
        value={selectedUserId ?? "all"}
        onValueChange={(value) => onUserChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select user" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Cutters</SelectItem>
          {users.map((u) => {
            const isMe = u.id === currentUserId
            const shortEmail = u.email ? truncateEmail(u.email) : null
            const displayName = u.full_name ?? shortEmail ?? u.id.slice(0, 8)
            
            return (
              <SelectItem key={u.id} value={u.id}>
                <div className="flex flex-col leading-tight">
                  <span>
                    {displayName}
                    {isMe && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  {shortEmail && shortEmail !== displayName && (
                    <span className="text-xs text-muted-foreground">{shortEmail}</span>
                  )}
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
