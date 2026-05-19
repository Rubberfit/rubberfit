"use client"

import * as React from "react"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { PageShell } from "@/app/components/patterns"
import { type ColumnDef, DataTable } from "@/app/components/patterns/data-table"
import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { cn } from "@/app/lib/utils"
import { resendInvitation, revokeInvitation } from "@/app/actions/team"

import { ChangeRoleDialog } from "./change-role-dialog"
import { InviteTeammateSheet } from "./invite-teammate-sheet"
import { PendingInvitesList } from "./pending-invites-list"
import { RemoveMemberDialog } from "./remove-member-dialog"
import { SeatBumpDialog } from "./seat-bump-dialog"
import { SeatCapReachedDialog } from "./seat-cap-reached-dialog"
import { SeatMeter } from "./seat-meter"

export type TeamMember = {
  id: string
  userId: string
  fullName: string | null
  email: string | null
  avatarUrl: string | null
  role: "owner" | "admin" | "member"
  status: "active" | "deactivated" | "removed"
  lastActiveAt: string | null
}

export type PendingInvite = {
  id: string
  email: string
  role: "admin" | "member"
  sentAt: string
}

export type SeatUsage = {
  purchased: number
  used: number
  available: number
}

export type SubscriptionPricing = {
  planTier: "standard" | "pro" | "max" | "enterprise"
  billingInterval: "monthly" | "annual"
  pricePerSeatPerMonth: number
  currency: "USD"
}

interface TeamClientProps {
  currentUserId: string
  currentUserRole: "owner" | "admin" | "member"
  members: TeamMember[]
  pendingInvites: PendingInvite[]
  seatUsage: SeatUsage
  pricing: SubscriptionPricing
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return new Date(iso).toLocaleDateString()
}

