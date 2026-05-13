"use client"

import * as React from "react"

import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { cn } from "@/app/lib/utils"

interface PendingInvite {
  id: string
  email: string
  role: "admin" | "member"
  sentAt: string
}

interface PendingInvitesListProps {
  invites: PendingInvite[]
  onResend: (id: string) => void
  onRevoke: (id: string) => void
  readOnly?: boolean
}

export function PendingInvitesList({
  invites,
  onResend,
  onRevoke,
  readOnly = false,
}: PendingInvitesListProps) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="rounded-xl border border-border-subtle bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl p-4 hover:bg-muted/30"
      >
        <span className="text-sm font-medium text-foreground">
          Pending invites ({invites.length})
        </span>
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("text-muted-foreground transition-transform", expanded && "rotate-180")}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-border-subtle">
          {invites.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No pending invites.
            </div>
          ) : (
            invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between border-b border-border-subtle px-4 py-3 last:border-0"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{invite.email}</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                        invite.role === "admin"
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {invite.role === "admin" ? "Admin" : "Member"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Sent {new Date(invite.sentAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {!readOnly && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Invite actions"
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
                      <DropdownMenuItem onClick={() => onResend(invite.id)}>
                        Resend
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onRevoke(invite.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
