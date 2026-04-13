"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { BadgeCheck, Bell, LogOut } from "lucide-react"
import { useAuth } from "@/app/contexts/AuthContext"

import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { cn, getInitials } from "@/app/lib/utils"

export function AccountSwitcher({
  users,
}: {
  readonly users: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly email: string
    readonly avatar: string
    readonly role: string
  }>
}) {
  const [activeUserId, setActiveUserId] = useState(() => users[0]?.id ?? null)
  const { signOut } = useAuth()
  const router = useRouter()
  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0] ?? null

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const handleAccountClick = () => {
    router.push("/dashboard/account")
  }

  const handleNotificationsClick = () => {
    router.push("/dashboard/notifications")
  }

  if (!activeUser) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-9 rounded-lg">
          <AvatarImage
            src={activeUser.avatar ?? undefined}
            alt={activeUser.name}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
          <AvatarFallback className="rounded-lg">{getInitials(activeUser.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 space-y-1 rounded-lg"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        {users.map((user) => (
          <DropdownMenuItem
            key={user.email}
            className={cn(
              "p-0",
              user.id === activeUser.id && "border-l-2 border-l-primary bg-accent/50"
            )}
            onClick={() => setActiveUserId(user.id)}
          >
            <div className="flex w-full items-center justify-between gap-2 px-1 py-1.5">
              <Avatar className="size-9 rounded-lg">
                <AvatarImage
                  src={user.avatar ?? undefined}
                  alt={user.name}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs capitalize">{user.role}</span>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleAccountClick}>
            <BadgeCheck />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleNotificationsClick}>
            <Bell />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
