"use client"

import { Edit, UserCheck, UserX } from "lucide-react"
import { formatDistanceToNow, parseISO } from "date-fns"

import type { UserProfile } from "@/src/infrastructure/models/supabase"
import { Button } from "@/app/components/ui/button"
import {
  DataTable,
  initialSortState,
  useTableSort,
  type ColumnDef,
} from "@/app/components/patterns/data-table"
import { EmptyState } from "@/app/components/patterns/empty-state"
import { StatusBadge, type StatusBadgeProps } from "@/app/components/patterns/status-badge"

const ROLE_INTENT: Record<string, NonNullable<StatusBadgeProps["intent"]>> = {
  admin: "danger",
  manager: "info",
  supervisor: "accent",
  cutter: "warning",
  member: "success",
  viewer: "neutral",
}

function RoleBadge({ role }: { role: string }) {
  const intent = ROLE_INTENT[role] ?? "neutral"
  return (
    <StatusBadge intent={intent} className="capitalize">
      {role}
    </StatusBadge>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never"
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return "Unknown"
  }
}

interface UsersTableProps {
  users: UserProfile[]
  isLoading: boolean
  currentUserId: string | null
  /** When set, that user's Reactivate button shows a pending state and ignores clicks. */
  reactivatingUserId?: string | null
  onInvite: () => void
  onEdit: (user: UserProfile) => void
  onDeactivate: (user: UserProfile) => void
  onReactivate: (user: UserProfile) => void
}

export function UsersTable({
  users,
  isLoading,
  currentUserId,
  reactivatingUserId,
  onInvite,
  onEdit,
  onDeactivate,
  onReactivate,
}: UsersTableProps) {
  const [sort, setSort] = useTableSort({
    ...initialSortState,
    columnId: "name",
    direction: "asc",
  })

  const columns: ColumnDef<UserProfile>[] = [
    {
      id: "name",
      header: "Name",
      cell: (row) => {
        const isSelf = row.id === currentUserId
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {row.full_name ?? <span className="text-muted-foreground">—</span>}
              </span>
              {isSelf ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  You
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">{row.email ?? "—"}</p>
          </div>
        )
      },
      sortFn: (row) => row.full_name?.toLowerCase() ?? "",
      defaultSort: "asc",
      className: "min-w-0 max-w-[40%]",
    },
    {
      id: "roles",
      header: "Roles",
      cell: (row) => {
        const roles = row.roles ?? []
        return (
          <div className="flex flex-wrap gap-1">
            {roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              roles.map((role) => <RoleBadge key={role} role={role} />)
            )}
          </div>
        )
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          intent={row.is_inaccessible ? "neutral" : "success"}
          variant={row.is_inaccessible ? "outline" : "solid"}
        >
          {row.is_inaccessible ? "Deactivated" : "Active"}
        </StatusBadge>
      ),
      sortFn: (row) => (row.is_inaccessible ? 1 : 0),
    },
    {
      id: "last_sign_in",
      header: "Last sign-in",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{relativeTime(row.last_sign_in_at)}</span>
      ),
      sortFn: (row) =>
        row.last_sign_in_at ? new Date(row.last_sign_in_at).getTime() : Number.MIN_SAFE_INTEGER,
      defaultSort: "desc",
    },
    {
      id: "joined",
      header: "Joined",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{relativeTime(row.created_at)}</span>
      ),
      sortFn: (row) =>
        row.created_at ? new Date(row.created_at).getTime() : Number.MIN_SAFE_INTEGER,
      defaultSort: "desc",
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => {
        const isSelf = row.id === currentUserId
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.stopPropagation()
                onEdit(row)
              }}
              aria-label={`Edit ${row.full_name ?? row.email ?? "user"}`}
            >
              <Edit className="size-3.5" aria-hidden="true" />
            </Button>
            {row.is_inaccessible ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event.stopPropagation()
                  onReactivate(row)
                }}
                disabled={isSelf || reactivatingUserId === row.id}
                aria-label={`Reactivate ${row.full_name ?? row.email ?? "user"}`}
              >
                <UserCheck className="size-3.5" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeactivate(row)
                }}
                disabled={isSelf}
                aria-label={`Deactivate ${row.full_name ?? row.email ?? "user"}`}
              >
                <UserX className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        )
      },
      align: "right",
      className: "w-[120px]",
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={users}
      rowKey={(row) => row.id}
      density="comfortable"
      isLoading={isLoading}
      sort={sort}
      onSortChange={setSort}
      rowClassName={(row) => (row.is_inaccessible ? "opacity-60" : undefined)}
      empty={
        <EmptyState
          variant="blank"
          title="No users yet"
          description="Invite your first teammate to start collaborating."
          primaryAction={<Button onClick={onInvite}>Invite user</Button>}
        />
      }
    />
  )
}
