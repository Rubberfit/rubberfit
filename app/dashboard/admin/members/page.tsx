import "reflect-metadata"
import "@/di/di-registration"
import { container } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import {
  loadTenantMembers,
  loadTenantName,
  type TenantMember,
} from "@/src/infrastructure/services/active-tenant.service"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { PageHeader, PageShell } from "@/app/components/patterns"

import { InviteMemberForm } from "./_components/invite-member-form"
import {
  PendingInvitationsTable,
  type PendingInvitationDto,
} from "./_components/pending-invitations-table"
import { MembersTable, type MemberDto } from "./_components/members-table"

/**
 * Admin members surface — Phase 6 of ARC-25 invitation rollout.
 *
 * Lists current tenant members alongside any pending (active and not
 * yet accepted/revoked) invitations. Admins invite new members by
 * email, can resend a pending invite, and can revoke before
 * acceptance.
 */
export default async function AdminMembersPage() {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMembers")

  if (!actor.activeTenantId) {
    return (
      <PageShell variant="form">
        <PageHeader
          crumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Members" },
          ]}
          title="Members"
          subtitle="Pick a workspace from the tenant chooser to manage its members."
        />
      </PageShell>
    )
  }

  const client = await getDatabaseClient()
  const invitationService = container.resolve<IInvitationService>(TOKENS.IInvitationService)

  const [tenantName, members, pending] = await Promise.all([
    loadTenantName(client, actor.activeTenantId),
    loadTenantMembers(client, actor.activeTenantId),
    invitationService.listPending(actor.activeTenantId),
  ])

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Members" },
        ]}
        title="Members"
        subtitle={`Invite, resend, and revoke for ${tenantName ?? "your workspace"}.`}
      />

      <div className="mt-6 space-y-10">
        <InviteMemberForm />
        <PendingInvitationsTable rows={pending.map(toPendingDto)} />
        <MembersTable rows={members.map(toMemberDto)} />
      </div>
    </PageShell>
  )
}

function toPendingDto(
  invitation: Awaited<ReturnType<IInvitationService["listPending"]>>[number]
): PendingInvitationDto {
  const snapshot = invitation.toJSON()
  return {
    id: snapshot.id,
    email: snapshot.email,
    roles: [...snapshot.roles],
    expiresAt: snapshot.expiresAt,
    lastSendAttemptAt: snapshot.lastSendAttemptAt,
    lastSendError: snapshot.lastSendError,
    createdAt: snapshot.createdAt,
  }
}

function toMemberDto(member: TenantMember): MemberDto {
  return {
    membershipId: member.membershipId,
    profileId: member.profileId,
    email: member.email,
    fullName: member.fullName,
    roles: member.roles,
    createdAt: member.createdAt,
  }
}
