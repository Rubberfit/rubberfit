"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { DataTable, EmptyState, type ColumnDef } from "@/app/components/patterns"
import { resendInvitation, revokeInvitation } from "@/app/actions/invitations"

export interface PendingInvitationDto {
  id: string
  email: string
  roles: string[]
  expiresAt: string
  lastSendAttemptAt: string | null
  lastSendError: string | null
  createdAt: string
}

interface PendingInvitationsTableProps {
  rows: ReadonlyArray<PendingInvitationDto>
}

type ActionKind = "resend" | "revoke"

export function PendingInvitationsTable({ rows }: PendingInvitationsTableProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState<{
    id: string
    kind: ActionKind
  } | null>(null)

  const isAnyPending = pending !== null

  const runResend = React.useCallback(
    async (id: string) => {
      setPending({ id, kind: "resend" })
      try {
        const result = await resendInvitation({ id })
        if (!result.ok) {
          toast.error("Resend failed", { description: result.error })
          return
        }
        if (result.emailSent) {
          toast.success("Invitation resent")
        } else {
          toast.warning("Email failed again", {
            description: result.emailError ?? "See last_send_error in DB",
          })
        }
        router.refresh()
      } catch (error) {
        toast.error("Resend failed", {
          description: error instanceof Error ? error.message : "Unexpected error",
        })
      } finally {
        setPending(null)
      }
    },
    [router]
  )

  const runRevoke = React.useCallback(
    async (id: string, email: string) => {
      if (!window.confirm(`Revoke the pending invitation for ${email}?`)) return
      setPending({ id, kind: "revoke" })
      try {
        const result = await revokeInvitation({ id })
        if (!result.ok) {
          toast.error("Revoke failed", { description: result.error })
          return
        }
        toast.success("Invitation revoked")
        router.refresh()
      } catch (error) {
        toast.error("Revoke failed", {
          description: error instanceof Error ? error.message : "Unexpected error",
        })
      } finally {
        setPending(null)
      }
    },
    [router]
  )

  const columns: ColumnDef<PendingInvitationDto>[] = [
    {
      id: "email",
      header: "Email",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.email}</span>
          {row.lastSendError && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="size-3" aria-hidden="true" />
              Last send failed: {row.lastSendError}
            </span>
          )}
        </div>
      ),
      sortFn: (row) => row.email,
    },
    {
      id: "roles",
      header: "Roles",
      cell: (row) => (
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {row.roles.join(", ")}
        </span>
      ),
    },
    {
      id: "expires",
      header: "Expires",
      cell: (row) => new Date(row.expiresAt).toLocaleDateString(),
      sortFn: (row) => row.expiresAt,
    },
    {
      id: "sent",
      header: "Last attempt",
      cell: (row) =>
        row.lastSendAttemptAt ? new Date(row.lastSendAttemptAt).toLocaleString() : "—",
      sortFn: (row) => row.lastSendAttemptAt ?? "",
    },
    {
      id: "created",
      header: "Created",
      cell: (row) => new Date(row.createdAt).toLocaleString(),
      sortFn: (row) => row.createdAt,
      defaultSort: "desc",
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runResend(row.id)}
            disabled={isAnyPending}
            aria-label={`Resend invitation to ${row.email}`}
          >
            <RefreshCw
              className={
                pending?.id === row.id && pending.kind === "resend"
                  ? "size-3.5 animate-spin"
                  : "size-3.5"
              }
              aria-hidden="true"
            />
            Resend
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runRevoke(row.id, row.email)}
            disabled={isAnyPending}
            aria-label={`Revoke invitation to ${row.email}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Revoke
          </Button>
        </div>
      ),
      className: "w-56",
      align: "right",
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">Pending invitations</h2>
        <p className="text-sm text-muted-foreground">
          Sent but not yet accepted. Resend re-dispatches the email; revoke cancels the token
          immediately.
        </p>
      </header>
      {rows.length === 0 ? (
        <EmptyState
          title="No pending invitations"
          description="Invite a new member above to populate this list."
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} density="compact" />
      )}
    </section>
  )
}
