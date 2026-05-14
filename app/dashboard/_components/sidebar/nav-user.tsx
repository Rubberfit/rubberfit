"use client"

import {
  Check,
  CircleUser,
  EllipsisVertical,
  LogOut,
  MessageSquareDot,
  ShieldCheck,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { setLocale as setLocaleAction } from "@/app/actions/locale"
import { LOCALES, type AppLocale } from "@/app/i18n/routing"

import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/app/components/ui/sidebar"
import { useAuth } from "@/app/contexts/AuthContext"
import { getInitials } from "@/app/lib/utils"

export function NavUser({
  user,
}: {
  readonly user: {
    readonly name: string
    readonly email: string
    readonly avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const { signOut, user: authUser } = useAuth()
  const router = useRouter()
  const currentLocale = useLocale()
  const tLocale = useTranslations("settings.avatarMenu")
  const [, startLocaleTransition] = useTransition()

  const isAdminPanelVisible = authUser?.isSuperAdmin === true

  const handleLocaleChange = (next: AppLocale) => {
    if (next === currentLocale) return
    startLocaleTransition(async () => {
      await setLocaleAction({ locale: next })
      router.refresh()
    })
  }

  const localeLabel = (locale: AppLocale): string => {
    switch (locale) {
      case "en-US":
        return tLocale("english")
      case "es-MX":
        return tLocale("spanish")
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const handleAccountClick = () => {
    router.push("/dashboard/settings/profile")
  }

  const handleNotificationsClick = () => {
    router.push("/dashboard/notifications")
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage
                  src={user.avatar || undefined}
                  alt={user.name}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={user.avatar || undefined}
                    alt={user.name}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                  <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleAccountClick}>
                <CircleUser />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNotificationsClick}>
                <MessageSquareDot />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {isAdminPanelVisible && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/admin")}>
                    <ShieldCheck />
                    Admin Panel
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-[10px] uppercase tracking-[0.22em] font-medium">
              {tLocale("languageHeader")}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {LOCALES.map((locale) => (
                <DropdownMenuItem
                  key={locale}
                  onClick={() => handleLocaleChange(locale)}
                  className="justify-between"
                >
                  <span>{localeLabel(locale)}</span>
                  {currentLocale === locale ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="w-3.5" aria-hidden />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