function initials(fullName: string | null, email: string | null): string {
  const source = fullName ?? email ?? "?"
  return source
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function TeamClient({
  currentUserId,
  currentUserRole,
  members,
  pendingInvites,
  seatUsage,
  pricing,
}: TeamClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [inviteSheetOpen, setInviteSheetOpen] = React.useState(false)
  const [seatCapOpen, setSeatCapOpen] = React.useState(false)
  const [seatBumpOpen, setSeatBumpOpen] = React.useState(false)
  const [changeRoleOpen, setChangeRoleOpen] = React.useState(false)
  const [changeRoleMember, setChangeRoleMember] = React.useState<TeamMember | null>(null)
  const [removeOpen, setRemoveOpen] = React.useState(false)
  const [removeMember, setRemoveMember] = React.useState<TeamMember | null>(null)

  const isReadOnly = currentUserRole === "member"
  const activeMembers = members.filter((m) => m.status === "active")
  const hasOnlyOwner = activeMembers.length === 1 && activeMembers[0]?.role === "owner"

  function handleInviteClick() {
    if (seatUsage.available === 0) {
      setSeatCapOpen(true)
    } else {
      setInviteSheetOpen(true)
    }
  }

  function handleResend(id: string) {
    startTransition(async () => {
      const result = await resendInvitation({ invitationId: id })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Invite resent")
        router.refresh()
      }
    })
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeInvitation({ invitationId: id })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Invite revoked")
        router.refresh()
      }
    })
  }

  const memberColumns: ReadonlyArray<ColumnDef<TeamMember>> = [
    {
      id: "name",
      header: "Name",
      cell: (row) => {
        const isDeactivated = row.status === "deactivated"
        return (
          <div className={cn("flex items-center gap-3", isDeactivated && "opacity-60")}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
              {initials(row.fullName, row.email)}
            </div>
            <span className="text-sm font-medium text-foreground">{row.fullName ?? "—"}</span>
          </div>
        )
      },
      sortFn: (row) => row.fullName ?? row.email ?? "",
    },
    {
      id: "email",
      header: "Email",
      cell: (row) => (
        <span
          className={cn(
            "text-sm text-muted-foreground",
            row.status === "deactivated" && "opacity-60"
          )}
        >
          {row.email ?? "—"}
        </span>
      ),
      sortFn: (row) => row.email ?? "",
    },
    {
      id: "role",
      header: "Role",
      cell: (row) => {
        if (row.status === "deactivated") {
          return (
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Deactivated
            </span>
          )
        }
        if (row.role === "owner") {
          return (
            <span className="inline-flex items-center rounded-md bg-[var(--accent-fg)] px-2 py-0.5 text-xs font-medium text-white">
              Owner
            </span>
          )
        }
        if (row.role === "admin") {
          return (
            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              Admin
            </span>
          )
        }
        return (
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            Member
          </span>
        )
      },
    },
    {
      id: "lastActive",
      header: "Last active",
      cell: (row) => (
        <span
          className={cn(
            "text-sm text-muted-foreground",
            row.status === "deactivated" && "opacity-60"
          )}
        >
          {row.lastActiveAt ? formatRelativeTime(row.lastActiveAt) : "Never"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        if (row.status === "deactivated") return null
        const disabled = row.role === "owner" || row.userId === currentUserId || isReadOnly
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Member actions"
                disabled={disabled}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={disabled}
                onClick={() => {
                  setChangeRoleMember(row)
                  setChangeRoleOpen(true)
                }}
              >
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={disabled}
                onClick={() => {
                  setRemoveMember(row)
                  setRemoveOpen(true)
                }}
                className="text-destructive focus:text-destructive"
              >
                Remove from workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <PageShell variant="dense">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage seats, invites, and roles.</p>
        </div>
        {!isReadOnly && (
          <Button
            className={cn(
              "rounded-lg bg-[var(--accent-fg)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-fg)]/90",
              seatUsage.available === 0 && "opacity-50"
            )}
            onClick={handleInviteClick}
          >
            Invite teammate
          </Button>
        )}
      </div>

      <div className="mt-8">
        <SeatMeter
          used={seatUsage.used}
          total={seatUsage.purchased}
          onManageSeats={isReadOnly ? () => undefined : () => setSeatBumpOpen(true)}
          showManage={!isReadOnly}
        />
      </div>

      {hasOnlyOwner ? (
        <div className="mt-8 w-full rounded-xl border border-border-subtle bg-white/60 p-10 text-center shadow-sm backdrop-blur-sm">
          <p className="text-base font-medium text-foreground">
            Invite teammates to start collaborating
          </p>
          {!isReadOnly && (
            <Button
              className="mt-4 rounded-lg bg-[var(--accent-fg)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-fg)]/90"
              onClick={handleInviteClick}
            >
              Invite teammate
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-8">
          <DataTable<TeamMember>
            columns={memberColumns}
            rows={members}
            rowKey={(row) => row.id}
            density="comfortable"
          />
        </div>
      )}

      <div className="mt-8">
        <PendingInvitesList
          invites={pendingInvites}
          onResend={handleResend}
          onRevoke={handleRevoke}
          readOnly={isReadOnly}
        />
      </div>

      <InviteTeammateSheet open={inviteSheetOpen} onOpenChange={setInviteSheetOpen} />
      <SeatCapReachedDialog
        open={seatCapOpen}
        onOpenChange={setSeatCapOpen}
        purchased={seatUsage.purchased}
        used={seatUsage.used}
        onAddSeat={() => {
          setSeatCapOpen(false)
          setSeatBumpOpen(true)
        }}
      />
      <SeatBumpDialog
        open={seatBumpOpen}
        onOpenChange={setSeatBumpOpen}
        currentCount={seatUsage.purchased}
        used={seatUsage.used}
        pricePerSeat={pricing.pricePerSeatPerMonth}
        currency={pricing.currency}
      />
      <ChangeRoleDialog
        open={changeRoleOpen}
        onOpenChange={setChangeRoleOpen}
        memberId={changeRoleMember?.id ?? null}
        memberName={changeRoleMember?.fullName ?? null}
        currentRole={
          changeRoleMember && changeRoleMember.role !== "owner" ? changeRoleMember.role : null
        }
      />
      <RemoveMemberDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        memberId={removeMember?.id ?? null}
        memberName={removeMember?.fullName ?? null}
      />
    </PageShell>
  )
}
