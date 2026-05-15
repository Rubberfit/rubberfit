"use client"

import * as React from "react"

import { DataTable, EmptyState, type ColumnDef } from "@/app/components/patterns"

export interface MemberDto {
  membershipId: string
  profileId: string
  email: string | null
  fullName: string | null
  roles: string[]
  createdAt: string
}

interface MembersTableProps {
  rows: ReadonlyArray<MemberDto>
}

export function MembersTable({ rows }: MembersTableProps) {
  const columns: ColumnDef<MemberDto>[] = [
    {
      id: "name",
      header: "Name",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.fullName ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            {row.email ?? "—"}
          </span>
        </div>
      ),
      sortFn: (row) => row.fullName ?? row.email ?? "",
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
      id: "joined",
      header: "Joined",
      cell: (row) => new Date(row.createdAt).toLocaleDateString(),
      sortFn: (row) => row.createdAt,
      defaultSort: "asc",
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Current members
        </h2>
        <p className="text-sm text-muted-foreground">
          Active memberships in this workspace.
        </p>
      </header>
      {rows.length === 0 ? (
        <EmptyState
          title="No members yet"
          description="Once an invitation is accepted, the new member appears here."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.membershipId}
          density="compact"
        />
      )}
    </section>
  )
}
