"use client"

import { Edit, UserCheck, UserX } from "lucide-react"
import { formatDistanceToNow, parseISO } from "date-fns"

import type { UserProfile } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Badge } from "@/app/components/ui/badge"

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  supervisor: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  cutter: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  member: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  viewer: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
}

function RoleBadge({ role }: { role: string }) {
  const colorClass = ROLE_COLORS[role] ?? ROLE_COLORS.viewer
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorClass}`}
    >
      {role}
    </span>
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
  onEdit: (user: UserProfile) => void
  onDeactivate: (user: UserProfile) => void
  onReactivate: (user: UserProfile) => void
}

export function UsersTable({
  users,
  isLoading,
  currentUserId,
  onEdit,
  onDeactivate,
  onReactivate,
}: UsersTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>User List</CardTitle>
        <CardDescription>
          {users.length} user{users.length !== 1 ? "s" : ""} found
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sign In</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading users…
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const isSelf = user.id === currentUserId
                  return (
                    <TableRow
                      key={user.id}
                      className={user.is_deleted ? "opacity-50" : undefined}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {user.full_name ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        {isSelf && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{user.email ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(user.roles ?? []).map((role) => (
                            <RoleBadge key={role} role={role} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_deleted ? "secondary" : "default"}>
                          {user.is_deleted ? "Deactivated" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {relativeTime(user.last_sign_in_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {relativeTime(user.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(user)}
                            className="min-h-[36px] min-w-[36px]"
                            title="Edit user"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {user.is_deleted ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onReactivate(user)}
                              className="min-h-[36px] min-w-[36px] hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950"
                              title="Reactivate user"
                              disabled={isSelf}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDeactivate(user)}
                              className="min-h-[36px] min-w-[36px] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                              title="Deactivate user"
                              disabled={isSelf}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
