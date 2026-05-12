"use client"

import { Check, Minus } from "lucide-react"

import { PERMISSIONS } from "@/src/application/permissions"
import { FormFieldset, FormSectionHeader } from "@/app/components/ui/forms"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

import { MATRIX_PERMISSIONS, MATRIX_ROLES } from "./mock-data"

/**
 * Read-only role × permission matrix rendered straight from the
 * canonical `PERMISSIONS` map in `src/application/permissions.ts`.
 * Phase 2 PR 5 ships visual-only; the editable matrix lands when
 * RBAC server actions are wired (tracked under
 * `TODO(ARC-DASHBOARD-AUDIT)`).
 */
export function RolesMatrixSection() {
  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Roles & permissions"
        title="What each role can do"
        description="Read-only view of the canonical permissions map. Edits are gated until the RBAC server actions wire-up (S6 task)."
      />
      <div className="mt-6 overflow-x-auto rounded-md border border-border-subtle">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Permission
              </TableHead>
              {MATRIX_ROLES.map((role) => (
                <TableHead
                  key={role}
                  className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
                >
                  {role}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {MATRIX_PERMISSIONS.map(({ permission, label, category }) => {
              const allowed = PERMISSIONS[permission] as ReadonlyArray<string>
              return (
                <TableRow key={permission}>
                  <TableCell className="min-w-[220px]">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {category}
                    </p>
                  </TableCell>
                  {MATRIX_ROLES.map((role) => {
                    const granted = allowed.includes(role)
                    return (
                      <TableCell key={role} className="text-center">
                        {granted ? (
                          <Check
                            className="mx-auto size-4 text-foreground"
                            aria-label={`${role} has ${label}`}
                          />
                        ) : (
                          <Minus
                            className="mx-auto size-4 text-muted-foreground/40"
                            aria-label={`${role} does not have ${label}`}
                          />
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </FormFieldset>
  )
}
